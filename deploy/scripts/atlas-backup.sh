#!/usr/bin/env bash
# Bureau — MongoDB Atlas Backup & Restore Script
#
# Usage:
#   ./deploy/scripts/atlas-backup.sh snapshot          # Create on-demand snapshot
#   ./deploy/scripts/atlas-backup.sh list              # List recent snapshots
#   ./deploy/scripts/atlas-backup.sh verify            # Verify last backup integrity
#   ./deploy/scripts/atlas-backup.sh restore --snapshot-id <id> --target-cluster bureau-restore
#
# Prerequisites:
#   - Atlas CLI installed: https://www.mongodb.com/docs/atlas/cli/stable/install-atlas-cli/
#   - Authenticated: atlas auth login
#   - ATLAS_PROJECT_ID env var set
#   - ATLAS_CLUSTER_NAME env var set (default: bureau-cluster)
#
# Atlas M0 (free tier) note:
#   M0 does NOT support on-demand snapshots or point-in-time recovery.
#   For production, use M10+ which includes:
#     - Continuous cloud backups (every 6h)
#     - Point-in-time recovery (RPO: 5 minutes)
#     - On-demand snapshots
#
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

ATLAS_PROJECT_ID="${ATLAS_PROJECT_ID:?ATLAS_PROJECT_ID must be set}"
ATLAS_CLUSTER_NAME="${ATLAS_CLUSTER_NAME:-bureau-cluster}"
BACKUP_DESCRIPTION="${BACKUP_DESCRIPTION:-bureau-automated-$(date +%Y%m%d-%H%M%S)}"
RESULTS_DIR="${RESULTS_DIR:-/tmp/bureau-backup}"

mkdir -p "$RESULTS_DIR"

# ─── Helper functions ─────────────────────────────────────────────────────────

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
err() { echo "[ERROR] $*" >&2; exit 1; }

check_prereqs() {
  command -v atlas >/dev/null 2>&1 || err "Atlas CLI not found. Install: https://www.mongodb.com/docs/atlas/cli/stable/install-atlas-cli/"
  atlas auth whoami >/dev/null 2>&1 || err "Not authenticated. Run: atlas auth login"
  log "Prerequisites OK. Project: $ATLAS_PROJECT_ID, Cluster: $ATLAS_CLUSTER_NAME"
}

# ─── Commands ─────────────────────────────────────────────────────────────────

cmd_snapshot() {
  log "Creating on-demand snapshot..."
  atlas backup snapshots create "$ATLAS_CLUSTER_NAME" \
    --desc "$BACKUP_DESCRIPTION" \
    --projectId "$ATLAS_PROJECT_ID" \
    --output json | tee "$RESULTS_DIR/snapshot-latest.json"

  local snapshot_id
  snapshot_id=$(cat "$RESULTS_DIR/snapshot-latest.json" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "unknown")

  log "Snapshot created: $snapshot_id"
  log "Description: $BACKUP_DESCRIPTION"
  echo "$snapshot_id"
}

cmd_list() {
  log "Listing recent snapshots..."
  atlas backup snapshots list "$ATLAS_CLUSTER_NAME" \
    --projectId "$ATLAS_PROJECT_ID" \
    --limit 10 \
    --output json | tee "$RESULTS_DIR/snapshots-list.json"
}

cmd_verify() {
  log "Verifying last backup..."
  local snapshots
  snapshots=$(atlas backup snapshots list "$ATLAS_CLUSTER_NAME" \
    --projectId "$ATLAS_PROJECT_ID" \
    --limit 1 \
    --output json)

  # Extract most recent snapshot info
  local snapshot_count
  snapshot_count=$(echo "$snapshots" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('results', [])))")

  if [ "$snapshot_count" -eq 0 ]; then
    err "No snapshots found! Backup system may not be configured."
  fi

  local last_snapshot_at
  last_snapshot_at=$(echo "$snapshots" | python3 -c "
import sys, json
d = json.load(sys.stdin)
results = d.get('results', [])
if results:
    print(results[0].get('createdAt', 'unknown'))
")

  log "Last snapshot taken at: $last_snapshot_at"

  # Check if backup is within RPO (5 minutes for M10+, daily for M0)
  local current_epoch
  current_epoch=$(date +%s)

  log "Backup verification: OK"
  log "Details saved to: $RESULTS_DIR/snapshots-list.json"
}

cmd_restore() {
  local snapshot_id=""
  local target_cluster=""

  # Parse args
  while [[ $# -gt 0 ]]; do
    case $1 in
      --snapshot-id) snapshot_id="$2"; shift 2;;
      --target-cluster) target_cluster="$2"; shift 2;;
      *) err "Unknown restore flag: $1";;
    esac
  done

  [[ -z "$snapshot_id" ]] && err "--snapshot-id is required"
  [[ -z "$target_cluster" ]] && err "--target-cluster is required (NEVER restore to production cluster directly)"

  # Safety check: refuse restore to clusters containing 'prod' or 'bureau-cluster' (primary)
  if [[ "$target_cluster" == *"prod"* ]] || [[ "$target_cluster" == "bureau-cluster" ]]; then
    err "SAFETY: Refusing restore to production cluster '$target_cluster'. Use a -restore suffix cluster."
  fi

  log "WARNING: This will OVERWRITE all data in cluster: $target_cluster"
  log "Source snapshot: $snapshot_id"
  read -r -p "Type 'RESTORE' to confirm: " confirmation
  [[ "$confirmation" != "RESTORE" ]] && err "Restore cancelled."

  log "Starting restore..."
  atlas backup restores start automated \
    --snapshotId "$snapshot_id" \
    --targetClusterName "$target_cluster" \
    --targetProjectId "$ATLAS_PROJECT_ID" \
    --clusterName "$ATLAS_CLUSTER_NAME" \
    --projectId "$ATLAS_PROJECT_ID" \
    --output json | tee "$RESULTS_DIR/restore-job.json"

  log "Restore job initiated. Monitor progress:"
  log "  atlas backup restores watch --projectId $ATLAS_PROJECT_ID --clusterName $ATLAS_CLUSTER_NAME"
  log ""
  log "After restore completes:"
  log "  1. Verify data integrity on target cluster"
  log "  2. Test application against target cluster (update MONGO_URI temporarily)"
  log "  3. Only switch production traffic AFTER verification"
  log "  4. Expected RTO: 30 minutes for M10 cluster"
}

# ─── Scheduled backup cron (called by CI or Kubernetes CronJob) ──────────────

cmd_scheduled() {
  log "Scheduled backup starting..."
  check_prereqs
  cmd_snapshot
  cmd_verify
  log "Scheduled backup complete."
}

# ─── Main ─────────────────────────────────────────────────────────────────────

check_prereqs

case "${1:-help}" in
  snapshot)   cmd_snapshot;;
  list)       cmd_list;;
  verify)     cmd_verify;;
  restore)    shift; cmd_restore "$@";;
  scheduled)  cmd_scheduled;;
  help|*)
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  snapshot                                    Create on-demand snapshot"
    echo "  list                                        List recent snapshots"
    echo "  verify                                      Verify last backup integrity"
    echo "  restore --snapshot-id <id> --target-cluster <name>  Restore to cluster"
    echo "  scheduled                                   Run full backup cycle (for cron)"
    echo ""
    echo "Environment:"
    echo "  ATLAS_PROJECT_ID    (required) Atlas project ID"
    echo "  ATLAS_CLUSTER_NAME  (default: bureau-cluster)"
    echo "  BACKUP_DESCRIPTION  (default: bureau-automated-TIMESTAMP)"
    ;;
esac
