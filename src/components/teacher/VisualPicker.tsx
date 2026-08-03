"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VISUALS } from "@/lib/visuals/catalogue";
import type { Resolved } from "@/lib/visuals/resolve";
import { PRESSABLE } from "@/lib/ui";

// Overriding what a section illustrates.
//
// Matching is conservative on purpose — a section that does not clearly match
// gets nothing, because a wrong diagram teaches a wrong thing. On the three
// real decks in this school that leaves most sections bare, and some of them a
// teacher would happily have illustrated.
//
// So the automatic choice is shown as a choice, not as a fact: the teacher sees
// what the regex picked and can move it, replace it or remove it. Naming the
// current state matters more than the buttons — "chosen by matching" and "you
// hid this" both render as no picture, and a control that could not tell them
// apart would forget the teacher's decision every time the page reloaded.

export default function VisualPicker({
  chunkId,
  heading,
  resolved,
  suggestion,
}: {
  chunkId: string;
  heading: string;
  resolved: Resolved;
  /**
   * What the model proposed for this section, if anything and if the teacher
   * has not already waved it away. Never present for a student — the topic
   * page does not fetch these unless the reader can edit.
   */
  suggestion?: { visual: string; reason: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = VISUALS.find((v) => v.id === resolved.visual);
  const state =
    resolved.source === "hidden"
      ? "No illustration — you turned it off"
      : current
        ? `${current.label}${resolved.source === "automatic" ? " · chosen by matching" : ""}`
        : "No illustration";

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/materials/dismiss-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(body: { visual?: string | null; automatic?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/materials/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId, ...body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const proposed = suggestion ? VISUALS.find((v) => v.id === suggestion.visual) : undefined;

  if (!open) {
    return (
      <div className="mt-1 space-y-2">
        {/* A proposal, not a change. Nothing has been added to the lesson and
            no student can see this — the model read the section and the
            teacher decides. The reason is the point: it is the whole basis on
            which they can say yes without re-reading the deck. */}
        {proposed && suggestion && (
          <div className="rounded-xl border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.07)] p-3">
            <div className="text-xs text-[var(--brand2)]">
              Suggested illustration · <span className="text-[var(--text)]">{proposed.label}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">{suggestion.reason}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => void save({ visual: suggestion.visual })}
                disabled={busy}
                className={`rounded-lg bg-[var(--brand)] px-3 py-1 font-medium text-white disabled:opacity-60 ${PRESSABLE}`}
              >
                Add it
              </button>
              <button
                onClick={() => void dismiss()}
                disabled={busy}
                className={`rounded-lg border border-[var(--border)] px-3 py-1 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-60 ${PRESSABLE}`}
              >
                No thanks
              </button>
              <span className="text-[var(--muted)]">Students can&apos;t see this until you add it.</span>
            </div>
            {error && <p className="mt-2 text-xs text-[var(--warn)]">{error}</p>}
          </div>
        )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--muted)]">{state}</span>
        <button
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className={`rounded-lg px-2 py-0.5 text-[var(--brand2)] hover:underline ${PRESSABLE}`}
        >
          Change
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--muted)]">
        Illustration for <span className="text-[var(--text)]">{heading}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {VISUALS.map((v) => (
          <button
            key={v.id}
            title={v.blurb}
            disabled={busy}
            onClick={() => void save({ visual: v.id })}
            className={`rounded-lg border px-2.5 py-1 text-xs disabled:opacity-60 ${
              resolved.visual === v.id
                ? "border-[var(--brand)] bg-[rgba(99,102,241,0.16)] text-[var(--text)]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            } ${PRESSABLE}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-[var(--warn)]">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {/* Two different ways to end up with no picture, and they are not the
            same instruction. "None" is a decision that survives a re-upload;
            "let matching decide" hands the section back. */}
        <button
          onClick={() => void save({ visual: null })}
          disabled={busy}
          className={`rounded-lg border border-[var(--border)] px-2.5 py-1 text-[var(--muted)] hover:text-[var(--warn)] disabled:opacity-60 ${PRESSABLE}`}
        >
          None
        </button>
        <button
          onClick={() => void save({ automatic: true })}
          disabled={busy}
          className={`rounded-lg border border-[var(--border)] px-2.5 py-1 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-60 ${PRESSABLE}`}
        >
          Let matching decide
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className={`ml-auto px-2 py-1 text-[var(--muted)] hover:text-[var(--text)] ${PRESSABLE}`}
        >
          Close
        </button>
      </div>
    </div>
  );
}
