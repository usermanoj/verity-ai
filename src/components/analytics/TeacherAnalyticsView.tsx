import { Locked, Panel, Stat, StackedBar } from "./charts";
import { TeacherLearningPanels } from "./LearningPanels";
import type { TeacherAnalytics, TeacherLearning } from "@/lib/analytics";

// What a teacher needs from a dashboard during rollout is not a leaderboard.
// It is: what is live to my students, what is waiting on me, and where are
// the holes. Every number below is counted from their own uploads.
// Split out so the Overview tab can lead with the four numbers a teacher
// checks daily, without dragging the whole analysis onto the same screen.
export function TeacherStats({ data }: { data: TeacherAnalytics }) {
  const needsAttention = data.documents.pending + data.questions.pending;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Live to students" value={data.documents.approved} hint="approved documents" tone="good" />
      <Stat label="Sections live" value={data.sectionsLive} hint="approved chunks students can read" />
      <Stat label="Questions live" value={data.questions.approved} hint="approved practice questions" tone="good" />
      <Stat
        label="Waiting on you"
        value={needsAttention}
        hint={`${data.documents.pending} document${data.documents.pending === 1 ? "" : "s"} · ${data.questions.pending} question${data.questions.pending === 1 ? "" : "s"}`}
        tone={needsAttention > 0 ? "warn" : "default"}
      />
    </div>
  );
}

// What remains here is about the MATERIAL — coverage and balance. The three
// panels above it on the page are about the children.
//
// Two panels left when the students' own views arrived. "Material added, last
// twelve weeks" was a productivity chart about the teacher: it helped nobody
// teach and read faintly like surveillance. "Classes with no material" now
// sits on the Classes tab beside the code a teacher is about to hand out,
// which is the moment it can be acted on rather than merely noted.
export default function TeacherAnalyticsView({
  data,
  learning,
}: {
  data: TeacherAnalytics;
  learning: TeacherLearning | null;
}) {

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Difficulty mix"
          hint="Of the questions students can currently see. A bank that is all one level trains one skill."
        >
          <StackedBar
            segments={["Easy", "Medium", "Challenge"].map((level) => ({
              label: level,
              value: data.byLevel.find((l) => l.level === level)?.count ?? 0,
            }))}
          />
        </Panel>

        <Panel title="Question formats" hint="Recall, recognition and vocabulary are different skills.">
          <StackedBar
            segments={data.byFormat.map((f) => ({ label: formatName(f.format), value: f.count }))}
          />
        </Panel>
      </div>

      {/* Named work rather than a percentage nobody can act on.
          Guarded on its OWN list: removing the sibling panel left this one
          keyed to whether any section lacked MATERIAL, which is a different
          question — a teacher whose sections were all stocked would never
          have seen their unpractisable topics. */}
      {data.topicsWithoutQuestions.length > 0 && (
        <Panel
          title="Topics students can read but not practise"
          hint="Approved material with no approved questions. It looks like a finished lesson and is not one."
        >
          <ul className="space-y-1.5 text-sm">
            {data.topicsWithoutQuestions.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />
                <span className="truncate text-[var(--text)]/85">{t.name}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}


      {/* Real once students have answered something. The locked state is kept
          rather than deleted: a school with no student activity yet should be
          told why the panel is empty, not shown zeroes that look like a
          finding. */}
      {learning && learning.overall.attempts > 0 ? (
        <>
          <h2 className="pt-2 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">
            How your students are doing
          </h2>
          <TeacherLearningPanels data={learning} />
        </>
      ) : (
        <Locked title="How your students are doing" needs="students to join and practise">
          Attempts, scores, which topics a class struggles with, and who is asking the assistant for answers rather
          than explanations. Nothing has been recorded yet, so nothing is shown.
        </Locked>
      )}
    </div>
  );
}

function formatName(kind: string): string {
  const names: Record<string, string> = {
    mcq: "Multiple choice",
    truefalse: "True / false",
    fill: "Fill the blank",
    matching: "Matching",
    numeric: "Calculation",
  };
  return names[kind] ?? kind;
}
