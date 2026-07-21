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
  chunks: TeacherChunk[];
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

    const chunksWithQuestions: TeacherChunk[] = [];
    for (const chunk of chunks ?? []) {
      const { data: questions } = await supabase
        .from("generated_questions")
        .select("id, level, prompt, question, status")
        .eq("chunk_id", chunk.id)
        .neq("status", "rejected");
      chunksWithQuestions.push({ ...chunk, questions: questions ?? [] });
    }

    documents.push({ ...doc, chunks: chunksWithQuestions });
  }
  return documents;
}
