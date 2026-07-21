import { supabaseServer } from "@/lib/supabase/server";

export type TeacherDocument = {
  id: string;
  source_file: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  chunks: { id: string; heading: string | null; text: string; citation: string }[];
};

// Shared by the initial server-rendered page load and the client-side
// GET /api/ingest/documents refresh, so the two never drift apart.
export async function listTeacherDocuments(teacherId: string): Promise<TeacherDocument[]> {
  const supabase = await supabaseServer();
  const { data: docs } = await supabase
    .from("corpus_documents")
    .select("id, source_file, status, created_at")
    .eq("uploaded_by", teacherId)
    .order("created_at", { ascending: false });

  const documents: TeacherDocument[] = [];
  for (const doc of docs ?? []) {
    const { data: chunks } = await supabase
      .from("corpus_chunks")
      .select("id, heading, text, citation")
      .eq("document_id", doc.id);
    documents.push({ ...doc, chunks: chunks ?? [] });
  }
  return documents;
}
