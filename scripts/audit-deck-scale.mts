/**
 * What happens when a teacher uploads a sixty-slide deck to a real class.
 *
 *   npx tsx scripts/audit-deck-scale.mts            seed, measure, delete
 *   npx tsx scripts/audit-deck-scale.mts --keep     leave it behind to look at
 *   npx tsx scripts/audit-deck-scale.mts --cleanup  delete and do nothing else
 *
 * Items 3 and 4 of the scale work: ingest at deck size, and the teacher panel
 * at hundreds of questions. Both need more rows than this school has, so this
 * one WRITES, which nothing else in scripts/ does.
 *
 * WHAT IT WRITES, AND WHY IT IS SAFE
 *   - one corpus_document, status 'pending', named with the tag below
 *   - SECTIONS chunks under it
 *   - PER_CHUNK questions per chunk, status 'pending'
 *
 * 'pending' is the safety property, not the tag. A student's corpus reads go
 * through document_reaches_me, which requires status 'approved'; the practice
 * bank requires an approved question. Nothing here can reach a child even
 * while it exists. It is attached to no class section either, so there is no
 * enrolment path to it.
 *
 * Everything is deleted in a finally, and the deletion is verified and
 * reported. --cleanup exists so a crashed run can still be swept up: it
 * removes anything carrying the tag, whenever it was made.
 *
 * NO MODEL IS CALLED. Question generation is 60 completions; measuring it for
 * real would spend the school's money to learn something arithmetic already
 * tells us. The generation finding is in the report at the bottom and comes
 * from reading the code, which is stated as such.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Unmistakable in any list, and the handle everything is deleted by.
const TAG = "ZZ-SCALE-PROBE-DELETE-ME";
const SECTIONS = 60;
const PER_CHUNK = 7;

const keep = process.argv.includes("--keep");
const cleanupOnly = process.argv.includes("--cleanup");

async function cleanup(): Promise<number> {
  // Chunks and questions go with the document: both cascade on delete.
  const { data, error } = await db
    .from("corpus_documents")
    .delete()
    .like("source_file", `${TAG}%`)
    .select("id");
  if (error) throw new Error(`cleanup failed: ${error.message}`);
  return data?.length ?? 0;
}

async function survivors(): Promise<number> {
  const { count } = await db
    .from("corpus_documents")
    .select("*", { count: "exact", head: true })
    .like("source_file", `${TAG}%`);
  return count ?? 0;
}

if (cleanupOnly) {
  const n = await cleanup();
  console.log(`removed ${n} probe document(s); ${await survivors()} remain`);
  process.exit(0);
}

const ms = async (label: string, run: () => PromiseLike<unknown>) => {
  const t0 = performance.now();
  const r = (await run()) as { error?: { message: string } | null };
  const took = Math.round(performance.now() - t0);
  console.log(`  ${String(took).padStart(6)} ms  ${label}${r?.error ? `  (${r.error.message.slice(0, 70)})` : ""}`);
  return took;
};

let documentId: string | null = null;
try {
  // Anything left from a previous crashed run, before adding more.
  const stale = await cleanup();
  if (stale > 0) console.log(`(swept ${stale} document(s) left by an earlier run)\n`);

  const teacher = (await db.from("users").select("id").eq("role", "teacher").limit(1)).data?.[0];
  if (!teacher) throw new Error("need a teacher to own the probe deck");

  console.log(`SEEDING  ${SECTIONS} sections × ${PER_CHUNK} questions = ${SECTIONS * PER_CHUNK} questions\n`);

  const { data: doc, error: docErr } = await db
    .from("corpus_documents")
    // No class_id: it lives in corpus_document_sections now, and 0001's
    // version of this table is stale. Deliberately inserting no section row —
    // that is the join document_reaches_me walks, so there is no path from any
    // enrolment to this deck even if its status were changed by hand.
    .insert({
      uploaded_by: teacher.id,
      source_file: `${TAG}.pptx`,
      status: "pending",
    })
    .select("id")
    .single();
  if (docErr || !doc) throw new Error(`could not seed document: ${docErr?.message}`);
  documentId = doc.id;

  // Sections the size of real ones — the deck measured earlier averaged 376
  // characters — so payload figures mean something.
  const body =
    "A magnetic field is the region around a magnet where a magnetic material feels a force. " +
    "The field is strongest at the poles and becomes weaker with distance from the magnet. " +
    "Field lines are drawn from north to south and never cross one another. ";
  const chunkRows = Array.from({ length: SECTIONS }, (_, i) => ({
    document_id: documentId,
    heading: `Probe section ${i + 1}`,
    text: body,
    citation: `${TAG}.pptx — Page/Section ${i + 1}`,
  }));

  await ms(`insert ${SECTIONS} chunks`, () => db.from("corpus_chunks").insert(chunkRows));

  const chunks = (await db.from("corpus_chunks").select("id").eq("document_id", documentId)).data ?? [];
  const questionRows = chunks.flatMap((c, i) =>
    Array.from({ length: PER_CHUNK }, (_, j) => ({
      chunk_id: c.id,
      level: (["Easy", "Medium", "Challenge"] as const)[j % 3],
      prompt: `Probe question ${j + 1} for section ${i + 1}: the field is strongest at the ____.`,
      question: { kind: "fill", accept: ["poles"] } as unknown as Record<string, unknown>,
      status: "pending" as const,
      generated_by: teacher.id,
    })),
  );
  await ms(`insert ${questionRows.length} questions`, () =>
    db.from("generated_questions").insert(questionRows),
  );

  // ---------------------------------------------------------------- READ ---

  console.log(`\nITEM 4 — THE TEACHER PANEL, at ${SECTIONS} sections and ${questionRows.length} questions\n`);

  // Exactly what getDocumentChunks does: two queries, no per-chunk round trip.
  let chunkBytes = 0;
  let questionBytes = 0;
  await ms("query 1: chunks for the deck", async () => {
    const r = await db.from("corpus_chunks").select("id, heading, text, citation").eq("document_id", documentId!);
    chunkBytes = JSON.stringify(r.data ?? []).length;
    return r;
  });
  const ids = chunks.map((c) => c.id);
  await ms("query 2: every question for those chunks", async () => {
    const r = await db
      .from("generated_questions")
      .select("id, chunk_id, level, prompt, question, status")
      .in("chunk_id", ids)
      .neq("status", "rejected");
    questionBytes = JSON.stringify(r.data ?? []).length;
    return r;
  });
  await ms("teacher_ingest_state (the deck list)", () => db.rpc("teacher_ingest_state", { p_limit: 20 }));

  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`\n  payload: ${kb(chunkBytes)} of chunks + ${kb(questionBytes)} of questions = ${kb(chunkBytes + questionBytes)}`);
  console.log(`  every byte of it crosses to the browser and renders at once —`);
  console.log(`  ChunkQuestions has no pagination and no virtualisation.`);

  // ------------------------------------------------------------- INGEST ---

  const CONCURRENCY = Number(process.env.AI_MAX_CONCURRENCY || 2);
  const CAP = 40; // src/app/api/ingest/review/route.ts
  console.log(`\nITEM 3 — INGEST, from reading the code rather than spending 60 completions\n`);
  console.log(`  generateQuestionsForDocument caps at .limit(${CAP}) chunks.`);
  console.log(`  A ${SECTIONS}-section deck therefore gets questions for ${CAP} sections`);
  console.log(`  and NONE for the other ${SECTIONS - CAP}. The teacher is told nothing.`);
  console.log(`\n  AI_MAX_CONCURRENCY is ${CONCURRENCY}, so ${CAP} chunks run in ${Math.ceil(CAP / CONCURRENCY)} rounds.`);
  for (const per of [4, 8, 15]) {
    const secs = Math.ceil(CAP / CONCURRENCY) * per;
    console.log(`    at ${String(per).padStart(2)}s per completion: ${String(secs).padStart(3)}s${secs > 300 ? "   ← past a 300s function limit" : ""}`);
  }
  console.log(`\n  It runs inside after(), so the teacher is not blocked. It is also`);
  console.log(`  wrapped in a bare catch that reports nothing, so if the function is`);
  console.log(`  cut off partway the deck simply has fewer questions than it should`);
  console.log(`  and no one finds out.`);
} finally {
  if (keep && documentId) {
    console.log(`\n--keep: left document ${documentId} in place. Remove it with --cleanup.`);
  } else {
    const removed = await cleanup();
    const left = await survivors();
    console.log(`\nCLEANED UP  removed ${removed} probe document; ${left} tagged row(s) remain.`);
    if (left > 0) console.log(`  !! something survived — run with --cleanup`);
  }
}
