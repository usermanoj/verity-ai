"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CHECKABLE_CHUNK_IDS } from "@/lib/tutor";
import RichText from "./RichText";
import { speakSequence, type Segment, type Sequence } from "./speech-sequence";

type Intent = "explain" | "translate" | "example" | "askme" | "check";
type EslLevel = "advanced" | "intermediate" | "beginner" | "beginner_zh";
type Msg = {
  id: string;
  role: "user" | "ai";
  text: string;       // display text (may be prefixed with a button label for user turns)
  raw?: string;        // the actual content sent to / returned from the model, for history
  cite?: string;      // a citation the model volunteered, stripped from the body
  demo?: boolean;
  intent?: Intent;        // which intent produced this AI reply (drives turn-reset logic)
  chunkId?: string;       // which approved-corpus chunk this AI reply was grounded in (demo mode)
  isTranslation?: boolean; // true for a Translate result — never re-translate a translation
  translationOf?: string;  // id of the message this translates, so it is only translated once
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

// What the student's own bubble should say on a repeat tap.
//
// Every press of Explain read "Explain: Help me with Magnets and
// Electromagnets" — three identical bubbles in a row, while the answers were
// in fact moving through quite different sub-topics. The transcript lost the
// thread of its own conversation.
//
// The assistant names the sub-topic it is moving to in bold on its opening
// line ("Now go deeper into **how an electromagnet works**"), so the label
// borrows it. That keeps both sides of the transcript talking about the same
// thing without asking the model for anything extra.
const LEAD_BOLD = /\*\*([^*\n]{3,60})\*\*/;

export function followUpLabel(
  fallback: string,
  turn: number,
  typed: string,
  lastAiText: string | undefined,
): string {
  // A student who typed their own words always sees their own words.
  if (typed) return typed;
  if (turn === 0) return fallback;

  const lead = (lastAiText ?? "").split("\n").find((l) => l.trim().length > 0) ?? "";
  const subject = LEAD_BOLD.exec(lead)?.[1]?.trim();
  return subject ? `more on ${subject}` : "go deeper";
}

// The prompt now forbids a citation line, but a model that slips back into
// the habit must not leak "Based on: deck.pptx — Page/Section 4" into the
// reply. Splitting keeps the body clean whether or not one arrives; only the
// "Checking against" hint still surfaces what it found.
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
// U+3000–303F is CJK punctuation — 。！？、，and the ideographic space. It was
// missing, so every Chinese full stop counted as English and a translated
// paragraph was chopped into alternating zh/en runs at each sentence end:
// extra voice switches, and an audible stutter between sentences.
const CJK_CHARS = "\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef";
const CJK_RANGE = new RegExp(`[${CJK_CHARS}]`);

function splitByLanguage(text: string): Segment[] {
  const parts = text.match(new RegExp(`[${CJK_CHARS}]+|[^${CJK_CHARS}]+`, "g")) || [text];
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

// Chrome stops speaking after roughly 15 seconds of a single utterance. The
// widely-copied workaround is a timer calling pause()/resume() every few
// seconds — which this used, and which has its own well-known failure: on
// several Chrome versions resume() restarts the utterance from the beginning.
// Combined with the cancel bug below, that is speech which will not stop AND
// repeats itself.
//
// Splitting on sentence boundaries removes the need for the hack entirely: no
// utterance is long enough to hit the limit, so there is no timer to go
// wrong. A sentence is also the right place to change voice for a student
// following along.
const MAX_UTTERANCE_CHARS = 180;

export function splitForSpeech(text: string): Segment[] {
  return splitByLanguage(text).flatMap((run) => {
    if (run.text.length <= MAX_UTTERANCE_CHARS) return [run];
    // Break after sentence-ending punctuation, including the full-width stops
    // and question marks used in Chinese.
    const pieces = run.text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [run.text];
    const out: Segment[] = [];
    let buffer = "";
    for (const piece of pieces) {
      if (buffer && buffer.length + piece.length > MAX_UTTERANCE_CHARS) {
        out.push({ text: buffer, lang: run.lang });
        buffer = "";
      }
      buffer += piece;
    }
    if (buffer.trim()) out.push({ text: buffer, lang: run.lang });
    return out;
  });
}

// The sequence currently playing, so stopSpeaking can invalidate it.
let current: Sequence | null = null;

// Starting was the only thing you could do. A minute of synthesised speech
// with no way to stop it is worse than no read-aloud at all — in a classroom
// it's a student holding a talking tablet, and for anyone using this as an
// accessibility aid it's a trap.
export function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  // Order matters: invalidate the sequence BEFORE cancelling, because
  // cancel() delivers an `onend` that would otherwise start the next segment.
  current?.cancel();
  current = null;
  window.speechSynthesis.cancel();
}

function speak(text: string, onFinished?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  stopSpeaking();

  current = speakSequence(
    splitForSpeech(text),
    (segment, done) => {
      const u = new SpeechSynthesisUtterance(segment.text);
      u.lang = segment.lang;
      const voice = pickVoice(segment.lang);
      if (voice) u.voice = voice;
      u.rate = segment.lang === "zh-CN" ? 0.85 : 0.92;
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    },
    () => {
      // Reaching the end is as much "no longer speaking" as pressing stop —
      // the button has to return to "Read aloud" either way.
      current = null;
      onFinished?.();
    },
  );
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
  const [level, setLevel] = useState<EslLevel>("intermediate");
  const [loading, setLoading] = useState<Intent | null>(null);
  const [needsAnswer, setNeedsAnswer] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const turnCounts = useRef<Partial<Record<Intent, number>>>({});
  // Which conversational mode the free-text box continues when you hit Enter —
  // without this it always defaulted to "explain", so replying to a Socratic
  // question got mislabelled and answered as an unrelated new explanation.
  const [lastIntent, setLastIntent] = useState<Intent>("explain");

  // Both gates below used to require m.chunkId, which is ONLY ever set by the
  // offline demo replies — a real model returns no sourceId. So against a
  // live provider "Check My Answer" and "Translate" were permanently greyed
  // out: two of the five buttons were dead for every actual student, while
  // the caption underneath cheerfully explained how to unlock them.
  //
  // The gates now read the conversation, which is what they were always
  // describing.

  // Something has been put to the student that they could attempt: a worked
  // example ends with "now you try", and askme IS a question.
  const canCheck = messages.some((m) => m.role === "ai" && (m.intent === "example" || m.intent === "askme"));
  // Anything real to translate — the opening greeting has no intent, and a
  // translation of a translation isn't meaningful.
  const lastRealReply = [...messages].reverse().find((m) => m.role === "ai" && m.intent !== undefined && !m.isTranslation);
  const alreadyTranslated = messages.some((m) => m.translationOf && m.translationOf === lastRealReply?.id);
  const canTranslate = Boolean(lastRealReply) && !alreadyTranslated;


  // Speech is a browser-level singleton, not part of this component's tree —
  // navigating to another lesson would otherwise leave it talking to an empty
  // page with the stop button gone.
  useEffect(() => stopSpeaking, []);

  // Which message is being read aloud, so its button can offer the way out.
  // Tapping the same one again stops it; tapping a different one switches.
  function toggleSpeak(id: string, text: string) {
    if (speakingId === id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(id);
    speak(text, () => setSpeakingId((current) => (current === id ? null : current)));
  }

  // The transcript followed the stream with behavior:"smooth" on EVERY token.
  // Each call restarts the easing animation from wherever the last one had
  // reached, so the panel spent the whole reply mid-tween, jittering — the
  // "flicker" — and never actually arriving. Instant during streaming; smooth
  // only for the one deliberate jump after a turn ends.
  function scrollToBottom(smooth = false) {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: smooth ? "smooth" : "auto" });
  }

  // A student scrolling back to re-read an earlier answer should not be
  // dragged to the bottom by the next token.
  function isNearBottom(): boolean {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  // At most one scroll per animation frame instead of one per token.
  const scrollQueued = useRef(false);
  function followStream() {
    if (scrollQueued.current || !isNearBottom()) return;
    scrollQueued.current = true;
    requestAnimationFrame(() => {
      scrollQueued.current = false;
      scrollToBottom();
    });
  }

  async function ask(intent: Intent) {
    // "Check My Answer" used to slide open a SECOND text box, above the one
    // already on screen, pre-filled with a torque placeholder from the
    // Moments demo. Two inputs, one of them irrelevant to the lesson, and no
    // answer typed in either — the student was being asked to answer a
    // question nobody had asked yet.
    //
    // There is one box now. Check reads what is in it, and if it's empty says
    // so instead of opening somewhere new to type.
    if (intent === "check" && !question.trim()) {
      setNeedsAnswer(true);
      inputRef.current?.focus();
      return;
    }
    setNeedsAnswer(false);

    const q = question.trim() || `Help me with ${topicTitle}`;
    const ans = question.trim();
    // Clear the input immediately so leftover text never lingers into the next turn.
    setQuestion("");

    // The rotation/"turn" for explain/example/askme should only advance if
    // the student is CONTINUING that same thread with nothing else in
    // between — otherwise Explain kept saying "let's go deeper" forever,
    // even after the student had done several unrelated things.
    //
    // Computed before the label because the label depends on it.
    const lastAiTurn = [...messages].reverse().find((m) => m.role === "ai");
    const sameThread = lastAiTurn?.intent === intent;
    const turn = sameThread ? (turnCounts.current[intent] ?? 0) : 0;
    turnCounts.current[intent] = turn + 1;

    const label = BUTTONS.find((b) => b.intent === intent)?.label ?? intent;
    const userRaw = intent === "check" ? ans : q;
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: "user",
        text:
          intent === "check"
            ? `Check my answer: ${ans || "(my working)"}`
            : intent === "translate"
              // Translate acts on the previous reply, not on the box. Echoing
              // the topic name here claimed it was translating a phrase the
              // student never asked about.
              ? "Translate this answer into 中文"
              : `${label}: ${followUpLabel(q, turn, question.trim(), lastAiTurn?.text)}`,
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
          body: JSON.stringify({ text: sourceText, sourceId, topicId }),
        });
        const data = await res.json();
        const { body, cite } = splitCite(data.translation || "");
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: "ai",
            text: body,
            raw: body,
            cite,
            demo: data.demo,
            isTranslation: true,
            chunkId: sourceId,
            translationOf: lastAi?.id,
          },
        ]);
        return;
      }

      // Which numeric worked example the conversation is about, so "Check My
      // Answer" hints at the RIGHT problem rather than a bare definition.
      // Only the offline demo replies carry a chunk id; against a real model
      // this is undefined and the route falls back to asking the student what
      // question they're solving, which is the honest thing to do.
      const contextChunkId = [...messages]
        .reverse()
        .find((m) => m.role === "ai" && m.chunkId && CHECKABLE_CHUNK_IDS.includes(m.chunkId))?.chunkId;

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
        followStream();
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
      setTimeout(() => scrollToBottom(true), 60);
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
                {m.role === "ai" && !m.streaming && (
                  <div className="mt-1.5 flex items-center gap-3">
                    <button
                      onClick={() => toggleSpeak(m.id, m.text)}
                      aria-pressed={speakingId === m.id}
                      className={`text-xs transition ${
                        speakingId === m.id
                          ? "font-medium text-[var(--brand2)]"
                          : "text-[var(--muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      {speakingId === m.id ? "⏹ Stop" : "🔊 Read aloud"}
                    </button>
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

      <div className="mt-3">
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            if (needsAnswer) setNeedsAnswer(false);
          }}
          placeholder={
            lastIntent === "askme"
              ? "Type your answer to continue…"
              : `Ask about ${topicTitle}… (or just tap a button)`
          }
          className={`mb-2 w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 focus:ring-[var(--brand)] ${
            needsAnswer ? "ring-[var(--warn)]" : "ring-[var(--border)]"
          }`}
          onKeyDown={(e) => e.key === "Enter" && ask(lastIntent)}
        />
        {needsAnswer && (
          <div className="mb-2 text-[11px] text-[var(--warn)]">
            Type your answer here first, then tap Check My Answer.
          </div>
        )}
        <div className="grid grid-cols-5 gap-2">
          {BUTTONS.map((b) => {
            const gated =
              (b.intent === "check" && !canCheck) || (b.intent === "translate" && !canTranslate);
            const title = gated
              ? b.intent === "check"
                ? 'Tap "Give Example" first so I know what problem to check'
                : alreadyTranslated
                  ? "This answer is already translated above"
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
            {!canTranslate &&
              (alreadyTranslated
                ? "Already translated — ask something new to translate it."
                : "Translate unlocks after your first Explain or Example.")}
          </div>
        )}
      </div>
    </div>
  );
}
