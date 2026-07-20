import { CORPUS, TOPICS, GLOSSARY, type CorpusChunk, type TopicMeta } from "@/data/corpus";
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
  getCorpusChunk(id: string): Promise<CorpusChunk | undefined>;
  getGlossary(): Promise<Record<string, { en: string; zh: string }>>;
  getTranslation(chunkId: string): Promise<string | undefined>;
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
  async getCorpusChunk(id: string): Promise<CorpusChunk | undefined> {
    return CORPUS.find((c) => c.id === id);
  }
  async getGlossary(): Promise<Record<string, { en: string; zh: string }>> {
    return GLOSSARY;
  }
  async getTranslation(chunkId: string): Promise<string | undefined> {
    return ZH_TRANSLATIONS[chunkId];
  }
  async getPracticeBank(topicId: string): Promise<PracticeItem[]> {
    if (topicId === "moments") return MOMENTS_BANK;
    if (topicId === "distance-time") return DISTANCE_TIME_BANK;
    return [];
  }
}

export const contentRepo: ContentRepository = new FileContentRepository();
