import { NextRequest, NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

// Interim, best-effort protection for the AI-calling routes until real
// per-user auth (Phase 1) and a persistent rate-limit store (Vercel KV /
// Upstash) are in place. This exists because the moment live AI Gateway
// credentials are set, /api/tutor and /api/translate become open endpoints
// anyone on the internet can call — burning API credits with no rate limit
// at all. This proxy meaningfully raises the bar; it is NOT a substitute for real
// authentication. See ROADMAP.md Phase 0/1.
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
// 2. Per-IP sliding-window rate limit — held in an in-memory Map, so it only
//    protects within a single warm serverless instance's lifetime and does
//    not coordinate across regions/instances. Real protection needs a
//    persistent store (Vercel KV) once that's provisioned.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
