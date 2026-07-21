import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { generateQuestionsWorkflow } from "@/workflows/generate-questions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Question generation isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can generate questions." }, { status: 403 });
  }

  const { chunkId } = (await req.json()) as { chunkId?: string };
  if (!chunkId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // RLS-scoped read confirms the chunk is real and in the teacher's own
  // school, and that its parent document is approved, before ever starting
  // the (real-token-cost) generation workflow.
  const supabase = await supabaseServer();
  const { data: chunk } = await supabase.from("corpus_chunks").select("id, document_id").eq("id", chunkId).maybeSingle();
  if (!chunk) {
    return NextResponse.json({ error: "Chunk not found." }, { status: 404 });
  }
  const { data: doc } = await supabase.from("corpus_documents").select("status").eq("id", chunk.document_id).maybeSingle();
  if (!doc || doc.status !== "approved") {
    return NextResponse.json({ error: "Only approved material can have questions generated from it." }, { status: 400 });
  }

  await start(generateQuestionsWorkflow, [chunkId, user.id]);

  return NextResponse.json({ status: "generating" });
}
