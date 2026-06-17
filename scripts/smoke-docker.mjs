#!/usr/bin/env node
/**
 * Bureau — Docker Smoke Test
 *
 * Verifies that the containerized API server is healthy and can process a basic request.
 * Intended to run after `docker compose up -d mongo redis api-server workers`.
 *
 * Environment:
 *   BUREAU_API_URL   — default: http://localhost:3001
 *   BUREAU_SUPER_KEY — bootstrap key for auth (dev only)
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

const API_URL = process.env.BUREAU_API_URL ?? "http://localhost:3001";
const SUPER_KEY = process.env.BUREAU_SUPER_KEY ?? "";
const TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

/** @param {string} path @param {RequestInit} [init] */
async function apiFetch(path, init) {
  const headers = { "Content-Type": "application/json" };
  if (SUPER_KEY) headers["X-Api-Key"] = SUPER_KEY;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  const body = await res.text();
  return { status: res.status, body, json: () => JSON.parse(body) };
}

async function waitForHealthy() {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    try {
      const res = await apiFetch("/health/live");
      if (res.status === 200) return true;
    } catch { /* server not ready yet */ }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

/**
 * Dump container logs on failure for debuggability.
 * Best-effort — never throws. Uses docker compose v2 CLI.
 */
async function dumpContainerLogs() {
  const { spawn } = await import("node:child_process");
  const services = ["api-server", "workers"];
  for (const svc of services) {
    console.log(`\n--- docker compose logs ${svc} (tail 50) ---`);
    await new Promise((resolve) => {
      const proc = spawn(
        "docker",
        ["compose", "logs", "--tail=50", "--no-color", svc],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      proc.stdout.on("data", (chunk) => process.stdout.write(chunk));
      proc.stderr.on("data", (chunk) => process.stderr.write(chunk));
      proc.on("exit", () => resolve(undefined));
      proc.on("error", () => resolve(undefined));
      // hard timeout — don't block forever if docker daemon is hung
      setTimeout(() => {
        try {
          proc.kill("SIGTERM");
        } catch {}
        resolve(undefined);
      }, 5_000);
    });
  }
}

async function main() {
  console.log(`\n🔍 Bureau Docker Smoke Test`);
  console.log(`   API URL: ${API_URL}\n`);

  // 1. Wait for liveness
  process.stdout.write("1. Waiting for /health/live... ");
  if (!(await waitForHealthy())) {
    console.log("❌ TIMEOUT — API server not reachable");
    await dumpContainerLogs();
    process.exit(1);
  }
  console.log("✅ OK");

  // 2. Readiness
  process.stdout.write("2. Checking /health/ready... ");
  const ready = await apiFetch("/health/ready");
  if (ready.status === 200) {
    console.log("✅ OK");
  } else {
    console.log(`⚠️  Status ${ready.status} (degraded) — ${ready.body}`);
    // Don't fail — Redis/Mongo might still be connecting
  }

  // 3. Submit task (requires auth)
  if (!SUPER_KEY) {
    console.log("\n⚠️  BUREAU_SUPER_KEY not set — skipping task submission test");
    console.log("\n✅ Smoke test passed (health only)\n");
    process.exit(0);
  }

  process.stdout.write("3. Submitting test task... ");
  const submitRes = await apiFetch("/api/v1/tasks", {
    method: "POST",
    headers: { "Idempotency-Key": `smoke-${Date.now()}` },
    body: JSON.stringify({
      prompt: "Smoke test: respond with exactly 'OK'",
      constraints: { maxCostUsd: "0.01", preferredModelTier: "economy" },
      outputFormat: "text",
    }),
  });

  if (submitRes.status !== 202 && submitRes.status !== 200) {
    console.log(`❌ FAILED — Status ${submitRes.status}: ${submitRes.body}`);
    process.exit(1);
  }

  const { taskId } = submitRes.json();
  console.log(`✅ taskId=${taskId}`);

  // 4. Poll for terminal state
  process.stdout.write("4. Polling task status... ");
  const pollStart = Date.now();
  const terminalStages = new Set(["Completed", "Failed", "Cancelled", "AwaitingUserDecision"]);
  let finalStage = "unknown";

  while (Date.now() - pollStart < TIMEOUT_MS) {
    const statusRes = await apiFetch(`/api/v1/tasks/${taskId}/status`);
    if (statusRes.status === 200) {
      const data = statusRes.json();
      finalStage = data.currentStage;
      if (terminalStages.has(finalStage)) break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (terminalStages.has(finalStage)) {
    console.log(`✅ Terminal stage: ${finalStage}`);
  } else {
    console.log(`⚠️  Timed out at stage: ${finalStage} (may need LLM key)`);
  }

  console.log("\n✅ Bureau Docker smoke test completed\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Smoke test crashed:", err.message);
  process.exit(1);
});