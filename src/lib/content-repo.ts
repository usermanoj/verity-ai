import { CORPUS, TOPICS, GLOSSARY, type CorpusChunk, type TopicMeta } from "@/data/corpus";
import { hasSupabaseAdmin, supabaseAdmin } from "@/lib/supabase/admin";
import { createSignedReadUrls } from "@/lib/supabase/storage";

// A diagram lifted from the teacher's own deck, ready to render.
export type TopicMedia = { url: string; width?: number; height?: number; kind: "figure" | "slide" };

// A data table lifted from the source deck, kept as a grid.
export type TopicTable = { headers: string[]; rows: string[][] };
import { ZH_TRANSLATIONS } from "@/data/translations-zh";
import { MOMENTS_BANK, DISTANCE_TIME_BANK, type PracticeItem } from "@/data/practice-banks";

// A data-access abstraction over the approved-material corpus, translations,
// and practice banks (ROADMAP.md Phase 0). Every method is async on purpose,
// even though today's implementation is a synchronous read of static files —
// this is deliberate prep for the Phase 1 Postgres migration: swapping
// FileContentRepository for a PostgresContentRepository later requires zero
// changes to any caller, only swapping which implementation `contentRepo`
// points to below.
//
// Wired through the server-side callers that decide what the AI is allowed
// to say (lib/tutor.ts, api/tutor/route.ts, api/translate/route.ts) — that's
// where the abstraction earns its keep. The client-rendered topic pages
// (app/topics/*/page.tsx) still import the static corpus/practice-bank data
// directly for now; those pages get restructured into server/client pairs
// anyway once the Phase 1 ingestion pipeline makes their content dynamic, so
// wiring them through this repo today would be throwaway work.
export interface ContentRepository {
  getTopics(): Promise<Record<string, TopicMeta>>;
  getTopic(id: string): Promise<TopicMeta | undefined>;
  getCorpusForTopic(topicId: string): Promise<CorpusChunk[]>;
  /** Diagrams from the source document, keyed by page/section number. */
  getMediaForTopic(topicId: string): Promise<Map<number, TopicMedia[]>>;
  /** Data tables from the source document, keyed by page/section number. */
  getTablesForTopic(topicId: string): Promise<Map<number, TopicTable[]>>;
  getCorpusChunk(id: string): Promise<CorpusChunk | undefined>;
  /**
   * ESL vocabulary. With a topicId, the terms extracted from THAT document at
   * ingestion; without one, the curated list the two demo topics rely on.
   */
  getGlossary(topicId?: string): Promise<Record<string, { en: string; zh: string }>>;
  getTranslation(chunkId: string): Promise<string | undefined>;
  /**
   * Stored Chinese for this document's sections, keyed by a hash of the
   * source text — written by the batch pass at approval, and by any teacher
   * correction since.
   */
  getSectionTranslations(topicId: string): Promise<Record<string, string>>;
  getPracticeBank(topicId: string): Promise<PracticeItem[]>;
}

class FileContentRepository implements ContentRepository {
  async getTopics(): Promise<Record<string, TopicMeta>> {
    return TOPICS;
  }
  async getTopic(id: string): Promise<TopicMeta | undefined> {
    return TOPICS[id];
  }
  async getCorpusForTopic(topicId: string): Promise<CorpusChunk[]> {
    return CORPUS.filter((c) => c.topicId === topicId);
  }
  // The two demo topics carry hand-built interactive visuals instead of
  // extracted diagrams, so there is nothing to look up here.
  async getMediaForTopic(): Promise<Map<number, TopicMedia[]>> {
    return new Map();
  }
  async getTablesForTopic(): Promise<Map<number, TopicTable[]>> {
    return new Map();
  }
  async getCorpusChunk(id: string): Promise<CorpusChunk | undefined> {
    return CORPUS.find((c) => c.id === id);
  }
  async getGlossary(): Promise<Record<string, { en: string; zh: string }>> {
    return GLOSSARY;
  }
  async getTranslation(chunkId: string): Promise<string | undefined> {
    return ZH_TRANSLATIONS[chunkId];
  }
  // The two demo topics carry hand-reviewed translations keyed by chunk id,
  // not by source hash, and have no rows in translation_memory.
  async getSectionTranslations(): Promise<Record<string, string>> {
    return {};
  }
  async getPracticeBank(topicId: string): Promise<PracticeItem[]> {
    if (topicId === "moments") return MOMENTS_BANK;
    if (topicId === "distance-time") return DISTANCE_TIME_BANK;
    return [];
  }
}

