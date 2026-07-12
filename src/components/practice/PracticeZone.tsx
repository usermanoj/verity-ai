"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { grade, type Question } from "@/lib/grade";

type Item = {
  id: string;
  level: "Easy" | "Medium" | "Challenge";
  prompt: string;
  question: Question;
  source: string;
};

// All answers verified against the school's own worksheet answer keys.
const BANK: Item[] = [
  {
    id: "e1",
    level: "Easy",
    prompt: "A force of 70 N turns a lever 0.4 m from the pivot P. Calculate the moment. State value, unit and direction (clockwise).",
    question: { kind: "numeric", expected: 28, unit: "Nm", direction: "clockwise" },
    source: "Worksheet 7, Q4 (answer key)",
  },
  {
    id: "m1",
    level: "Medium",
    prompt: "Ram (200 N) sits 1.5 m from a seesaw pivot. What weight must Shyam be at 1.0 m to balance it? (Give value + unit.)",
    question: { kind: "numeric", expected: 300, unit: "N" },
    source: "Moments of Force — Slides 5–6",
  },
  {
    id: "c1",
    level: "Challenge",
    prompt: "The moment of a force is 42 Nm and it acts 7 cm from the pivot. Calculate the force. (Convert cm → m first! Value + unit.)",
    question: { kind: "numeric", expected: 600, unit: "N", tolerance: 2 },
    source: "Moments of Force — Slides 14–15",
  },
];

export default function PracticeZone() {
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ReturnType<typeof grade> | null>(null);
  const [streak, setStreak] = useState(0);
  const [wrong, setWrong] = useState(0);

  const item = BANK[idx];

  function check() {
    const r = grade(item.question, input);
    setResult(r);
    if (r.correct) {
      setStreak((s) => s + 1);
      setWrong(0);
    } else {
      setWrong((w) => w + 1);
    }
  }

  function next(targetLevel?: Item["level"]) {
    let n = idx;
    if (targetLevel) {
      const found = BANK.findIndex((b) => b.level === targetLevel);
      if (found >= 0) n = found;
    } else {
      n = (idx + 1) % BANK.length;
    }
    setIdx(n);
    setInput("");
    setResult(null);
  }

  // Adaptive suggestion after grading
  const adaptive =
    result?.correct && streak >= 1 && item.level !== "Challenge"
      ? { label: "You're on a roll — try a Challenge 🚀", level: "Challenge" as const }
      : !result?.correct && wrong >= 2 && item.level !== "Easy"
        ? { label: "Let's build confidence — try an Easier one 💪", level: "Easy" as const }
        : null;

  const levelColor =
    item.level === "Easy" ? "var(--good)" : item.level === "Medium" ? "var(--brand2)" : "var(--accent)";

  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <h2 className="text-lg font-semibold">Practice Zone</h2>
        <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${levelColor}22`, color: levelColor }}>
          {item.level}
        </span>
        <span className="ml-auto text-xs text-[var(--muted)]">🔥 streak {streak}</span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text)]/90">{item.prompt}</p>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && input && check()}
          placeholder="e.g. 28 Nm clockwise"
          className="flex-1 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
        />
        <button
          onClick={check}
          disabled={!input}
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 disabled:opacity-40"
        >
          Check
        </button>
      </div>

      <div className="mt-2 text-[11px] text-[var(--muted)]">
        ✓ Graded instantly & deterministically — value, unit and direction checked by rules, not by an AI guess.
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl p-3 text-sm"
            style={{
              background: result.correct ? "rgba(52,211,153,0.14)" : "rgba(248,113,113,0.12)",
              border: `1px solid ${result.correct ? "rgba(52,211,153,0.4)" : "rgba(248,113,113,0.4)"}`,
            }}
          >
            <div className="font-semibold" style={{ color: result.correct ? "var(--good)" : "var(--bad)" }}>
              {result.correct ? "✅ Correct!" : "❌ Not yet"} · score {Math.round(result.score * 100)}%
            </div>
            <div className="mt-1 text-[var(--text)]/85">{result.feedback}</div>
            {(item.question.kind === "numeric") && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Chip ok={result.details.valueOk} label="value" />
                {item.question.unit && <Chip ok={result.details.unitOk} label="unit" />}
                {item.question.direction && <Chip ok={result.details.directionOk} label="direction" />}
              </div>
            )}
            <div className="mt-2 text-[11px] text-[var(--muted)]">📖 {item.source}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              {adaptive && (
                <button onClick={() => next(adaptive.level)} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white">
                  {adaptive.label}
                </button>
              )}
              <button onClick={() => next()} className="glass rounded-lg px-3 py-1.5 text-xs">Next question →</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Chip({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5"
      style={{
        background: ok ? "rgba(52,211,153,0.18)" : "rgba(248,113,113,0.18)",
        color: ok ? "var(--good)" : "var(--bad)",
      }}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}
