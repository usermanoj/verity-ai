import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Applies the teacher's approve/reject decision directly.
//
// This used to call resumeHook() to wake a suspended workflow, which meant
// every review travelled through the workflow engine — the same dispatch
// latency measured at 8–11s on the ingest path. Approval is only a database
// state change, so durability buys nothing here. Doing it directly also
// works uniformly for PPTX (which no longer starts a workflow at all).
//
// It additionally fixes a real hole: resumeHook() was keyed purely on
// `review:${documentId}`, so any signed-in teacher could approve or reject
// another teacher's document by guessing its id. Ownership is now verified.
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can review." }, { status: 403 });
  }

  const { documentId, approved } = (await req.json().catch(() => ({}))) as {
    documentId?: string;
    approved?: boolean;
  };
  if (!documentId || typeof approved !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: doc } = await admin
    .from("corpus_documents")
    .select("uploaded_by")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.uploaded_by !== user.id) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { error: statusError } = await admin
    .from("corpus_documents")
    .update({ status: approved ? "approved" : "rejected" })
    .eq("id", documentId);
  if (statusError) {
    return NextResponse.json({ error: "Couldn't save your decision — please try again." }, { status: 500 });
  }

  if (approved) {
    await admin
      .from("corpus_chunks")
      .update({ approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("document_id", documentId);
  } else {
    // Rejected chunks shouldn't linger as if they might still be used.
    await admin.from("corpus_chunks").delete().eq("document_id", documentId);
  }

  return NextResponse.json({ ok: true });
}
