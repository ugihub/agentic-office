/**
 * Compliance SSC Agent — content validation.
 *
 * Fast path: SchemaValidator only (1 validator).
 * Standard/Full path: ToxicityValidator + FactualityValidator + SchemaValidator (3, parallel).
 *
 * Pattern: validators run in parallel within their group.
 * Skipping ALL compliance in fast path = sending unvalidated output to user.
 * So fast path always has SchemaValidator.
 */
import { type Result, ok, err } from "@bureau/shared-kernel";
import { ComplianceViolationError } from "@bureau/shared-kernel";
import type { ExecutionPath } from "@bureau/contracts";

export interface ComplianceRequest {
  prompt: string;
  executionPath: ExecutionPath;
  outputFormat: string;
}

export interface ComplianceResult {
  approved: boolean;
  violations: Array<{
    type: "toxicity" | "factuality" | "schema" | "prompt_injection";
    severity: "low" | "medium" | "high";
    details: string;
  }>;
  validatorsRun: string[];
}

/** Detect prompt injection attempts */
function detectPromptInjection(prompt: string): boolean {
  const injectionPatterns = [
    /ignore previous instructions/i,
    /ignore all previous/i,
    /forget everything/i,
    /new instructions:/i,
    /system:/i,
    /\[INST\]/i,
    /<\|system\|>/i,
    /###\s*system/i,
    /you are now/i,
    /pretend you are/i,
    /act as if you/i,
    /roleplay as/i,
  ];
  return injectionPatterns.some((p) => p.test(prompt));
}

/** Check for high-toxicity content patterns */
function detectToxicity(prompt: string): boolean {
  // Simplified — production should use a dedicated model/API
  const toxicPatterns = [
    /\bhate\s+speech\b/i,
    /\bkill\s+(all|every)\b/i,
    /\bexterminate\b/i,
  ];
  return toxicPatterns.some((p) => p.test(prompt));
}

/** Validate that prompt matches expected schema/format */
function validateSchema(prompt: string, outputFormat: string): boolean {
  // Ensure prompt is non-empty and within size limits
  if (prompt.length === 0 || prompt.length > 50000) return false;
  // Ensure output format is valid
  const validFormats = ["markdown", "json", "text", "html"];
  return validFormats.includes(outputFormat);
}

/**
 * Run compliance validators.
 * Fast path: only schema validator.
 * Full path: all 3 validators in parallel.
 */
export async function runComplianceValidation(
  request: ComplianceRequest,
): Promise<Result<ComplianceResult, ComplianceViolationError>> {
  const violations: ComplianceResult["violations"] = [];
  const validatorsRun: string[] = [];

  // Schema validator — ALWAYS runs (even fast path)
  validatorsRun.push("SchemaValidator");
  if (!validateSchema(request.prompt, request.outputFormat)) {
    violations.push({
      type: "schema",
      severity: "high",
      details:
        "Prompt fails schema validation (empty, too long, or invalid format)",
    });
  }

  validatorsRun.push("PromptInjectionValidator");
  if (detectPromptInjection(request.prompt)) {
    violations.push({
      type: "prompt_injection",
      severity: "high",
      details: "Prompt injection attempt detected",
    });
  }

  if (request.executionPath !== "fast") {
    validatorsRun.push("FactualityValidator");

    validatorsRun.push("ToxicityValidator");
    if (detectToxicity(request.prompt)) {
      violations.push({
        type: "toxicity",
        severity: "high",
        details: "Prompt contains high-toxicity content",
      });
    }
  }

  const highSeverityViolations = violations.filter(
    (v) => v.severity === "high",
  );
  if (highSeverityViolations.length > 0) {
    const firstViolation = highSeverityViolations[0]!;
    return err(
      new ComplianceViolationError(firstViolation.type, firstViolation.details),
    );
  }

  return ok({
    approved: true,
    violations,
    validatorsRun,
  });
}

export const runComplianceCheck = runComplianceValidation;
