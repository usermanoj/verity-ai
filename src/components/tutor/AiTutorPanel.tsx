"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CHECKABLE_CHUNK_IDS } from "@/lib/tutor";
import RichText from "./RichText";

type Intent = "explain" | "translate" | "example" | "askme" | "check";
type EslLevel = "advanced" | "intermediate" | "beginner" | "beginner_zh";
type Msg = {
  id: string;
  role: "user" | "ai";
  text: string;       // display text (may be prefixed with a button label for user turns)
  raw?: string;        // the actual content sent to / returned from the model, for history
  cite?: string;
  citeLabel?: string;  // human-readable source name, for the "Checking against" indicator
  demo?: boolean;
  intent?: Intent;        // which intent produced this AI reply (drives turn-reset logic)
  chunkId?: string;       // which approved-corpus chunk this AI reply was grounded in (demo mode)
  isTranslation?: boolean; // true for a Translate result — never re-translate a translation
  streaming?: boolean;     // true while text is still arriving
};

const BUTTONS: { intent: Intent; label: string; icon: string; hint: string }[] = [
  { intent: "explain", label: "Explain", icon: "💡", hint: "Explain this simply" },
  { intent: "example", label: "Give Example", icon: "🧮", hint: "Show a worked example" },
  { intent: "askme", label: "Ask Me Questions", icon: "❓", hint: "Quiz me, one question at a time" },
  { intent: "check", label: "Check My Answer", icon: "✅", hint: "Hint on my attempt" },
  { intent: "translate", label: "Translate", icon: "🌏", hint: "Translate the last reply" },
];

const LEVELS: { id: EslLevel; label: string }[] = [
  { id: "advanced", label: "English (advanced)" },
  { id: "intermediate", label: "Simplified English" },
  { id: "beginner", label: "Beginner English" },
  { id: "beginner_zh", label: "English + 中文" },
];

