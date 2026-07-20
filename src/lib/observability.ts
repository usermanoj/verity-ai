// Central env-gates for optional observability providers. Each one is a
// true no-op until its env vars are set in Vercel — no code changes needed
// to activate, matching the pattern already used for hasApiKey() in lib/ai.ts.
//
// Client-safe: this file has zero server-only imports, so it can be shared
// by both instrumentation.ts (server) and instrumentation-client.ts (browser).

// Sentry — error tracking. Two separate vars because Next.js only inlines
// NEXT_PUBLIC_* into the browser bundle; the server can read the plain one.
export const hasSentryServer = () => Boolean(process.env.SENTRY_DSN);
export const hasSentryClient = () => Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

// Langfuse — LLM observability (traces every streamText/generateText call
// in lib/ai.ts via OpenTelemetry). Server-only; nothing to gate client-side.
export const hasLangfuse = () =>
  Boolean(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);
