/**
 * IT SSC Agent — infrastructure provisioning for task execution.
 *
 * Phase 2 scope: basic provisioner.
 * Provisions: AbortController, task correlation setup, worker slot allocation.
 */
import { type Result, ok, newId, EntityPrefix } from "@bureau/shared-kernel";
import type { ExecutionPath } from "@bureau/contracts";

export interface ProvisionedResources {
  correlationId: string;
  abortController: AbortController;
  workerSlots: number;
  provisionedAt: Date;
}

export interface ProvisionRequest {
  taskId: string;
  tenantId: string;
  executionPath: ExecutionPath;
}

/**
 * Provision resources for a task.
 * Returns correlationId, AbortController, and worker slot allocation.
 */
export function provisionTaskResources(
  request: ProvisionRequest,
): Result<ProvisionedResources, never> {
  const correlationId = newId(EntityPrefix.CORRELATION);
  const abortController = new AbortController();

  // Worker slot allocation by path
  const slotsByPath: Record<ExecutionPath, number> = {
    fast: 1,
    standard: 3,
    full: 5,
  };

  return ok({
    correlationId,
    abortController,
    workerSlots: slotsByPath[request.executionPath],
    provisionedAt: new Date(),
  });
}

/**
 * Cleanup resources after task completes/fails/cancels.
 * Abort any in-flight requests.
 */
export function cleanupTaskResources(resources: ProvisionedResources): void {
  if (!resources.abortController.signal.aborted) {
    resources.abortController.abort("Task completed or cancelled");
  }
}
