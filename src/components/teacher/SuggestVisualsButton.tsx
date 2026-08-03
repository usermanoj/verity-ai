"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRESSABLE } from "@/lib/ui";

// Starting the suggestion pass, from inside the lesson it is about.
//
// Deliberately a button rather than something that runs at approval. A teacher
// who has just uploaded 32 sections is not in the frame of mind to review 8
// proposals, and material approved before this feature existed would never get
// any. Asking costs one model call for the whole deck, so it can be a thing
// they choose to do when they have five minutes.
//
// The result is reported as a count, including zero. "Nothing fitted" is a
// real and common answer — the interactives cover perhaps six concepts of a
// syllabus — and a button that goes quiet on zero reads as broken.

export default function SuggestVisualsButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/materials/suggest-visuals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        suggested?: number;
        proposed?: number;
        considered?: number;
      };
      if (!res.ok) {
        setMessage(data.error ?? "Couldn't do that just now.");
        return;
      }
      const n = data.suggested ?? 0;
      const proposed = data.proposed ?? 0;
      const considered = data.considered ?? 0;
      // "Nothing fitted" and "it wanted to repeat an illustration this lesson
      // already uses" are different answers, and the second one is worth
      // saying: it tells a teacher the section is not hopeless, it is just
      // already covered elsewhere in their own deck.
      setMessage(
        considered === 0
          ? "Every section already has an illustration or an answer from you."
          : n === 0 && proposed > 0
            ? `Looked at ${considered} sections. The ${proposed} it wanted to use are already shown elsewhere in this lesson, so nothing was added.`
            : n === 0
              ? `Looked at ${considered} section${considered === 1 ? "" : "s"} and nothing fitted. That's a normal answer.`
              : `${n} suggestion${n === 1 ? "" : "s"} added below — nothing is shown to students until you accept.`,
      );
      router.refresh();
    } catch {
      setMessage("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void run()}
          disabled={busy}
          className={`rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${PRESSABLE}`}
        >
          {busy ? "Reading your lesson…" : "✨ Suggest illustrations"}
        </button>
        <p className="text-xs text-[var(--muted)]">
          Only you can see this. The assistant reads the sections with no illustration and proposes one where an
          interactive genuinely fits — you decide section by section.
        </p>
      </div>
      {message && <p className="mt-2 text-xs text-[var(--brand2)]">{message}</p>}
    </div>
  );
}
