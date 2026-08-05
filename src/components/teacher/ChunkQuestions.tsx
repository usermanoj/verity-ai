"use client";

import { useState } from "react";
import type { TeacherChunk } from "@/lib/ingestion/documents";
import type { Question } from "@/lib/grade";
import { visibleAnswer } from "@/lib/questions/giveaway";
import { PRESSABLE } from "@/lib/ui";

// The row's question arrives as JSON from the database, which is why the type
// is loose. The shape is the one the grader reads, and giveaway only touches
// fields it has checked for.
const asQuestion = (q: Record<string, unknown>) => q as unknown as Question;

/**
 * Says what is wrong and leaves the decision alone.
 *
 * Worded as an observation rather than a verdict because the check cannot tell
 * "made from ______ magnetic materials / permanent" — which asks nothing —
 * from "it becomes a ____ itself" on a prompt that mentions a permanent
 * magnet, which is a fair question. The teacher can see the difference in a
 * second; no string test can.
 */
function Caution({ answer }: { answer: string }) {
  return (
    <span className="text-[var(--warn)]" title={`The word "${answer}" is in the question, so it can be copied across without reading the material.`}>
      ⚠ answer &ldquo;{answer}&rdquo; appears in the question
    </span>
  );
}

export default function ChunkQuestions({ chunk, onChanged }: { chunk: TeacherChunk; onChanged: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(chunk.questions.map((q) => q.id)));
  const [submitting, setSubmitting] = useState(false);
  const [retiring, setRetiring] = useState<string | null>(null);

  const pending = chunk.questions.filter((q) => q.status === "pending");
  const approved = chunk.questions.filter((q) => q.status === "approved");

  async function generate() {
    setGenerating(true);
    try {
      await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId: chunk.id }),
      });
      onChanged();
    } finally {
      setGenerating(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Withdraw a question that is already in front of students.
  //
  // Until now "Published" was the end of the road: the audit that found five
  // approved questions whose answer sits in the question also found that a
  // teacher who spots one can do nothing about it. The endpoint always
  // supported this — rejectedIds is not restricted to pending rows — so the
  // gap was only ever the missing control.
  //
  // It is not a delete. The row keeps its answers; it stops being served, and
  // attempts on it stop counting as evidence, which is the point: a question
  // anyone can answer should not be making a student look secure.
  async function retire(id: string, prompt: string) {
    const ok = window.confirm(
      `Retire this question?\n\n${prompt}\n\nStudents stop seeing it, and answers already given to it stop counting towards their strengths. Generating replacements takes a few seconds. Bringing it back needs a developer.`,
    );
    if (!ok) return;

    setRetiring(id);
    try {
      await fetch("/api/questions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId: chunk.id, rejectedIds: [id] }),
      });
      onChanged();
    } finally {
      setRetiring(null);
    }
  }

  async function submitReview() {
    setSubmitting(true);
    try {
      const approvedIds = pending.filter((q) => selected.has(q.id)).map((q) => q.id);
      const rejectedIds = pending.filter((q) => !selected.has(q.id)).map((q) => q.id);
      await fetch("/api/questions/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId: chunk.id, approvedIds, rejectedIds }),
      });
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 border-t border-[var(--border)] pt-2">
      {approved.length > 0 && (
        <div className="space-y-1">
          {approved.map((q) => {
            const given = visibleAnswer(q.prompt, asQuestion(q.question));
            return (
              <div key={q.id} className="text-xs text-[var(--muted)]">
                <span className="text-[var(--good)]">✓ Published</span> [{q.level}] {q.prompt}
                {given && (
                  <>
                    {" "}
                    <Caution answer={given} />{" "}
                    <button
                      onClick={() => retire(q.id, q.prompt)}
                      disabled={retiring === q.id}
                      className={`underline underline-offset-2 hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60 ${PRESSABLE}`}
                    >
                      {retiring === q.id ? "Retiring…" : "Retire"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 ? (
        <div className="mt-2 space-y-2">
          <div className="text-xs font-medium text-[var(--warn)]">Review generated questions:</div>
          {pending.map((q) => {
            const given = visibleAnswer(q.prompt, asQuestion(q.question));
            return (
              <label key={q.id} className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-[var(--brand2)]">[{q.level}]</span> {q.prompt}
                  {given && (
                    <>
                      {" "}
                      <Caution answer={given} />
                    </>
                  )}
                </span>
              </label>
            );
          })}
          <div className="flex items-center gap-2">
            <button
              onClick={submitReview}
              disabled={submitting}
              className={`rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 ${PRESSABLE}`}
            >
              {submitting ? "Saving…" : "Save decisions (checked = approve)"}
            </button>
            {submitting && <span className="text-xs text-[var(--muted)]">Saving your choices…</span>}
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className={`rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60 ${PRESSABLE}`}
          >
            {generating ? "Generating…" : "+ Generate practice questions"}
          </button>
          {generating && (
            <span className="text-xs text-[var(--muted)]">Writing questions from this chunk — this takes a few seconds.</span>
          )}
        </div>
      )}
    </div>
  );
}
