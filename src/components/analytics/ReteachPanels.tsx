import { Panel } from "./charts";
import {
  conceptsToReteach,
  lessonsToRevisit,
  MIN_ATTEMPTS,
  REPEAT_THRESHOLD,
  type AskedAbout,
  type QuestionOutcome,
} from "@/lib/concept-failure";

// The two panels that answer "what do I do on Monday".
//
// Deliberately ranked lists rather than charts. The most useful teacher
// analytics are boring: three lines saying reteach this beat any
// visualisation, and a chart that looks impressive in a demo without changing
// what a teacher does on Monday is the failure mode of this whole product
// category.

export function ConceptFailurePanel({ outcomes }: { outcomes: QuestionOutcome[] }) {
  const concepts = conceptsToReteach(outcomes).slice(0, 8);

  return (
    <Panel
      title="What to reteach"
      hint="Sections your students are getting wrong, most students first. Counted only where enough of them have answered."
    >
      {concepts.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {outcomes.length === 0
            ? "No practice answers yet. This fills in as students work through the questions."
            : `Nothing to flag yet — a section needs ${MIN_ATTEMPTS}+ answers before one confused student looks like a class problem.`}
        </p>
      ) : (
        <div className="space-y-3">
          {concepts.map((c) => (
            <div key={c.chunkId} className="rounded-2xl border border-[var(--border)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{c.heading}</span>
                <span className="text-sm tabular-nums text-[#fca5a5]">
                  {c.wrong} of {c.attempts} wrong
                  <span className="ml-2 text-[var(--muted)]">· {Math.round(c.failureRate * 100)}%</span>
                </span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">
                {c.document} · {c.students} student{c.students === 1 ? "" : "s"}
              </div>

              {c.worstQuestion && (
                <p className="mt-2.5 text-sm">
                  <span className="text-[var(--muted)]">Worst question: </span>
                  {c.worstQuestion.prompt}
                </p>
              )}

              {/* The misconception, where there is one. An error rate says a
                  class is stuck; the answer most of them chose says what they
                  believe, and that is what actually gets retaught. */}
              {c.misconception && (
                <p className="mt-2 rounded-xl bg-[rgba(251,191,36,0.10)] px-3 py-2 text-sm">
                  <span className="text-[#fcd34d]">
                    {c.misconception.count} of them chose “{c.misconception.answer}”
                  </span>
                  <span className="text-[var(--muted)]">
                    {" "}
                    — {Math.round(c.misconception.share * 100)}% of the wrong answers agree, so this is a shared belief
                    rather than scattered guessing.
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function AskedAboutPanel({ rows }: { rows: AskedAbout[] }) {
  const lessons = lessonsToRevisit(rows).slice(0, 8);

  return (
    <Panel
      title="Asked about most"
      hint="Where students pressed Explain or Give Example. This shows confusion before anyone gets a question wrong."
    >
      {lessons.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nobody has asked the assistant for help yet.
        </p>
      ) : (
        <div className="space-y-2">
          {lessons.map((l) => (
            <div
              key={l.topic}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{l.topic}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {l.presses} request{l.presses === 1 ? "" : "s"} from {l.students} student
                  {l.students === 1 ? "" : "s"}
                </div>
              </div>
              {/* A student who asked three times in one sitting has told you
                  the lesson did not land, whatever they later score. */}
              {l.repeatedStudents > 0 ? (
                <span className="rounded-full bg-[rgba(251,191,36,0.16)] px-2.5 py-1 text-[11px] text-[#fcd34d]">
                  {l.repeatedStudents} asked {REPEAT_THRESHOLD}+ times in one sitting
                </span>
              ) : (
                <span className="text-[11px] text-[var(--muted)]">no repeated asking</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
