import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

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
  // Always accurate, even when `chunks` is empty — the collapsed card shows
  // this count, and "processing" means chunkCount === 0 (not chunks.length,
  // which is empty by design for collapsed documents).
  chunkCount: number;
  // Populated only for documents the UI actually renders expanded (pending
  // ones awaiting review). Approved/rejected documents render collapsed, so
  // their chunk text is fetched on demand when expanded — see
  // GET /api/ingest/chunks.
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
// Bounds worst-case page-load cost to a fixed amount of data regardless of
// how much history has accumulated. A real teacher's repeated test uploads
// produced dozens of documents with ~10-15 real AI-generated chunks each in
// a single day — batching the chunk/question queries down to 3 total (see
// below) wasn't enough on its own, because those 3 queries still pulled
// every historical row's full text content, which was enough data to blow
// through the serverless function's time limit (a live 504
// FUNCTION_INVOCATION_TIMEOUT, not a hang). Recent-first with a cap is also
// just the right product behavior — nobody needs every historical attempt
// rendered on one page.
const MAX_DOCUMENTS = 30;

export type TeacherIngestState = {
  user: { id: string; role: string; school_id: string; display_name: string | null } | null;
  documents: TeacherDocument[];
};

// Everything /teacher/ingest needs, in ONE database round trip.
//
// The previous path cost up to five sequential hops: the users row for the
// role gate, then the document list, chunk counts, the chunk text for the
// deck under review, and its questions. Individually small; it's the
// serialisation that hurt (~577ms warm in production). The RPC assembles the
// same JSON server-side in a single call.
//
// Uses the user-scoped client, not the service-role one: the function reads
// auth.uid() internally, so identity comes from the caller's verified JWT and
// there is no user-id argument to spoof. That also means the role gate no
// longer needs its own query — the caller's role comes back in the same
// response. See supabase/migrations/0006_teacher_ingest_state.sql.
export async function getTeacherIngestState(limit = MAX_DOCUMENTS): Promise<TeacherIngestState> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("teacher_ingest_state", { p_limit: limit });
  if (error) throw error;

  const state = (data ?? {}) as Partial<TeacherIngestState>;
  return { user: state.user ?? null, documents: state.documents ?? [] };
}


// On-demand chunk loading for a single document — used when a teacher
// expands an approved/rejected deck whose text the list deliberately didn't
// ship. Scoped by teacherId so one teacher can never read another's.
export async function getDocumentChunks(teacherId: string, documentId: string): Promise<TeacherChunk[] | null> {
  const admin = supabaseAdmin();

  const { data: doc, error: docError } = await admin
    .from("corpus_documents")
    .select("id")
    .eq("id", documentId)
    .eq("uploaded_by", teacherId)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc) return null;

  const { data: chunks, error: chunksError } = await admin
    .from("corpus_chunks")
    .select("id, heading, text, citation")
    .eq("document_id", documentId);
  if (chunksError) throw chunksError;
  if (!chunks || chunks.length === 0) return [];

  const { data: questions, error: questionsError } = await admin
    .from("generated_questions")
    .select("id, chunk_id, level, prompt, question, status")
    .in(
      "chunk_id",
      chunks.map((c) => c.id),
    )
    .neq("status", "rejected");
  if (questionsError) throw questionsError;

  const questionsByChunk = new Map<string, GeneratedQuestionRow[]>();
  for (const q of questions ?? []) {
    const { chunk_id, ...rest } = q;
    const list = questionsByChunk.get(chunk_id) ?? [];
    list.push(rest);
    questionsByChunk.set(chunk_id, list);
  }

  return chunks.map((c) => ({ ...c, questions: questionsByChunk.get(c.id) ?? [] }));
}
