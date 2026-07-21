import { createHook, FatalError } from "workflow";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generatePracticeQuestions } from "@/lib/questions/generate";

async function loadChunk(chunkId: string) {
  "use step";
  const { data, error } = await supabaseAdmin()
    .from("corpus_chunks")
    .select("id, heading, text")
    .eq("id", chunkId)
    .single();
  if (error || !data) throw new FatalError(`Chunk ${chunkId} not found`);
  return data;
}

async function generateStep(heading: string | null, text: string) {
  "use step";
  return generatePracticeQuestions(heading, text);
}

async function savePendingQuestions(
  chunkId: string,
  teacherId: string,
  questions: Awaited<ReturnType<typeof generatePracticeQuestions>>,
) {
  "use step";
  const rows = questions.map((q) => ({
    chunk_id: chunkId,
    level: q.level,
    prompt: q.prompt,
    question: q.question,
    status: "pending" as const,
    generated_by: teacherId,
  }));
  const { data, error } = await supabaseAdmin().from("generated_questions").insert(rows).select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

async function finalizeQuestions(approvedIds: string[], rejectedIds: string[], reviewerId: string) {
  "use step";
  const admin = supabaseAdmin();
  if (approvedIds.length) {
    await admin
      .from("generated_questions")
      .update({ status: "approved", approved_by: reviewerId, approved_at: new Date().toISOString() })
      .in("id", approvedIds);
  }
  if (rejectedIds.length) {
    await admin.from("generated_questions").delete().in("id", rejectedIds);
  }
}

export async function generateQuestionsWorkflow(chunkId: string, teacherId: string) {
  "use workflow";

  const chunk = await loadChunk(chunkId);
  const questions = await generateStep(chunk.heading, chunk.text);
  const questionIds = await savePendingQuestions(chunkId, teacherId, questions);

  // Suspends here — costs nothing while waiting — until the teacher submits
  // their approve/reject decisions via POST /api/questions/review. All
  // generated questions for this chunk are reviewed together in one batch.
  const hook = createHook<{ approvedIds: string[]; rejectedIds: string[] }>({
    token: `question-review:${chunkId}`,
  });
  const { approvedIds, rejectedIds } = await hook;

  await finalizeQuestions(approvedIds, rejectedIds, teacherId);

  return { chunkId, questionIds, approvedCount: approvedIds.length };
}
