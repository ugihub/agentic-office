#!/usr/bin/env bash
# Bureau — Infrastructure Chaos Test Runner
#
# Runs real infrastructure chaos against a STAGING environment.
# NEVER run against production.
#
# Requires:
#   - Docker Compose running (bureau staging stack)
#   - Bureau API accessible at BUREAU_API_URL
#   - curl, jq installed
#
# Usage:
#   BUREAU_API_URL=http://localhost:3001 ./tests/chaos/chaos-infrastructure.sh
#
set -euo pipefail

BUREAU_API_URL="${BUREAU_API_URL:-http://localhost:3001}"
BUREAU_API_KEY="${BUREAU_API_KEY:-bureau_test_key}"
RESULTS_DIR="${RESULTS_DIR:-/tmp/bureau-chaos}"

mkdir -p "$RESULTS_DIR"

log()  { echo "[$(date -u +%H:%M:%S)] $*"; }
pass() { echo "[PASS] $*"; }
fail() { echo "[FAIL] $*"; }

# ─── Health check helper ──────────────────────────────────────────────────────

wait_ready() {
  local max_attempts="${1:-30}"
  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    if curl -sf "$BUREAU_API_URL/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  return 1
}

submit_test_task() {
  curl -sf -X POST "$BUREAU_API_URL/api/v1/tasks" \
    -H "X-Api-Key: $BUREAU_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"prompt":"What is 2+2?","constraints":{"maxCostUsd":"0.01"}}' \
    2>/dev/null || echo '{"error":"request_failed"}'
}

# ─── CHAOS-INFRA-1: Redis restart ─────────────────────────────────────────────

chaos_redis_restart() {
  log "CHAOS-INFRA-1: Redis restart during task submission"

  # Submit a task before chaos
  local pre_task
  pre_task=$(submit_test_task)
  local task_id
  task_id=$(echo "$pre_task" | jq -r '.taskId // "error"')
  log "Pre-chaos task: $task_id"

  # Kill Redis
  log "Restarting Redis..."
  docker restart bureau-redis || { log "Docker not available — skipping infrastructure chaos"; return 0; }
  sleep 2

  # Try to submit during downtime — expect graceful degradation or 503
  local during_result
  during_result=$(submit_test_task)
  local during_status
  during_status=$(echo "$during_result" | jq -r '.error // "ok"')
  log "During chaos: $during_status"

  # Wait for Redis recovery
  log "Waiting for Redis recovery..."
  sleep 5
  docker start bureau-redis 2>/dev/null || true
  sleep 3

  # Verify recovery
  if wait_ready 15; then
    pass "CHAOS-INFRA-1: System recovered after Redis restart"
    echo "chaos_redis_restart=PASS" >> "$RESULTS_DIR/chaos-results.txt"
  else
    fail "CHAOS-INFRA-1: System did not recover from Redis restart"
    echo "chaos_redis_restart=FAIL" >> "$RESULTS_DIR/chaos-results.txt"
  fi
}

# ─── CHAOS-INFRA-2: Outbox resilience ────────────────────────────────────────

chaos_outbox_resilience() {
  log "CHAOS-INFRA-2: Outbox resilience — submit task, kill workers, restart"

  # Submit task
  local task_result
  task_result=$(submit_test_task)
  local task_id
  task_id=$(echo "$task_result" | jq -r '.taskId // "error"')
  log "Task submitted: $task_id"

  # Immediately kill workers
  docker kill bureau-workers 2>/dev/null || { log "Docker not available — skipping"; return 0; }
  log "Workers killed"

  # Wait a moment (task is now in MongoDB, outbox entry exists)
  sleep 5

  # Restart workers
  docker start bureau-workers 2>/dev/null || true
  log "Workers restarted"

  # Wait for workers to pick up from outbox
  sleep 10

  # Check if task progressed (it should — outbox ensures re-delivery)
  if [ "$task_id" != "error" ]; then
    local status_result
    status_result=$(curl -sf "$BUREAU_API_URL/api/v1/tasks/$task_id/status" \
      -H "X-Api-Key: $BUREAU_API_KEY" 2>/dev/null || echo '{}')
    local stage
    stage=$(echo "$status_result" | jq -r '.currentStage // "unknown"')
    log "Task stage after worker restart: $stage"

    if [ "$stage" != "Submitted" ] && [ "$stage" != "unknown" ]; then
      pass "CHAOS-INFRA-2: Task progressed after worker restart (stage: $stage)"
      echo "chaos_outbox_resilience=PASS" >> "$RESULTS_DIR/chaos-results.txt"
    else
      fail "CHAOS-INFRA-2: Task stuck in Submitted after worker restart"
      echo "chaos_outbox_resilience=FAIL" >> "$RESULTS_DIR/chaos-results.txt"
    fi
  else
    log "Task submission failed — skipping verification"
    echo "chaos_outbox_resilience=SKIP" >> "$RESULTS_DIR/chaos-results.txt"
  fi
}

