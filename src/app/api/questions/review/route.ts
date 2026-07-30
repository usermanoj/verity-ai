import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { atLeast } from "@/lib/roles";

export const runtime = "nodejs";

// Approving a question used to call resumeHook("question-review:<chunkId>"),
// which resumed a workflow suspended in src/workflows/generate-questions.ts.
// Nothing suspends there any more — questions are generated and inserted
// directly when a teacher approves a document — so the hook resolved no
// workflow and the rows stayed 'pending' forever.
//
// That is the whole reason students never saw practice questions:
// getPracticeBank returns only 'approved' rows, so every generated question
// was stranded one status short of reaching a student while the teacher's
// click reported success.
//
// This writes the decision instead. Ownership is verified against the
// document the questions belong to — the previous version keyed only on an
// id supplied by the caller, so any teacher could have reviewed another
// teacher's questions by guessing one (the same hole closed for document
// review).
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json(
      { error: "Question generation isn't configured for this deployment yet." },
      { status: 503 },
    );
  }

  const user = await getCurrentAppUser();
  if (!user || !atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: "Only signed-in teachers can review." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    chunkId?: string;
    documentId?: string;
    approvedIds?: string[];
    rejectedIds?: string[];
    approveAll?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // "Approve every outstanding question on this document." A deck produces
  // dozens of questions across dozens of chunks, and approving them a card at
  // a time is enough friction that in practice none of them shipped.
  if (body.approveAll && body.documentId) {
    const chunkIds = await ownedChunkIds(user.id, body.documentId);
    if (chunkIds === null) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    if (chunkIds.length === 0) return NextResponse.json({ approved: 0 });

    const { data, error } = await admin
      .from("generated_questions")
      .update({ status: "approved" })
      .in("chunk_id", chunkIds)
      .eq("status", "pending")
      .select("id");
    if (error) return NextResponse.json({ error: "Failed to save decisions." }, { status: 500 });

    return NextResponse.json({ approved: data?.length ?? 0 });
  }

  if (!body.chunkId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!(await teacherOwnsChunk(user.id, body.chunkId))) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const approvedIds = (body.approvedIds ?? []).filter((id) => typeof id === "string");
  const rejectedIds = (body.rejectedIds ?? []).filter((id) => typeof id === "string");

  // Scoped to this chunk as well as to these ids, so an id from another chunk
  // in the request body cannot reach a row it doesn't belong to.
  for (const [ids, status] of [
    [approvedIds, "approved"],
    [rejectedIds, "rejected"],
  ] as const) {
    if (ids.length === 0) continue;
    const { error } = await admin
      .from("generated_questions")
      .update({ status })
      .eq("chunk_id", body.chunkId)
      .in("id", ids);
    if (error) return NextResponse.json({ error: "Failed to save decisions." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function teacherOwnsChunk(teacherId: string, chunkId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("corpus_chunks")
    .select("id, corpus_documents!inner(uploaded_by)")
    .eq("id", chunkId)
    .eq("corpus_documents.uploaded_by", teacherId)
    .maybeSingle();
  return Boolean(data);
}

// null means the document isn't this teacher's (or doesn't exist) — a
// distinction deliberately invisible to the caller.
async function ownedChunkIds(teacherId: string, documentId: string): Promise<string[] | null> {
  const admin = supabaseAdmin();
  const { data: doc } = await admin
    .from("corpus_documents")
    .select("id")
    .eq("id", documentId)
    .eq("uploaded_by", teacherId)
    .maybeSingle();
  if (!doc) return null;

  const { data: chunks } = await admin.from("corpus_chunks").select("id").eq("document_id", documentId);
  return (chunks ?? []).map((c) => c.id);
}
