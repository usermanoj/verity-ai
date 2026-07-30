import { NextRequest, NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

// Burst protection in front of the AI-calling routes.
//
// This began as the ONLY thing between the internet and the API budget, when
// /api/tutor and /api/translate were open endpoints. Both now require a
// signed-in account and both count against a daily per-person and per-school
// ceiling in Postgres, so this file is no longer load-bearing for spend.
//
// Also refreshes the Supabase session (once per navigation, standard
// middleware pattern) so pages/routes downstream see a valid token — a true
// no-op today since hasSupabase() is false. This is why the matcher below
// was broadened from just the two AI paths to every navigable route: the
// rate-limit/origin checks below still only apply to PROTECTED_PATHS, but
// session refresh needs to run app-wide once Supabase is configured.
//
// (Named `proxy.ts` per Next.js 16 — this file convention replaced the
// `middleware.ts` name; functionality is unchanged, see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)
//
// Two layers, both honestly limited:
// 1. Same-origin check — blocks casual cross-site/scripted abuse that sends
//    a browser-style Origin header. A scripted client that omits Origin
//    entirely (e.g. a bare curl/requests call) bypasses this trivially —
//    it is a deterrent, not a boundary.
// 2. Per-IP sliding-window BURST limit — held in an in-memory Map, so it only
//    protects within a single warm serverless instance's lifetime and does
//    not coordinate across regions/instances.
//
// What changed: the real spend ceiling is no longer here. It is a per-person
// and per-school DAILY count in Postgres (migration 0032, src/lib/ai-budget.ts),
// which survives cold starts and coordinates across regions because there is
// one database. Both AI routes now also require a signed-in account, so an
// anonymous request is refused before any model call.
//
// That leaves this file one narrow job: absorbing a burst. It is no longer the
// thing standing between a stranger and the API budget, and the window below
// was raised accordingly — see MAX_REQUESTS_PER_WINDOW.

const WINDOW_MS = 60_000;
// Raised from 20. Keying on IP means a computer room of thirty students behind
// one school NAT shared a single bucket — twenty requests a minute for the
// whole school — while anyone spreading requests across addresses got the full
// allowance per address. It throttled the customer and waved through the abuse.
//
// Now that a signed-in account is required and the day is bounded per person in
// Postgres, this only needs to stop a burst from one address, so it can be
// loose enough not to punish a shared connection.
const MAX_REQUESTS_PER_WINDOW = 90;
const PROTECTED_PATHS = ["/api/tutor", "/api/translate"];

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

// Keep the in-memory map from growing unbounded over a long-lived instance.
function pruneStaleBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS * 5) buckets.delete(key);
  }
}

export async function proxy(req: NextRequest) {
  if (PROTECTED_PATHS.some((p) => req.nextUrl.pathname.startsWith(p))) {
    const origin = req.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.nextUrl.host) {
          return NextResponse.json({ error: "Forbidden — cross-origin request rejected." }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Forbidden — invalid origin." }, { status: 403 });
      }
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests — please slow down and try again shortly." },
        { status: 429 },
      );
    }
    if (Math.random() < 0.01) pruneStaleBuckets();
  }

  if (hasSupabase()) {
    return updateSupabaseSession(req);
  }

  return NextResponse.next();
}

export const config = {
  // `(?!$)` excludes the marketing homepage ("/") exactly. It's a public
  // page that reads no auth, so the two things this proxy does — rate-
  // limiting the AI endpoints and refreshing the Supabase session — buy it
  // nothing, while every visit paid for a middleware invocation ahead of the
  // render. A signed-in user's session simply refreshes on their next
  // authenticated page instead. Deeper routes still match.
  //
  // .well-known/workflow/ MUST stay excluded — Workflow SDK's internal
  // resumption requests break if the proxy intercepts them (see
  // node_modules/workflow/docs/getting-started/next.mdx's troubleshooting
  // section for the exact failure mode).
  matcher: ["/((?!$|_next/static|_next/image|favicon.ico|.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
