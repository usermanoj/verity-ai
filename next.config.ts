import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import { withWorkflow } from "workflow/next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /* config options here */
};

const configWithIntl = withNextIntl(nextConfig);

// Sentry's build plugin (source-map upload) only activates with real
// credentials; with Turbopack (which this project builds with) it no-ops
// entirely without SENTRY_AUTH_TOKEN, so this wrap is safe either way. Still
// gated on SENTRY_DSN so nothing Sentry-related touches the build at all
// until it's actually configured.
const configWithSentry = process.env.SENTRY_DSN
  ? withSentryConfig(configWithIntl, { silent: true, telemetry: false })
  : configWithIntl;

// Enables "use workflow"/"use step" directives (src/workflows/*) — required
// unconditionally at build time regardless of whether Supabase/ingestion is
// configured, since it's a compiler transform, not a runtime feature flag.
export default withWorkflow(configWithSentry);
