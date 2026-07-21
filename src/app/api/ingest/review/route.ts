import { NextRequest, NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can review." }, { status: 403 });
  }

  const { documentId, approved } = (await req.json()) as { documentId?: string; approved?: boolean };
  if (!documentId || typeof approved !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Resumes the suspended workflow (see src/workflows/ingest-document.ts) —
  // it was paused at exactly this point, at zero cost, since the chunks
  // were saved as pending.
  await resumeHook(`review:${documentId}`, { approved, reviewerId: user.id });

  return NextResponse.json({ ok: true });
}
