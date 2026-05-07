/**
 * OpenTelemetry setup for Bureau services.
 *
 * Call initTelemetry() at the START of each service before any other imports.
 * Correlation IDs propagated through BullMQ job headers → traceparent.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import {
  trace,
  context,
  propagation,
  type Tracer,
  type Span,
} from "@opentelemetry/api";

let _sdk: NodeSDK | null = null;

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
}

/**
 * Initialize OpenTelemetry SDK.
 * Must be called before importing any instrumented modules.
 */
export function initTelemetry(options: TelemetryOptions): void {
  if (_sdk !== null) return; // Already initialized

  const otlpEndpoint =
    options.otlpEndpoint ??
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ??
    "http://localhost:4318";

  _sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? "0.1.0",
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    }),
  });

  _sdk.start();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    void _sdk?.shutdown().finally(() => process.exit(0));
  });
}

/** Get a tracer for a specific component */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/**
 * Extract traceparent from BullMQ job headers.
 * Called in worker processor to continue distributed trace.
 */
export function extractTraceContext(
  headers: Record<string, string>,
): ReturnType<typeof context.active> {
  const carrier = headers;
  return propagation.extract(context.active(), carrier);
}

/**
 * Inject trace context into BullMQ job headers.
 * Called before enqueuing a job.
 */
export function injectTraceContext(headers: Record<string, string>): void {
  propagation.inject(context.active(), headers);
}

/**
 * Run a function within a new span.
 * Automatically handles span end and error recording.
 */
export async function withSpan<T>(
  tracer: Tracer,
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  return tracer.startActiveSpan(
    spanName,
    attributes !== undefined ? { attributes } : {},
    async (span) => {
      try {
        const result = await fn(span);
        span.end();
        return result;
      } catch (e) {
        if (e instanceof Error) {
          span.recordException(e);
        }
        span.end();
        throw e;
      }
    },
  );
}
