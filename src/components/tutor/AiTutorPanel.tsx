"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Intent = "explain" | "translate" | "example" | "askme" | "check";
type EslLevel = "advanced" | "intermediate" | "beginner" | "beginner_zh";
type Msg = { role: "user" | "ai"; text: string; cite?: string; demo?: boolean };

const BUTTONS: { intent: Intent; label: string; icon: string; hint: string }[] = [
  { intent: "explain", label: "Explain", icon: "💡", hint: "Explain this simply" },
  { intent: "example", label: "Give Example", icon: "🧮", hint: "Show a worked example" },
  { intent: "askme", label: "Ask Me Questions", icon: "❓", hint: "Quiz me (Socratic)" },
  { intent: "check", label: "Check My Answer", icon: "✅", hint: "Hint on my attempt" },
  { intent: "translate", label: "Translate", icon: "🌏", hint: "Into Chinese" },
];

const LEVELS: { id: EslLevel; label: string }[] = [
  { id: "advanced", label: "English (advanced)" },
  { id: "intermediate", label: "Simplified English" },
  { id: "beginner", label: "Beginner English" },
  { id: "beginner_zh", label: "English + 中文" },
];

function splitCite(text: string): { body: string; cite?: string } {
  const idx = text.indexOf("📖 Based on:");
  if (idx === -1) return { body: text };
  return { body: text.slice(0, idx).trim(), cite: text.slice(idx).trim() };
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
}

export default function AiTutorPanel({ topicTitle }: { topicTitle: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      text:
        `Hi! I'm your ${topicTitle} tutor. I only use your class materials, and I'll always show you where the answer comes from. Pick a button below — I won't just give you answers, I'll help you learn. 🎓`,
    },
  ]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [level, setLevel] = useState<EslLevel>("intermediate");
  const [loading, setLoading] = useState<Intent | null>(null);
  const [showCheck, setShowCheck] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function ask(intent: Intent) {
    if (intent === "check" && !showCheck) {
      setShowCheck(true);
      return;
    }
    const q = question.trim() || `Help me with ${topicTitle}`;
    setMessages((m) => [
      ...m,
      { role: "user", text: intent === "check" ? `Check my answer: ${answer || "(my working)"}` : `${BUTTONS.find(b => b.intent===intent)?.label}: ${q}` },
    ]);
    setLoading(intent);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, question: q, level, answer }),
      });
      const data = await res.json();
      const { body, cite } = splitCite(data.reply || "");
      setMessages((m) => [...m, { role: "ai", text: body, cite, demo: data.demo }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", text: "⚠️ Network problem — please try again." }]);
    } finally {
      setLoading(null);
      setShowCheck(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }), 60);
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
          {messages.map((m, i) => (
            <motion.div
              key={i}
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
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.cite && (
                  <div className="mt-2 rounded-lg bg-[rgba(34,211,238,0.12)] px-2 py-1 text-xs text-[var(--brand2)]">
                    {m.cite}
                  </div>
                )}
                {m.role === "ai" && (
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
            <input
              autoFocus
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer + working (e.g. 70 × 0.4 = 28 Nm clockwise)"
              className="mt-3 w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
              onKeyDown={(e) => e.key === "Enter" && ask("check")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about moments… (or just tap a button)"
          className="mb-2 w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
          onKeyDown={(e) => e.key === "Enter" && ask("explain")}
        />
        <div className="grid grid-cols-5 gap-2">
          {BUTTONS.map((b) => (
            <button
              key={b.intent}
              onClick={() => ask(b.intent)}
              disabled={!!loading}
              title={b.hint}
              className="group flex flex-col items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-[var(--brand)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <span className="text-xl transition group-hover:scale-110">{b.icon}</span>
              <span className="text-[11px] font-medium leading-tight">{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