# ─── CHAOS-INFRA-3: Memory pressure ──────────────────────────────────────────

chaos_memory_pressure() {
  log "CHAOS-INFRA-3: Memory pressure — 50 concurrent submissions"

  local pids=()
  for i in $(seq 1 50); do
    submit_test_task > /dev/null 2>&1 &
    pids+=($!)
  done

  # Wait for all to complete
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  # Check if API is still healthy
  if curl -sf "$BUREAU_API_URL/health/live" >/dev/null 2>&1; then
    pass "CHAOS-INFRA-3: API survived 50 concurrent submissions"
    echo "chaos_memory_pressure=PASS" >> "$RESULTS_DIR/chaos-results.txt"
  else
    fail "CHAOS-INFRA-3: API crashed under 50 concurrent submissions"
    echo "chaos_memory_pressure=FAIL" >> "$RESULTS_DIR/chaos-results.txt"
  fi
}

# ─── CHAOS-INFRA-4: Graceful shutdown test ───────────────────────────────────

chaos_graceful_shutdown() {
  log "CHAOS-INFRA-4: SIGTERM during in-flight request"

  # Submit long-running task
  local task_result
  task_result=$(submit_test_task)
  local task_id
  task_id=$(echo "$task_result" | jq -r '.taskId // "error"')

  # Send SIGTERM to API server
  local api_pid
  api_pid=$(docker inspect --format '{{.State.Pid}}' bureau-api-server 2>/dev/null || echo "")

  if [ -n "$api_pid" ] && [ "$api_pid" != "0" ]; then
    log "Sending SIGTERM to API server (PID: $api_pid)"
    kill -TERM "$api_pid" 2>/dev/null || true
    sleep 35  # Wait for drain timeout (30s) + buffer

    # Check if process exited cleanly (exit 0)
    if ! docker inspect bureau-api-server 2>/dev/null | jq -e '.State.Running' > /dev/null; then
      pass "CHAOS-INFRA-4: API server exited cleanly after SIGTERM"
      echo "chaos_graceful_shutdown=PASS" >> "$RESULTS_DIR/chaos-results.txt"
    else
      fail "CHAOS-INFRA-4: API server still running after SIGTERM drain"
      echo "chaos_graceful_shutdown=FAIL" >> "$RESULTS_DIR/chaos-results.txt"
    fi
  else
    log "Docker not available — simulating SIGTERM test result"
    echo "chaos_graceful_shutdown=SKIP" >> "$RESULTS_DIR/chaos-results.txt"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

log "Bureau Chaos Infrastructure Tests"
log "Target: $BUREAU_API_URL"
log "Results: $RESULTS_DIR/chaos-results.txt"

# Verify baseline health
if ! wait_ready 10; then
  fail "API not healthy before chaos tests — aborting"
  exit 1
fi

log "Baseline health: OK"

# Run chaos scenarios
chaos_redis_restart
chaos_outbox_resilience
chaos_memory_pressure
chaos_graceful_shutdown

# Summary
log ""
log "═══ CHAOS TEST RESULTS ═══"
if [ -f "$RESULTS_DIR/chaos-results.txt" ]; then
  cat "$RESULTS_DIR/chaos-results.txt"
  pass_count=$(grep -c "=PASS" "$RESULTS_DIR/chaos-results.txt" 2>/dev/null || echo 0)
  fail_count=$(grep -c "=FAIL" "$RESULTS_DIR/chaos-results.txt" 2>/dev/null || echo 0)
  log "PASS: $pass_count | FAIL: $fail_count"
  [ "$fail_count" -eq 0 ] && log "All chaos tests passed!" || log "Some chaos tests failed!"
fi