const DEFAULT_TRANSLATE_SOURCE =
  "A moment is the turning effect of a force. Moment = force × perpendicular distance from the pivot.";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m${idCounter}`;
}

function splitCite(text: string): { body: string; cite?: string } {
  const idx = text.indexOf("📖 Based on:");
  if (idx === -1) return { body: text };
  return { body: text.slice(0, idx).trim(), cite: text.slice(idx).trim() };
}

// --- Language-aware read-aloud -------------------------------------------
// Splits mixed English/Chinese text into runs so each run is spoken with the
// correct voice+lang (a single English-tagged utterance mispronounces or
// silently skips Chinese characters). Also works around a long-standing
// Chrome bug where utterances longer than ~15s silently stop.
const CJK_RANGE = /[㐀-鿿＀-￯]/;

function splitByLanguage(text: string): { text: string; lang: "zh-CN" | "en-US" }[] {
  const parts = text.match(/[㐀-鿿＀-￯]+|[^㐀-鿿＀-￯]+/g) || [text];
  return parts
    .map((p) => ({ text: p, lang: (CJK_RANGE.test(p[0] ?? "") ? "zh-CN" : "en-US") as "zh-CN" | "en-US" }))
    .filter((p) => p.text.trim().length > 0);
}

let voicesCache: SpeechSynthesisVoice[] = [];
if (typeof window !== "undefined" && window.speechSynthesis) {
  const loadVoices = () => {
    voicesCache = window.speechSynthesis.getVoices();
  };
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  return (
    voicesCache.find((v) => v.lang === lang) ||
    voicesCache.find((v) => v.lang.toLowerCase().startsWith(lang.split("-")[0].toLowerCase()))
  );
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const segments = splitByLanguage(text);
  let i = 0;
  const speakNext = () => {
    if (i >= segments.length) return;
    const seg = segments[i++];
    const u = new SpeechSynthesisUtterance(seg.text);
    u.lang = seg.lang;
    const voice = pickVoice(seg.lang);
    if (voice) u.voice = voice;
    u.rate = seg.lang === "zh-CN" ? 0.85 : 0.92;
    u.onend = speakNext;
    u.onerror = speakNext;
    synth.speak(u);
  };
  speakNext();
  // Chrome workaround: long speech silently halts unless kept alive.
  const keepAlive = setInterval(() => {
    if (!synth.speaking) {
      clearInterval(keepAlive);
      return;
    }
    synth.pause();
    synth.resume();
  }, 5000);
}

// Reads the newline-delimited-JSON stream from /api/tutor, calling onDelta
// for each incremental chunk of text and returning the final metadata once
// the stream ends. Newline-delimited JSON (rather than raw SSE) keeps the
// wire format trivial to produce server-side and to parse here.
async function consumeNdjsonStream(
  res: Response,
  onDelta: (accumulated: string) => void,
): Promise<{ text: string; demo: boolean; sourceId?: string; error?: boolean }> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let demo = false;
  let sourceId: string | undefined;
  let error = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (!line.trim()) continue;
      const evt = JSON.parse(line) as { type: string; text?: string; demo?: boolean; sourceId?: string; error?: boolean };
      if (evt.type === "delta" && evt.text) {
        accumulated += evt.text;
        onDelta(accumulated);
      } else if (evt.type === "done") {
        demo = !!evt.demo;
        sourceId = evt.sourceId;
        error = !!evt.error;
      }
    }
  }
  return { text: accumulated, demo, sourceId, error };
}
// ---------------------------------------------------------------------------

export default function AiTutorPanel({ topicId, topicTitle }: { topicId: string; topicTitle: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: nextId(),
      role: "ai",
      text:
        `Hi! I'm your ${topicTitle} AI learning assistant. I only use your class materials, and I'll always show you where the answer comes from. Pick a button below — I won't just give you answers, I'll help you learn. 🎓`,
    },
  ]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [level, setLevel] = useState<EslLevel>("intermediate");
  const [loading, setLoading] = useState<Intent | null>(null);
  const [showCheck, setShowCheck] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const turnCounts = useRef<Partial<Record<Intent, number>>>({});
  // Which conversational mode the free-text box continues when you hit Enter —
  // without this it always defaulted to "explain", so replying to a Socratic
  // question got mislabelled and answered as an unrelated new explanation.
  const [lastIntent, setLastIntent] = useState<Intent>("explain");

  // The most recent grounded corpus chunk that is an actual numeric worked
  // example (not a bare definition/principle) — the only thing "Check My
  // Answer" can sensibly check against.
  const lastCheckableChunkId = [...messages]
    .reverse()
    .find((m) => m.role === "ai" && m.chunkId && CHECKABLE_CHUNK_IDS.includes(m.chunkId))?.chunkId;
  const canCheck = !!lastCheckableChunkId;
  // Translate needs at least one real grounded explanation to translate —
  // translating the generic greeting isn't useful, and there'd be no
  // reviewed-translation match for it in demo mode.
  const canTranslate = messages.some((m) => m.role === "ai" && m.chunkId && !m.isTranslation);
  const checkableChunk = lastCheckableChunkId
    ? messages.find((m) => m.chunkId === lastCheckableChunkId)?.citeLabel
    : undefined;

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }

  async function ask(intent: Intent) {
    if (intent === "check" && !showCheck) {
      setShowCheck(true);
      return;
    }

    const q = question.trim() || `Help me with ${topicTitle}`;
    const ans = answer;
    // Clear inputs immediately so leftover text never lingers into the next turn.
    setQuestion("");
    setAnswer("");

    const label = BUTTONS.find((b) => b.intent === intent)?.label ?? intent;
    const userRaw = intent === "check" ? ans : q;
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: "user",
        text: intent === "check" ? `Check my answer: ${ans || "(my working)"}` : `${label}: ${q}`,
        raw: userRaw,
      },
    ]);
    setLoading(intent);

    try {
      if (intent === "translate") {
        // Skip past any previous translation output — translating a
        // translation isn't meaningful, and it has no corpus sourceId, which
        // used to make repeated Translate presses degrade into "no match".
        const lastAi = [...messages].reverse().find((m) => m.role === "ai" && !m.isTranslation);
        const sourceText = lastAi?.text || DEFAULT_TRANSLATE_SOURCE;
        const sourceId = lastAi?.chunkId;
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: sourceText, sourceId }),
        });
        const data = await res.json();
        const { body, cite } = splitCite(data.translation || "");
        setMessages((m) => [
          ...m,
          { id: nextId(), role: "ai", text: body, raw: body, cite, demo: data.demo, isTranslation: true, chunkId: sourceId },
        ]);
        return;
      }

      // The rotation/"turn" for explain/example/askme should only advance if
      // the student is CONTINUING that same thread with nothing else in
      // between — otherwise Explain kept saying "let's go deeper" forever,
      // even after the student had done several unrelated things.
      const lastAiTurn = [...messages].reverse().find((m) => m.role === "ai");
      const sameThread = lastAiTurn?.intent === intent;
      const turn = sameThread ? (turnCounts.current[intent] ?? 0) : 0;
      turnCounts.current[intent] = turn + 1;

      // Which numeric worked example the conversation is about — needed so
      // "Check My Answer" hints at the RIGHT problem (never a bare
      // definition/principle, which has nothing to check).
      const contextChunkId = lastCheckableChunkId;

      // Real conversation memory: without this, the model can't tell what it
      // already said, so "then?" / "what next?" has nothing to build on.
      const history = messages
        .filter((m) => m.raw !== undefined || m.role === "ai")
        .map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.raw ?? m.text,
        }));

      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, intent, question: q, level, answer: ans, turn, history, contextChunkId }),
      });

      // Stream the reply in: the first delta creates the AI bubble and hides
      // the loading dots, subsequent deltas grow it in place by id — no
      // more waiting on a frozen screen for the full 800-token reply.
      const streamId = nextId();
      let started = false;
      const result = await consumeNdjsonStream(res, (accumulated) => {
        if (!started) {
          started = true;
          setLoading(null);
          setMessages((m) => [...m, { id: streamId, role: "ai", text: accumulated, streaming: true }]);
        } else {
          setMessages((m) => m.map((msg) => (msg.id === streamId ? { ...msg, text: accumulated } : msg)));
        }
        scrollToBottom();
      });

      const { body, cite } = splitCite(result.text);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === streamId
            ? {
                ...msg,
                text: body,
                raw: body,
                cite,
                citeLabel: cite,
                demo: result.demo,
                intent,
                chunkId: result.sourceId ?? (intent === "check" ? contextChunkId : undefined),
                streaming: false,
              }
            : msg,
        ),
      );
      if (intent === "explain" || intent === "example" || intent === "askme") setLastIntent(intent);
    } catch {
      setMessages((m) => [...m, { id: nextId(), role: "ai", text: "⚠️ Network problem — please try again." }]);
    } finally {
      setLoading(null);
      setShowCheck(false);
      setTimeout(scrollToBottom, 60);
    }
  }

  return (
    <div className="glass-strong flex h-full flex-col rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand)] text-lg glow-brand">🤖</span>
          <div>
            <div className="font-semibold leading-tight">AI Learning Assistant</div>
            <div className="text-xs text-[var(--muted)]">Curriculum-locked · cites sources</div>
          </div>
        </div>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as EslLevel)}
          className="glass rounded-xl px-2 py-1.5 text-xs outline-none"
        >
          {LEVELS.map((l) => (
            <option key={l.id} value={l.id} className="bg-[#0e1530]">{l.label}</option>
          ))}
        </select>
      </div>

      <div ref={scrollRef} className="min-h-[240px] flex-1 space-y-3 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[var(--brand)] text-white"
                    : "glass text-[var(--text)]"
                }`}
              >
                {/* The model replies in Markdown — numbered steps, bold key
                    terms, formulas. Rendering it raw showed students literal
                    "**Axes**" and "- item", so the assistant looked broken
                    exactly where its answers were most structured. Student
                    messages stay plain text: they aren't Markdown. */}
                {m.role === "ai" ? (
                  <div>
                    <RichText text={m.text} />
                    {m.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-text-bottom" />}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.text}</p>
                )}
                {m.cite && (
                  <div className="mt-2 rounded-lg bg-[rgba(34,211,238,0.12)] px-2 py-1 text-xs text-[var(--brand2)]">
                    {m.cite}
                  </div>
                )}
                {m.role === "ai" && !m.streaming && (
                  <div className="mt-1.5 flex items-center gap-3">
                    <button onClick={() => speak(m.text)} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">🔊 Read aloud</button>
                    {m.demo && <span className="text-[10px] text-[var(--warn)]">demo mode (no API key)</span>}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <div className="flex justify-start">
            <div className="glass rounded-2xl px-4 py-2.5 text-sm text-[var(--muted)]">
              <span className="inline-flex gap-1">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce [animation-delay:0.15s]">●</span>
                <span className="animate-bounce [animation-delay:0.3s]">●</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCheck && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {checkableChunk && (
              <div className="mt-3 text-[11px] text-[var(--muted)]">
                🎯 Checking against: <span className="text-[var(--brand2)]">{checkableChunk.replace("📖 Based on: ", "").replace(" (demo mode)", "")}</span>
              </div>
            )}
            <input
              autoFocus
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer + working (e.g. 70 × 0.4 = 28 Nm clockwise)"
              className="mt-1 w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
              onKeyDown={(e) => e.key === "Enter" && ask("check")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            lastIntent === "askme"
              ? "Type your answer to continue…"
              : `Ask about ${topicTitle}… (or just tap a button)`
          }
          className="mb-2 w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
          onKeyDown={(e) => e.key === "Enter" && ask(lastIntent)}
        />
        <div className="grid grid-cols-5 gap-2">
          {BUTTONS.map((b) => {
            const gated =
              (b.intent === "check" && !canCheck) || (b.intent === "translate" && !canTranslate);
            const title = gated
              ? b.intent === "check"
                ? 'Tap "Give Example" first so I know what problem to check'
                : "Ask to Explain or Give Example first, then Translate it"
              : b.hint;
            return (
              <button
                key={b.intent}
                onClick={() => ask(b.intent)}
                disabled={!!loading || gated}
                title={title}
                className="group flex flex-col items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-[var(--brand)] hover:bg-[var(--surface-2)] disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:border-[var(--border)]"
              >
                <span className="text-xl transition group-hover:scale-110">{b.icon}</span>
                <span className="text-[11px] font-medium leading-tight">{b.label}</span>
              </button>
            );
          })}
        </div>
        {(!canCheck || !canTranslate) && (
          <div className="mt-2 text-[10px] text-[var(--muted)]">
            {!canCheck && "Check My Answer unlocks after Give Example (or Explain reaches a worked example). "}
            {!canTranslate && "Translate unlocks after your first Explain or Example."}
          </div>
        )}
      </div>
    </div>
  );
}
