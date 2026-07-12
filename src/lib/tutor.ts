import { CORPUS, TOPIC, type CorpusChunk } from "@/data/corpus";

export type Intent = "explain" | "translate" | "example" | "askme" | "check";
export type EslLevel = "advanced" | "intermediate" | "beginner" | "beginner_zh";

// Vectorless / long-context RAG: for a small curated per-topic corpus we inject
// the whole approved set and force the model to cite. No embeddings, no drift.
export function corpusForTopic(topicId: string): CorpusChunk[] {
  return CORPUS.filter((c) => c.topicId === topicId);
}

function corpusBlock(chunks: CorpusChunk[]): string {
  return chunks
    .map((c) => `<source id="${c.id}" cite="${c.source}">\n${c.heading}: ${c.text}\n</source>`)
    .join("\n\n");
}

const LEVEL_GUIDE: Record<EslLevel, string> = {
  advanced: "The student has strong English. Use normal academic English.",
  intermediate:
    "The student is an intermediate ESL learner. Use simpler English, short sentences, and define hard words in brackets.",
  beginner:
    "The student is a beginner ESL learner. Use very simple English, very short sentences, and everyday words. Explain every technical term.",
  beginner_zh:
    "The student is a beginner ESL learner whose first language is Chinese. Use very simple English, then give a short Simplified Chinese (中文) gloss in brackets after key sentences and technical terms.",
};

const INTENT_GUIDE: Record<Intent, string> = {
  explain:
    "EXPLAIN the concept the student asks about, simply and step by step. Do NOT give the final answer to any assignment question — teach the idea instead.",
  example:
    "Give ONE clear worked EXAMPLE from the approved material, showing the formula and each step. Then invite the student to try a similar one.",
  askme:
    "Do NOT explain. Ask the student 2–3 short GUIDING questions (Socratic) that lead them toward understanding. Wait for their thinking.",
  check:
    "The student will show their attempt. Give a HINT about what to check — never just the answer. Point them to the relevant rule or step.",
  translate: "Translate faithfully; keep physics terms accurate.",
};

export function buildSystemPrompt(topicId: string, level: EslLevel, intent: Intent): string {
  const chunks = corpusForTopic(topicId);
  return `You are the ESL Learning Hub tutor for ${TOPIC.grade} ${TOPIC.subject}, topic "${TOPIC.title}".
You are a patient guide for English-as-a-Second-Language students at an international school (IG & IB curriculum).

ABSOLUTE RULES — follow every time:
1. Answer ONLY using the APPROVED MATERIAL between <source> tags below. This is the school's own textbook/slides/worksheets.
2. If the question cannot be answered from the approved material, say so briefly and steer the student back to the topic. Do NOT use outside/internet knowledge, and do NOT guess.
3. ALWAYS end your reply with a citation line naming the source(s) you used, formatted exactly as:
   "📖 Based on: <cite value>"
4. NEVER complete a whole assignment or give the final numeric answer to a task the student must do. Guide, hint, and ask questions instead (academic integrity).
5. Be encouraging and concise. ${LEVEL_GUIDE[level]}

TASK MODE: ${INTENT_GUIDE[intent]}

APPROVED MATERIAL:
${corpusBlock(chunks)}`;
}

// Deterministic fallback so the UI is fully demoable before an API key is set.
export function fallbackReply(intent: Intent, question: string): string {
  const cite = "📖 Based on: Moments of Force — Slides 2–3 (demo mode)";
  const q = question.trim() || "moments";
  switch (intent) {
    case "explain":
      return `A moment is the turning effect of a force. It depends on how big the force is and how far it acts from the pivot (the point it turns around). We calculate it with:  Moment = force × perpendicular distance.  Force is in newtons (N), distance in metres (m), so a moment is in newton metres (Nm).\n\n${cite}`;
    case "example":
      return `Worked example from your slides: Ram weighs 200 N and sits 1.5 m from the pivot of a seesaw. For balance, clockwise moment = anticlockwise moment, so F₁d₁ = F₂d₂. That gives 200 × 1.5 = F₂ × 1.0, so F₂ = 300 N.  Now try: if Ram moved to 2.0 m, what weight would balance him at 1.0 m?\n\n${cite}`;
    case "askme":
      return `Let's think it through together:\n1. What two things does the size of a moment depend on?\n2. What is the unit of a moment, and why?\n3. When a seesaw is balanced, what is true about the clockwise and anticlockwise moments?\n\n${cite}`;
    case "check":
      return `Before I check anything: did you use Moment = force × distance, and did you convert the distance to metres first? Did you state the unit (Nm) and the direction (clockwise / anticlockwise)? Fix those and show me your working.\n\n${cite}`;
    case "translate":
      return `力矩是力的转动效果。力矩 = 力 × 到支点的垂直距离。（单位：牛顿·米 Nm）\n\n${cite}`;
    default:
      return `I can help with "${q}" using your class material. Try the Explain or Example button.\n\n${cite}`;
  }
}
