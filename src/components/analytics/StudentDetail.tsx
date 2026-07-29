"use client";

import { useEffect, useState } from "react";

// One student, in detail — the level the product has never had.
//
// Their wrong answers WITH the question text, and what they actually asked
// the assistant. The transcript has been recorded since conversation logging
// shipped and has never been shown to anyone, which made it a privacy cost
// with no teaching benefit.

export type WrongAnswer = {
  id: string;
  prompt: string | null;
  level: string | null;
  answer: string;
  at: string;
};

export type TranscriptTurn = {
  role: "user" | "assistant";
  intent: string | null;
  text: string;
  at: string;
  topic: string | null;
};

type Detail = { allowed: boolean; wrong: WrongAnswer[]; transcript: TranscriptTurn[] };

export default function StudentDetail({
  studentId,
  name,
  onClose,
}: {
  studentId: string;
  name: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);

  // No synchronous reset here — the parent gives this component a key of the
  // student id, so switching pupils REMOUNTS it with fresh state. Clearing
  // state inside the effect instead would mean an extra render pass showing
  // the previous child's answers, which on a page about individual children
  // is the worst possible thing to render for a frame.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/students/${studentId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Detail) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Escape closes it, like any other overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`${name} — detail`}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-2)] p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{name}</h2>
            <p className="text-xs text-[var(--muted)]">What they got wrong, and what they asked.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
          >
            ✕ Close
          </button>
        </div>

        {failed && <p className="text-sm text-[var(--warn)]">Couldn&apos;t load this student — please try again.</p>}
        {!detail && !failed && <p className="text-sm text-[var(--muted)]">Loading…</p>}

        {detail && !detail.allowed && (
          <p className="text-sm text-[var(--muted)]">
            This student isn&apos;t in one of your sections.
          </p>
        )}

        {detail?.allowed && (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">
                Got wrong · {detail.wrong.length}
              </h3>
              {detail.wrong.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nothing wrong yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.wrong.map((w) => (
                    <div key={w.id} className="rounded-2xl border border-[var(--border)] p-3">
                      {w.prompt ? (
                        <p className="text-sm">{w.prompt}</p>
                      ) : (
                        // Said rather than hidden: a silently shorter list is
                        // a lie about how much a child got wrong.
                        <p className="text-sm italic text-[var(--muted)]">
                          This question was deleted before we started keeping a copy.
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-[var(--muted)]">
                        {w.level && <span className="mr-2">{w.level}</span>}
                        they answered <span className="text-[#fca5a5]">{w.answer || "(blank)"}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">
                Asked the assistant
              </h3>
              {detail.transcript.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Hasn&apos;t used the assistant yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.transcript.map((t, i) => (
                    <div
                      key={i}
                      className={`rounded-2xl p-3 text-sm ${
                        t.role === "user"
                          ? "bg-[rgba(99,102,241,0.14)]"
                          : "border border-[var(--border)] text-[var(--muted)]"
                      }`}
                    >
                      <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        {t.role === "user" ? "student" : "assistant"}
                        {t.intent && <span className="ml-2">· {t.intent}</span>}
                        {t.topic && <span className="ml-2">· {t.topic}</span>}
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
