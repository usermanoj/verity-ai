import * as Sentry from "@sentry/nextjs";

// Browser-side observability bootstrap — true no-op until
// NEXT_PUBLIC_SENTRY_DSN is set in Vercel. Checked directly (not via the
// lib/observability helper) so Next.js's build-time env inlining has the
// best chance of dead-code-eliminating this block when unset.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1,
  });
}
