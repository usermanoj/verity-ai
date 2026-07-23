"use client";

import { useState } from "react";
import type { TeacherChunk } from "@/lib/ingestion/documents";
import { PRESSABLE } from "@/lib/ui";

export default function ChunkQuestions({ chunk, onChanged }: { chunk: TeacherChunk; onChanged: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(chunk.questions.map((q) => q.id)));
  const [submitting, setSubmitting] = useState(false);

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
          {approved.map((q) => (
            <div key={q.id} className="text-xs text-[var(--muted)]">
              <span className="text-[var(--good)]">✓ Published</span> [{q.level}] {q.prompt}
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 ? (
        <div className="mt-2 space-y-2">
          <div className="text-xs font-medium text-[var(--warn)]">Review generated questions:</div>
          {pending.map((q) => (
            <label key={q.id} className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)} className="mt-0.5" />
              <span>
                <span className="font-medium text-[var(--brand2)]">[{q.level}]</span> {q.prompt}
              </span>
            </label>
          ))}
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
