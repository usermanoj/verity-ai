"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRESSABLE } from "@/lib/ui";

// The student's half of enrolment.
//
// Shown when a signed-in student is in no classes, which after the access
// gate means they can see nothing at all. Without this the page would be an
// empty room with no door — correct, and useless.
export default function JoinClass() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "joining" | "joined">("idle");
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    // onSubmit rather than a form action: a React 19 action runs inside a
    // transition, which defers the state update, and "Joining…" that paints
    // after the request finishes is not feedback.
    e.preventDefault();
    if (status === "joining") return;

    setStatus("joining");
    setError(null);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { error?: string; subject?: string; grade?: string; section?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't join — please try again.");
        setStatus("idle");
        return;
      }
      setStatus("joined");
      // Server-rendered and scoped per request, so the new material only
      // appears once the server re-reads enrolment.
      router.refresh();
    } catch {
      setError("Couldn't join — please try again.");
      setStatus("idle");
    }
  }

  if (status === "joined") {
    return (
      <div className="glass rounded-3xl p-6 text-center">
        <div className="text-2xl">✓</div>
        <p className="mt-2 font-medium">You&apos;re in.</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Your class material is loading…</p>
      </div>
    );
  }

  return (
    <form onSubmit={join} className="glass rounded-3xl p-6">
      <h2 className="text-lg font-semibold">Join your class</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Enter the code your teacher gave you. You only need to do this once.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD2345"
          maxLength={12}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Class code"
          className="flex-1 rounded-xl bg-black/25 px-4 py-3 font-mono text-lg tracking-[0.25em] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
        />
        <button
          type="submit"
          disabled={code.trim().length < 4 || status === "joining"}
          className={`rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-medium text-white disabled:opacity-40 ${PRESSABLE}`}
        >
          {status === "joining" ? "Joining…" : "Join"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-[var(--warn)]">{error}</p>}
    </form>
  );
}
