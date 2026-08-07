"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { grade } from "@/lib/grade";
import type { PracticeItem } from "@/data/practice-banks";

// Callers should pass a stable `key` derived from the topic (e.g.
// key={topicId}) — React then remounts a fresh instance whenever the bank
// changes, which naturally resets all state below instead of needing an
// effect to do it manually.
type Level = PracticeItem["level"];

export default function PracticeZone({ bank }: { bank: PracticeItem[] }) {
  // A deck can generate a couple of hundred questions. Without a way to pick
  // a difficulty a student just gets whatever the bank happens to hold next,
  // which is neither revision nor a stretch — it's a shuffle.
  const [level, setLevel] = useState<Level | "All">("All");
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ReturnType<typeof grade> | null>(null);

  // Bring the marking into view.
  //
  // The feedback renders BELOW the Check button, and on a question with four
  // matching rows that puts it off the bottom of the screen — a student
  // presses Check, nothing appears to happen, and they have to think to
  // scroll. The one moment they are most invested is the one where the app
  // went quiet.
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!result) return;
    // "nearest" moves the page as little as possible: if the panel is already
    // visible nothing happens at all, which matters because this fires on
    // every Check, including the ones that need no scrolling.
    feedbackRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [result]);
  const [streak, setStreak] = useState(0);
  const [wrong, setWrong] = useState(0);
  // Attempts at the CURRENT question, and whether the answer has been asked
  // for. Revealing on the first wrong attempt ended the question then and
  // there — a student who misread it, or mistyped, had no way to try again,
  // and the most valuable moment in practice is the one where you correct
  // yourself. Two attempts, or ask outright if you're stuck.
  const [attempts, setAttempts] = useState(0);
  const [askedForAnswer, setAskedForAnswer] = useState(false);

  const visible = level === "All" ? bank : bank.filter((b) => b.level === level);
  // Filtering can leave the index past the end of a shorter list; clamping
  // here rather than resetting in an effect keeps the render pure and avoids
  // a frame where `item` is undefined.
  const item = visible[Math.min(idx, visible.length - 1)] ?? bank[0];

  const counts: Record<Level, number> = {
    Easy: bank.filter((b) => b.level === "Easy").length,
    Medium: bank.filter((b) => b.level === "Medium").length,
    Challenge: bank.filter((b) => b.level === "Challenge").length,
  };

  function resetQuestion() {
    setInput("");
    setResult(null);
    setAttempts(0);
    setAskedForAnswer(false);
  }

  function chooseLevel(next: Level | "All") {
    setLevel(next);
    setIdx(0);
    resetQuestion();
  }

  function check() {
    // The prompt goes with it so the grader can tell what the question asked.
    const r = grade(item.question, input, item.prompt);
    setResult(r);
    setAttempts((a) => a + 1);
    if (r.correct) {
      setStreak((s) => s + 1);
      setWrong(0);
    } else {
      setWrong((w) => w + 1);
    }
    // Fire-and-forget: records the attempt when a real student is signed in
    // and Supabase is configured (both false today — see ROADMAP.md §7), and
    // is a true no-op otherwise. Never awaited — a logging failure must
    // never affect the grading UX, which is already complete by this point.
    fetch("/api/practice/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The prompt and level travel with the attempt so the record survives
      // the question being regenerated.
      body: JSON.stringify({
        questionId: item.id,
        answer: input,
        gradedResult: r,
        prompt: item.prompt,
        level: item.level,
      }),
    }).catch(() => {});
  }

  function next(targetLevel?: Level) {
    // "Try a Challenge" has to leave the current filter, or the suggestion
    // would point at questions the filter is hiding.
    if (targetLevel) {
      setLevel(targetLevel);
      setIdx(0);
    } else {
      setIdx((i) => (i + 1) % Math.max(1, visible.length));
    }
    resetQuestion();
  }

  // A wrong answer is revealed on the second attempt, or immediately if the
  // student asks. One attempt is not enough to rule out a misread or a typo;
  // three would be badgering.
  const revealAnswer = attempts >= 2 || askedForAnswer;

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

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(["All", "Easy", "Medium", "Challenge"] as const).map((option) => {
          const count = option === "All" ? bank.length : counts[option];
          if (count === 0) return null;
          const active = level === option;
          return (
            <button
              key={option}
              onClick={() => chooseLevel(option)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                active
                  ? "bg-[var(--brand)] text-white"
                  : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {option} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-[var(--muted)]">
          {Math.min(idx + 1, visible.length)} of {visible.length}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text)]/90">{item.prompt}</p>

      {/* Each format needs its own control. Rendering every question as a
          bare text box is what made "Which of the following is a magnetic
          material?" unanswerable — its options existed nowhere on screen. */}
      <AnswerInput question={item.question} value={input} onChange={setInput} onSubmit={() => input && check()} />

      <div className="mt-3 flex gap-2">
        <button
          onClick={check}
          disabled={!input}
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 disabled:opacity-40"
        >
          Check
        </button>
      </div>

      <div className="mt-2 text-[11px] text-[var(--muted)]">
        ✓ Graded instantly & deterministically — by rules, not by an AI guess.
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            ref={feedbackRef}
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

            {/* Shown for every question kind, not folded into the sentence
                above — numeric and true/false used to say "not quite" and
                leave a student with no way to find out what the answer was.
                But held back until a second attempt, or until it's asked
                for: revealing on the first wrong answer ended the question
                then and there, and correcting yourself is the part of
                practice that actually teaches. */}
            {result.correctAnswer && revealAnswer && (
              <div className="mt-2 rounded-xl bg-black/25 px-3 py-2">
                <span className="text-[11px] uppercase tracking-widest text-[var(--muted)]">Answer</span>
                <div className="text-[var(--good)]">{result.correctAnswer}</div>
              </div>
            )}

            {result.correctAnswer && !revealAnswer && (
              <div className="mt-2 text-xs text-[var(--muted)]">
                Have another go — check your working, then press Check again.
              </div>
            )}
            {(item.question.kind === "numeric") && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Chip ok={result.details.valueOk} label="value" />
                {result.details.unitGraded && <Chip ok={result.details.unitOk} label="unit" />}
                {result.details.directionGraded && <Chip ok={result.details.directionOk} label="direction" />}
              </div>
            )}
            <div className="mt-2 text-[11px] text-[var(--muted)]">📖 {item.source}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              {/* A first wrong attempt offers the retry first and keeps
                  "Next question" available, so nobody is held on a question
                  they've decided to leave. */}
              {!result.correct && !revealAnswer && (
                <>
                  <button
                    onClick={() => setResult(null)}
                    className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    ↻ Try again
                  </button>
                  <button
                    onClick={() => setAskedForAnswer(true)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]"
                  >
                    Show answer
                  </button>
                </>
              )}
              {adaptive && (result.correct || revealAnswer) && (
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

// The control a question is answered with, chosen by its kind.
//
// Grading stays deterministic for every format — each one serialises to the
// string lib/grade.ts already expects, so no model is ever asked to mark a
// student's work.
function AnswerInput({
  question,
  value,
  onChange,
  onSubmit,
}: {
  question: PracticeItem["question"];
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  if (question.kind === "mcq" && question.options?.length) {
    return (
      <div className="mt-3 grid gap-2">
        {question.options.map((option, i) => {
          const letter = String.fromCharCode(65 + i);
          const selected = value === letter;
          return (
            <button
              key={option}
              onClick={() => onChange(letter)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition ${
                selected ? "border-[var(--brand)] bg-[rgba(99,102,241,0.14)]" : "border-[var(--border)] hover:border-[var(--brand2)]"
              }`}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-black/30 text-[11px] font-semibold">
                {letter}
              </span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (question.kind === "truefalse") {
    return (
      <div className="mt-3 flex gap-2">
        {["True", "False"].map((label) => (
          <button
            key={label}
            onClick={() => onChange(label)}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${
              value === label ? "border-[var(--brand)] bg-[rgba(99,102,241,0.14)]" : "border-[var(--border)] hover:border-[var(--brand2)]"
            }`}
          >
            {label === "True" ? "✓ True" : "✗ False"}
          </button>
        ))}
      </div>
    );
  }

  if (question.kind === "matching") {
    return <MatchingInput pairs={question.pairs} value={value} onChange={onChange} />;
  }

  return (
    <div className="mt-3">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder={placeholderFor(question)}
        className="w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
      />
    </div>
  );
}

// Each term gets a dropdown of the available meanings. A drag-and-drop board
// would look better and be worse: it is fiddly on the iPads these students
// actually use, and unusable with a keyboard or screen reader.
//
// Answers are keyed by ROW, not by the term's text. A generated question can
// legitimately repeat a term — "Electromagnet / Permanent magnet /
// Electromagnet / Permanent magnet", one row per property — and keying by
// text made the two rows share a single answer: choosing for the first
// silently filled the third, and grading collapsed four rows into two.
export function MatchingInput({
  pairs,
  value,
  onChange,
}: {
  pairs: readonly { left: string; right: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const chosen = parseMatchingAnswer(value, pairs.length);

  // Sorted rather than left in source order, so the answers don't simply line
  // up with the terms. Deterministic, so the list doesn't reshuffle on every
  // keystroke — and de-duplicated, since two rows sharing a property should
  // offer it once.
  const meanings = [...new Set(pairs.map((p) => p.right))].sort((a, b) => a.localeCompare(b));

  function set(row: number, right: string) {
    const next = [...chosen];
    next[row] = right;
    onChange(
      next
        .map((r, i) => (r ? `${i}=${r}` : ""))
        .filter(Boolean)
        .join("\n"),
    );
  }

  // A meaning belongs to exactly one term — the question validator rejects
  // duplicate terms AND duplicate meanings before a question is ever stored,
  // so two rows sharing an answer is not a hard question, it is an
  // impossible one that can only be marked wrong.
  //
  // Offering it anyway asked a twelve-year-old to hold "which have I used
  // already" in their head while reading in a second language, which is not
  // the thing being assessed. Used meanings are disabled; "Choose…" always
  // stays open, so a wrong pick is undone by clearing that row rather than
  // by trapping them.
  const used = new Set(chosen.filter(Boolean));
  const remaining = meanings.length - used.size;

  return (
    // ONE grid for every row, not a grid per row.
    //
    // Each pair used to be its own grid with `1fr 1.3fr` columns, so the
    // term column was measured separately for each line — a row whose select
    // held a long meaning sized its columns differently from the rest, and
    // the dropdowns stepped in and out down the page. Columns can only line
    // up if they belong to the same grid.
    //
    // max-content on the term column also means the labels take exactly the
    // width of the longest term rather than a third of the card.
    <div className="mt-3 grid items-center gap-x-3 gap-y-2 sm:grid-cols-[max-content_1fr]">
      {pairs.map((pair, row) => {
        const label = `Match for ${pair.left}`;
        return (
          <Fragment key={row}>
            <span className="text-sm font-medium">{pair.left}</span>
            <select
              aria-label={label}
              value={chosen[row] ?? ""}
              onChange={(e) => set(row, e.target.value)}
              // The same treatment as every other input in this component and
              // across the app (bg-black/20 + a border ring). This one carried
              // a hardcoded #131a33, which read as a second, lighter surface
              // sitting on the card for no reason.
              className="w-full rounded-xl bg-black/20 px-3 py-2 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
            >
              <option value="" className="bg-[#0e1530]">
                Choose…
              </option>
              {meanings.map((m) => {
                // Taken by ANOTHER row. Never disable this row's own answer,
                // or the select could not render the value it is holding.
                const takenElsewhere = used.has(m) && chosen[row] !== m;
                return (
                  // The explicit option background is needed on Windows
                  // Chrome, where an unstyled dropdown list renders on white.
                  <option key={m} value={m} disabled={takenElsewhere} className="bg-[#0e1530]">
                    {m}
                    {takenElsewhere ? " · already used" : ""}
                  </option>
                );
              })}
            </select>
          </Fragment>
        );
      })}
      {remaining > 0 && used.size > 0 && (
        <p className="text-xs text-[var(--muted)] sm:col-span-2">
          {remaining} meaning{remaining === 1 ? "" : "s"} left · each is used once
        </p>
      )}
    </div>
  );
}

// "0=Can be switched on and off" per line. Older answers used the term's text
// as the key, so those are still read back by matching the term.
/**
 * Which meanings a row may still offer.
 *
 * A meaning belongs to exactly one term, so anything another row has taken is
 * closed — except this row's own current answer, which must stay in the list
 * or the select could not render the value it holds.
 */
export function availableMeanings(
  meanings: readonly string[],
  chosen: readonly (string | undefined)[],
  row: number,
): string[] {
  const used = new Set(chosen.filter((c, i) => Boolean(c) && i !== row));
  return meanings.filter((m) => !used.has(m));
}

export function parseMatchingAnswer(value: string, rowCount: number): (string | undefined)[] {
  const rows = new Array<string | undefined>(rowCount);
  for (const line of value.split("\n")) {
    const at = line.indexOf("=");
    if (at < 0) continue;
    const key = line.slice(0, at);
    const right = line.slice(at + 1);
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && index < rowCount) rows[index] = right;
  }
  return rows;
}

// Shows the expected ANSWER FORMAT (value + unit + direction) using an
// obviously-fake dummy number — never the real expected value, so the
// placeholder can't accidentally give away the answer.
function placeholderFor(q: PracticeItem["question"]): string {
  if (q.kind === "fill") return "Type the missing word…";
  if (q.kind !== "numeric") return "Type your answer…";
  const parts = ["e.g. 12", q.unit ?? ""];
  if (q.direction) parts.push(q.direction);
  return parts.filter(Boolean).join(" ");
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
