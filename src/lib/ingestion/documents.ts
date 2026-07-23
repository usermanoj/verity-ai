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

export async function listTeacherDocuments(teacherId: string): Promise<TeacherDocument[]> {
  const admin = supabaseAdmin();
  const { data: docs, error: docsError } = await admin
    .from("corpus_documents")
    .select("id, source_file, status, created_at")
    .eq("uploaded_by", teacherId)
    .order("created_at", { ascending: false })
    .limit(MAX_DOCUMENTS);
  // A query error must never be silently treated as "no documents" — that's
  // exactly what hid a previous bug behind a confusing "No uploads yet."
  if (docsError) throw docsError;
  if (!docs || docs.length === 0) return [];

  const docIds = docs.map((d) => d.id);

  // Counts for every document, but *ids only* — no text. This is what the
  // collapsed cards need, and it stays tiny no matter how much history has
  // built up.
  const { data: chunkIdRows, error: countError } = await admin
    .from("corpus_chunks")
    .select("id, document_id")
    .in("document_id", docIds);
  if (countError) throw countError;

  const countByDocument = new Map<string, number>();
  for (const row of chunkIdRows ?? []) {
    countByDocument.set(row.document_id, (countByDocument.get(row.document_id) ?? 0) + 1);
  }

  // Full chunk text ONLY for documents the UI renders expanded — i.e. those
  // still pending review. Approved/rejected documents render collapsed, so
  // pulling their text here was pure waste: it dominated the payload and the
  // query time while never being displayed. Their text loads on expand via
  // GET /api/ingest/chunks instead.
  // Only the ONE deck currently being reviewed — not every pending deck.
  // Reviewing is sequential (you approve one deck at a time), and a teacher
  // mid-testing can easily have dozens of decks sitting at 'pending': the
  // earlier "all pending documents" version therefore pulled ~350 chunks of
  // full slide text on every load *and* every 3.5s poll, and React rendered
  // all 350 chunk cards into the DOM. Everything else loads on expand.
  const firstReadyForReview = docs.find(
    (d) => d.status === "pending" && (countByDocument.get(d.id) ?? 0) > 0,
  );
  const expandedDocIds = firstReadyForReview ? [firstReadyForReview.id] : [];
  const { data: chunks, error: chunksError } = expandedDocIds.length
    ? await admin
        .from("corpus_chunks")
        .select("id, document_id, heading, text, citation")
        .in("document_id", expandedDocIds)
    : { data: [], error: null };
  if (chunksError) throw chunksError;

  const chunkIds = (chunks ?? []).map((c) => c.id);
  const { data: questions, error: questionsError } = chunkIds.length
    ? await admin
        .from("generated_questions")
        .select("id, chunk_id, level, prompt, question, status")
        .in("chunk_id", chunkIds)
        .neq("status", "rejected")
    : { data: [], error: null };
  if (questionsError) throw questionsError;

  const questionsByChunk = new Map<string, GeneratedQuestionRow[]>();
  for (const q of questions ?? []) {
    const { chunk_id, ...rest } = q;
    const list = questionsByChunk.get(chunk_id) ?? [];
    list.push(rest);
    questionsByChunk.set(chunk_id, list);
  }

  const chunksByDocument = new Map<string, TeacherChunk[]>();
  for (const c of chunks ?? []) {
    const { document_id, ...rest } = c;
    const list = chunksByDocument.get(document_id) ?? [];
    list.push({ ...rest, questions: questionsByChunk.get(c.id) ?? [] });
    chunksByDocument.set(document_id, list);
  }

  return docs.map((doc) => ({
    ...doc,
    chunkCount: countByDocument.get(doc.id) ?? 0,
    chunks: chunksByDocument.get(doc.id) ?? [],
  }));
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
