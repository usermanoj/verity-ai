"use client";

import { useEffect, useState } from "react";
import { describeSpan, helpEffect, pacing, toSessions, type TimelineEvent } from "@/lib/timeline";

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

type Detail = { allowed: boolean; wrong: WrongAnswer[]; transcript: TranscriptTurn[]; events: TimelineEvent[] };

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
            <HowTheyWorked events={detail.events ?? []} />
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

// How they worked, rather than how much they got right.
//
// Accuracy says a child is at 31%. It does not say whether they sat for forty
// minutes on Tuesday and asked for help four times, or fired off eight answers
// in ninety seconds the night before — and those need opposite responses from a
// teacher.
//
// Built from timestamps the app already stored. Nothing here is time-on-page:
// a span is the distance between a child's first and last action in a sitting,
// which is a floor on their presence and says nothing about their attention.
function HowTheyWorked({ events }: { events: TimelineEvent[] }) {
  const sessions = toSessions(events);
  const help = helpEffect(events);
  const pace = pacing(events);

  if (sessions.length === 0) {
    return (
      <section>
        <h3 className="mb-2 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">How they worked</h3>
        <p className="text-sm text-[var(--muted)]">Nothing recorded yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">
        How they worked · {sessions.length} sitting{sessions.length === 1 ? "" : "s"}
      </h3>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {/* The measure this product exists to justify: did asking for help make
            the next answer right? Shown as a plain fraction, never a rate — a
            student asks for help on the questions they find hard, so the aided
            figure being lower is expected and a percentage would invite the
            wrong comparison. */}
        <Stat
          label="Right after asking"
          value={help.helped > 0 ? `${help.correctAfterHelp} of ${help.helped}` : "—"}
          note={help.helped > 0 ? "answers that followed a request for help" : "hasn't asked then answered yet"}
        />
        <Stat
          label="Right without help"
          value={help.unaided > 0 ? `${help.unaidedCorrect} of ${help.unaided}` : "—"}
          note="answered cold"
        />
        <Stat
          label="Typical pause"
          value={pace.medianMs === null ? "—" : describeSpan(pace.medianMs)}
          note={
            pace.rushed > 0
              ? `${pace.rushed} answered in under 10 seconds`
              : pace.measured > 0
                ? "before each answer"
                : "not enough answers to say"
          }
        />
      </div>

      <div className="space-y-2">
        {[...sessions].reverse().map((session) => (
          <details key={session.startedAt} className="rounded-2xl border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm">
              <span className="font-medium">
                {new Date(session.startedAt).toLocaleString(undefined, {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="ml-2 text-xs text-[var(--muted)]">
                {session.spanMs > 0 ? `${describeSpan(session.spanMs)} · ` : ""}
                {session.answers} answered, {session.asks} asked
              </span>
            </summary>

            {/* Oldest first inside a sitting, because a sitting is read
                forwards — the point is the order things happened in. */}
            <ol className="mt-3 space-y-1.5 border-l border-[var(--border)] pl-3">
              {session.events.map((e, i) => (
                <li key={i} className="text-xs">
                  <span className="mr-2 tabular-nums text-[var(--muted)]">
                    {new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {e.kind === "ask" ? (
                    <>
                      <span className="text-[var(--brand2)]">{e.intent ?? "asked"}</span>
                      <span className="ml-2 text-[var(--muted)]">{e.label}</span>
                    </>
                  ) : (
                    <>
                      <span className={e.correct ? "text-[var(--good)]" : "text-[#fca5a5]"}>
                        {e.correct ? "✓" : "✗"}
                      </span>
                      <span className="ml-2">{e.section ?? "—"}</span>
                      {e.label && <span className="ml-2 text-[var(--muted)]">{e.label.slice(0, 60)}</span>}
                    </>
                  )}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-[var(--muted)]">{note}</div>
    </div>
  );
}
