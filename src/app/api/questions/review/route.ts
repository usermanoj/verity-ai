import { NextRequest, NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Question generation isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can review." }, { status: 403 });
  }

  const { chunkId, approvedIds, rejectedIds } = (await req.json()) as {
    chunkId?: string;
    approvedIds?: string[];
    rejectedIds?: string[];
  };
  if (!chunkId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Resumes the workflow suspended in src/workflows/generate-questions.ts —
  // paused at zero cost since the pending questions were saved.
  await resumeHook(`question-review:${chunkId}`, {
    approvedIds: approvedIds ?? [],
    rejectedIds: rejectedIds ?? [],
  });

  return NextResponse.json({ ok: true });
}
