import { BarList, Panel, Stat, StackedBar } from "./charts";
import type { AssistantUse, HardTopic, SchoolLearning, TeacherLearning } from "@/lib/analytics";

// Accuracy is shown as a percentage with its denominator alongside, always.
// "62%" from eight attempts and "62%" from four hundred are different facts,
// and a dashboard that renders them identically invites a decision the data
// cannot support.
function pct(correct: number, attempts: number): string {
  return attempts === 0 ? "—" : `${Math.round((correct / attempts) * 100)}%`;
}

/* --------------------------------------------------------------- teacher */

export function TeacherLearningPanels({ data }: { data: TeacherLearning }) {
  const { overall } = data;
  const participation =
    overall.studentsEnrolled === 0 ? 0 : Math.round((overall.studentsActive / overall.studentsEnrolled) * 100);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Class accuracy"
          value={pct(overall.correct, overall.attempts)}
          hint={`${overall.correct} of ${overall.attempts} answers`}
          tone={overall.attempts > 0 && overall.correct / overall.attempts < 0.6 ? "warn" : "good"}
        />
        <Stat
          label="Students practising"
          value={`${overall.studentsActive} / ${overall.studentsEnrolled}`}
          hint={`${participation}% of those enrolled`}
          tone={participation >= 60 ? "good" : "warn"}
        />
        <Stat label="Using the assistant" value={data.assistant.studentsUsing} hint="students who asked something" />
        <Stat
          label="Asking for answers"
          value={data.assistant.shortcutting}
          hint="mostly 'check' rather than 'explain'"
          tone={data.assistant.shortcutting > 0 ? "warn" : "default"}
        />
      </div>

      {data.bySection.length > 0 && (
        <Panel title="By section" hint="Accuracy, and how many of the class have practised at all.">
          <div className="space-y-3">
            {data.bySection.map((s) => (
              <div key={`${s.subject}-${s.grade}-${s.section}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm text-[var(--text)]/85">
                  {s.grade} {s.subject} · {s.section}
                </span>
                <span className="text-sm font-semibold tabular-nums">{pct(s.correct, s.attempts)}</span>
                <span className="text-xs text-[var(--muted)]">
                  {s.attempts} answers · {s.active}/{s.enrolled} students active
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <HardestTopics topics={data.hardestTopics} />

      {data.students.length > 0 && (
        <Panel
          title="Students to look at first"
          hint="Lowest accuracy first, from students with at least three answers."
        >
          <div className="space-y-2">
            {data.students.slice(0, 12).map((s) => {
              const rate = s.attempts === 0 ? 0 : s.correct / s.attempts;
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-[var(--text)]/85">{s.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${rate * 100}%`,
                        background: rate < 0.5 ? "var(--warn)" : "var(--good)",
                      }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">
                    {pct(s.correct, s.attempts)} of {s.attempts}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <AssistantPanel use={data.assistant} />
    </div>
  );
}

/* ------------------------------------------------------------ HOD/school */

export function SchoolLearningPanels({ data }: { data: SchoolLearning }) {
  const { overall } = data;
  const participation =
    overall.studentsEnrolled === 0 ? 0 : Math.round((overall.studentsActive / overall.studentsEnrolled) * 100);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Accuracy"
          value={pct(overall.correct, overall.attempts)}
          hint={`${overall.attempts} answers recorded`}
          tone={overall.attempts > 0 && overall.correct / overall.attempts < 0.6 ? "warn" : "good"}
        />
        <Stat
          label="Students practising"
          value={`${overall.studentsActive} / ${overall.studentsEnrolled}`}
          hint={`${participation}% of those enrolled`}
          tone={participation >= 60 ? "good" : "warn"}
        />
        <Stat label="Using the assistant" value={data.assistant.studentsUsing} hint="across the school" />
        <Stat
          label="Asking for answers"
          value={data.assistant.shortcutting}
          hint="mostly 'check' rather than 'explain'"
          tone={data.assistant.shortcutting > 0 ? "warn" : "default"}
        />
      </div>

      {data.bySubject.length > 0 && (
        <Panel title="Accuracy by subject and year" hint="Answers recorded shown alongside, since a rate without a count is not a result.">
          <BarList
            data={data.bySubject.map((s) => ({
              label: `${s.grade} ${s.subject}`,
              value: s.correct,
              secondary: s.attempts,
            }))}
            valueLabel="correct"
            secondaryLabel="answers"
          />
        </Panel>
      )}

      <HardestTopics topics={data.hardestTopics} />
      <AssistantPanel use={data.assistant} />

      <p className="text-xs text-[var(--muted)]">
        No individual students are named on this page. A class teacher sees named students because they cannot help a
        child they cannot identify; nothing here is improved by naming one.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- shared */

function HardestTopics({ topics }: { topics: HardTopic[] }) {
  if (topics.length === 0) return null;
  return (
    <Panel
      title="Topics students find hardest"
      hint="Lowest accuracy first. Topics with too few answers to mean anything are left out."
    >
      <div className="space-y-2.5">
        {topics.slice(0, 8).map((t) => {
          const rate = t.attempts === 0 ? 0 : t.correct / t.attempts;
          return (
            <div key={t.topic}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-[var(--text)]/85">{t.topic}</span>
                <span className="shrink-0 tabular-nums text-[var(--muted)]">
                  {pct(t.correct, t.attempts)} of {t.attempts}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${rate * 100}%`, background: rate < 0.5 ? "var(--warn)" : "var(--brand)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function AssistantPanel({ use }: { use: AssistantUse }) {
  if (use.intents.length === 0) return null;

  const names: Record<string, string> = {
    explain: "Explain it",
    example: "Give an example",
    askme: "Ask me questions",
    check: "Check my answer",
    translate: "Translate",
  };

  return (
    <Panel
      title="How the assistant is being used"
      hint="'Explain' and 'give an example' are learning. 'Check my answer' is asking whether an answer is right — useful, until it is all a student does."
    >
      <StackedBar segments={use.intents.map((i) => ({ label: names[i.intent] ?? i.intent, value: i.count }))} />
    </Panel>
  );
}
