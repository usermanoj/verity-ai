import { hasLangfuse, hasSentryServer } from "@/lib/observability";

// Server-side observability bootstrap. Both providers are true no-ops until
// their env vars are set — nothing here runs, and nothing here can throw,
// when this project's env is empty (the current state).
export async function register() {
  if (hasSentryServer()) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 1,
    });
  }

  // Langfuse traces AI SDK calls via OpenTelemetry — Node runtime only (the
  // OTel Node SDK doesn't run on the edge runtime), and only when configured.
  if (hasLangfuse() && process.env.NEXT_RUNTIME === "nodejs") {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { LangfuseSpanProcessor } = await import("@langfuse/otel");
    const sdk = new NodeSDK({
      spanProcessors: [new LangfuseSpanProcessor()],
    });
    sdk.start();
  }
}

export async function onRequestError(
  ...args: Parameters<NonNullable<import("next").Instrumentation.onRequestError>>
) {
  if (!hasSentryServer()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
