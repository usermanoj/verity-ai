"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VISUALS } from "@/components/topic/visuals/ConceptVisual";
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
}: {
  chunkId: string;
  heading: string;
  resolved: Resolved;
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

  if (!open) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
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