// Reads the corpus teachers actually uploaded and approved, falling back to
// the static files for anything it doesn't have.
//
// This is the swap the interface above was written for. Until now the whole
// ingestion pipeline — upload, extract, chunk, approve — wrote into
// corpus_chunks and NOTHING read it: the tutor was still grounded in the
// hardcoded hackathon corpus, so approved material never reached a student.
//
// Bridging model: one approved document IS a topic. Teachers already think
// in whole decks ("my Moments lesson"), each chunk already carries a
// per-document citation, and it needs no extra tagging UI. So topicId is the
// document's uuid; subject/grade come from its course.
//
// The static fallback keeps the two demo topics ("moments", "distance-time")
// working — their uuid-vs-slug ids can't collide — so the seeded demo still
// runs alongside real content.
//
// Scoping caveat: students aren't authenticated yet, so approved material is
// exposed by document id rather than by the viewer's enrolment. Once student
// auth lands, getTopics()/getCorpusForTopic() should filter by the sections
// the student is actually enrolled in (class_enrollments).
// A lesson has to read in document order. Postgres returns rows in whatever
// order it pleases without an ORDER BY, which was presenting a deck as
// slides 17, 18, 33, 3 — the material arrived shuffled, so the sections
// contradicted each other and no explanation built on the one before it.
//
// The page number currently survives only inside the citation string that
// ingestion generates ("<file> — Page/Section 17"), so ordering parses it
// back out. A dedicated page_or_section column would be the cleaner home for
// it; this needs no migration and no backfill of already-uploaded documents,
// and the string is one we produce rather than one we found.
//
// Anything unparseable sorts last rather than to the front, so a malformed
// citation can never displace the opening section of a lesson.
export function pageOf(citation: string): number {
  const match = /Page\/Section\s+(\d+)\s*$/.exec(citation);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

class PostgresContentRepository implements ContentRepository {
  private files = new FileContentRepository();

  // The embedded select resolves at runtime through the real foreign keys,
  // but src/lib/supabase/types.ts is hand-written with `Relationships: []`,
  // so postgrest-js can't type the nesting. Cast rather than hand-maintain
  // relationship metadata; DocumentRow below documents the actual shape.
  private async approvedDocuments(): Promise<DocumentRow[]> {
    const { data, error } = await supabaseAdmin()
      .from("corpus_documents")
      .select("id, source_file, created_at, corpus_document_sections(classes(courses(subject, grade)))")
      .eq("status", "approved")
      // Superseded documents stay in the database as history for the teacher,
      // but a student must never see last year's deck listed beside this
      // year's under the same name.
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as unknown as DocumentRow[];
  }

  async getTopics(): Promise<Record<string, TopicMeta>> {
    const topics = { ...(await this.files.getTopics()) };
    for (const doc of await this.approvedDocuments()) {
      topics[doc.id] = toTopicMeta(doc);
    }
    return topics;
  }

  async getTopic(id: string): Promise<TopicMeta | undefined> {
    const fromFile = await this.files.getTopic(id);
    if (fromFile) return fromFile;

    const { data } = await supabaseAdmin()
      .from("corpus_documents")
      .select("id, source_file, created_at, corpus_document_sections(classes(courses(subject, grade)))")
      .eq("id", id)
      .eq("status", "approved")
      // A direct link to a superseded document is a link to material the
      // teacher has replaced, so it 404s rather than teaching from it.
      .is("superseded_at", null)
      .maybeSingle();
    return data ? toTopicMeta(data as unknown as DocumentRow) : undefined;
  }

  async getCorpusForTopic(topicId: string): Promise<CorpusChunk[]> {
    const fromFile = await this.files.getCorpusForTopic(topicId);
    if (fromFile.length > 0) return fromFile;

    // approved_at is set on every chunk when the teacher approves the
    // document, so it doubles as "cleared for students".
    const { data, error } = await supabaseAdmin()
      .from("corpus_chunks")
      .select("id, heading, text, citation, module")
      .eq("document_id", topicId)
      .not("approved_at", "is", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).sort((a, b) => pageOf(a.citation) - pageOf(b.citation)).map((c) => toCorpusChunk(c, topicId));
  }

  // Diagrams from the source deck, keyed by the page their slide became.
  //
  // Signed per request rather than served from a public bucket: this is one
  // school's teaching material, and a public path would be fetchable by
  // anyone who guessed it.
  async getMediaForTopic(topicId: string): Promise<Map<number, TopicMedia[]>> {
    const byPage = new Map<number, TopicMedia[]>();

    const { data } = await supabaseAdmin()
      .from("corpus_document_media")
      .select("page_or_section, storage_path, width, height, kind")
      .eq("document_id", topicId)
      .order("page_or_section", { ascending: true });
    if (!data || data.length === 0) return byPage;

    const urls = await createSignedReadUrls(data.map((m) => m.storage_path));
    for (const m of data) {
      const url = urls.get(m.storage_path);
      if (!url) continue;
      const list = byPage.get(m.page_or_section) ?? [];
      list.push({ url, width: m.width ?? undefined, height: m.height ?? undefined, kind: m.kind ?? "figure" });
      byPage.set(m.page_or_section, list);
    }
    return byPage;
  }

  // Data tables from the deck, keyed by the page their slide became. No
  // signing needed — unlike diagrams these are rows of text, so they travel
  // with the page itself.
  async getTablesForTopic(topicId: string): Promise<Map<number, TopicTable[]>> {
    const byPage = new Map<number, TopicTable[]>();
    const { data } = await supabaseAdmin()
      .from("corpus_document_tables")
      .select("page_or_section, headers, rows")
      .eq("document_id", topicId)
      .order("page_or_section", { ascending: true });

    for (const t of data ?? []) {
      const list = byPage.get(t.page_or_section) ?? [];
      list.push({ headers: t.headers as string[], rows: t.rows as string[][] });
      byPage.set(t.page_or_section, list);
    }
    return byPage;
  }

  async getCorpusChunk(id: string): Promise<CorpusChunk | undefined> {
    const fromFile = await this.files.getCorpusChunk(id);
    if (fromFile) return fromFile;

    const { data } = await supabaseAdmin()
      .from("corpus_chunks")
      .select("id, document_id, heading, text, citation, module")
      .eq("id", id)
      .not("approved_at", "is", null)
      .maybeSingle();
    return data ? toCorpusChunk(data, data.document_id) : undefined;
  }

  // Uploaded material still has no pre-reviewed translation, which the
  // translate route already handles.
  //
  // The glossary, though, is now per document: the curated file only ever
  // matched Moments and Distance-Time, so on any real upload nothing was
  // underlined and the feature looked switched off rather than empty.
  async getGlossary(topicId?: string) {
    if (!topicId) return this.files.getGlossary();

    // The two demo topics keep their hand-written terms — their ids aren't
    // document uuids, so there is nothing to look up.
    const fromFile = await this.files.getGlossary();
    if (topicId in TOPICS) return fromFile;

    const { data, error } = await supabaseAdmin()
      .from("corpus_glossary")
      .select("term, en, zh")
      .eq("document_id", topicId)
      // A teacher who hides a term has judged it wrong or unhelpful; it must
      // stop reaching students, not merely be marked in the review screen.
      .eq("hidden", false);
    if (error || !data?.length) {
      // Falling back to the curated list would put physics tooltips on a
      // geography lesson. Better nothing than wrong.
      if (error) console.error("[content-repo] glossary lookup failed:", error);
      return {};
    }

    return Object.fromEntries(
      data.map((row) => [String(row.term).toLowerCase(), { en: String(row.en), zh: String(row.zh) }]),
    );
  }
  async getTranslation(chunkId: string) {
    return this.files.getTranslation(chunkId);
  }

  async getSectionTranslations(topicId: string): Promise<Record<string, string>> {
    if (topicId in TOPICS) return {};
    const { data, error } = await supabaseAdmin()
      .from("translation_memory")
      .select("source_hash, translation")
      .eq("document_id", topicId);
    if (error) {
      // A lesson still reads perfectly in English; losing the Chinese is a
      // degraded experience, not a broken page.
      console.error("[content-repo] section translations lookup failed:", error);
      return {};
    }
    return Object.fromEntries((data ?? []).map((r) => [r.source_hash as string, r.translation as string]));
  }

  async getPracticeBank(topicId: string): Promise<PracticeItem[]> {
    const fromFile = await this.files.getPracticeBank(topicId);
    if (fromFile.length > 0) return fromFile;

    // Only questions the teacher explicitly approved, and only for chunks of
    // this document. Their `question` jsonb is already lib/grade.ts's exact
    // Question union, so the deterministic grader consumes it untouched.
    const { data: chunks } = await supabaseAdmin()
      .from("corpus_chunks")
      .select("id, citation")
      .eq("document_id", topicId);
    if (!chunks || chunks.length === 0) return [];

    const citationByChunk = new Map(chunks.map((c) => [c.id, c.citation]));
    const { data: questions, error } = await supabaseAdmin()
      .from("generated_questions")
      .select("id, chunk_id, level, prompt, question")
      .in(
        "chunk_id",
        chunks.map((c) => c.id),
      )
      .eq("status", "approved");
    if (error) throw error;

    return (questions ?? []).map((q) => ({
      id: q.id,
      level: q.level,
      prompt: q.prompt,
      question: q.question as PracticeItem["question"],
      source: citationByChunk.get(q.chunk_id) ?? "Approved material",
    }));
  }
}

type DocumentRow = {
  id: string;
  source_file: string;
  created_at?: string;
  corpus_document_sections?: { classes?: { courses?: { subject: string; grade: string } | null } | null }[];
};

function toTopicMeta(doc: DocumentRow): TopicMeta {
  const course = doc.corpus_document_sections?.[0]?.classes?.courses;
  return {
    id: doc.id,
    subject: course?.subject ?? "",
    grade: course?.grade ?? "",
    // The filename is the teacher's own name for the lesson; strip only the
    // extension rather than inventing a title.
    title: doc.source_file.replace(/\.[^.]+$/, ""),
    objective: "",
    addedAt: doc.created_at,
  };
}

function toCorpusChunk(
  row: { id: string; heading: string | null; text: string; citation: string; module?: string | null },
  topicId: string,
): CorpusChunk {
  return {
    id: row.id,
    source: row.citation,
    sourceType: "slides",
    topicId,
    heading: row.heading ?? "",
    text: row.text,
    module: row.module ?? undefined,
  };
}

// Static-only until Supabase is configured, so local/preview builds without
// credentials behave exactly as before.
export const contentRepo: ContentRepository = hasSupabaseAdmin()
  ? new PostgresContentRepository()
  : new FileContentRepository();
