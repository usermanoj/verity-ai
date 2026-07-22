import { supabaseAdmin } from "@/lib/supabase/admin";

export type GeneratedQuestionRow = {
  id: string;
  level: "Easy" | "Medium" | "Challenge";
  prompt: string;
  question: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
};

export type TeacherChunk = {
  id: string;
  heading: string | null;
  text: string;
  citation: string;
  questions: GeneratedQuestionRow[];
};

export type TeacherDocument = {
  id: string;
  source_file: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  chunks: TeacherChunk[];
};

// Shared by the initial server-rendered page load and the client-side
// GET /api/ingest/documents refresh, so the two never drift apart.
//
// Uses the service-role client, not the RLS-scoped one. The caller (every
// call site here) has already run requireRole("teacher", ...)/
// getCurrentAppUser() before invoking this — the security boundary is the
// explicit `.eq("uploaded_by", teacherId)` filter below using that verified
// id, not RLS. This mirrors the write side (upload-init/upload-complete
// already use supabaseAdmin() for the same reason). It also sidesteps a
// real RLS trap: corpus_documents_select's second OR-clause reads from
// corpus_document_sections, whose own policy reads from corpus_documents
// again — that circular cross-table RLS composition returned zero rows for
// a real teacher's own uploads even though `uploaded_by = auth.uid()`
// looked like it should trivially match, confirmed via a live upload test
// where the documents/chunks demonstrably existed in the database but this
// function (previously using the RLS-scoped client) never surfaced them.
export async function listTeacherDocuments(teacherId: string): Promise<TeacherDocument[]> {
  const admin = supabaseAdmin();
  const { data: docs, error: docsError } = await admin
    .from("corpus_documents")
    .select("id, source_file, status, created_at")
    .eq("uploaded_by", teacherId)
    .order("created_at", { ascending: false });
  // A query error must never be silently treated as "no documents" — that's
  // exactly what hid this bug behind a confusing "No uploads yet." once.
  if (docsError) throw docsError;

  const documents: TeacherDocument[] = [];
  for (const doc of docs ?? []) {
    const { data: chunks, error: chunksError } = await admin
      .from("corpus_chunks")
      .select("id, heading, text, citation")
      .eq("document_id", doc.id);
    if (chunksError) throw chunksError;

    const chunksWithQuestions: TeacherChunk[] = [];
    for (const chunk of chunks ?? []) {
      const { data: questions, error: questionsError } = await admin
        .from("generated_questions")
        .select("id, level, prompt, question, status")
        .eq("chunk_id", chunk.id)
        .neq("status", "rejected");
      if (questionsError) throw questionsError;
      chunksWithQuestions.push({ ...chunk, questions: questions ?? [] });
    }

    documents.push({ ...doc, chunks: chunksWithQuestions });
  }
  return documents;
}
