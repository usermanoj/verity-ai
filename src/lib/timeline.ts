// What a child's afternoon actually looked like.
//
// Pure, and separate from the SQL, because every rule here is a claim about a
// person: where one sitting ends and the next begins, whether asking for help
// worked, and what counts as answering too fast to have thought. Those are
// judgements, and a teacher may reasonably disagree with any of them — which is
// the argument for having them in one readable file with tests rather than
// spread through a query.
//
// Built entirely from timestamps already stored. Nothing here needs new capture,
// which is why it exists at all: the alternative — logging how long a child
// looks at a page — is behavioural surveillance of a minor, and it measures a
// left-open tab as diligence.

export type TimelineEvent = {
  at: string;
  kind: "answer" | "ask";
  correct: boolean | null;
  label: string | null;
  detail: string | null;
  section: string | null;
  intent: string | null;
};

/**
 * Longer than this between two actions and it is a different sitting.
 *
 * Twenty minutes is a judgement, not a measurement. Too short and a child who
 * paused to read the lesson gets split in two; too long and last night's
 * homework merges into this morning's lesson. It is deliberately a named
 * constant so the argument can be had without reading a query.
 */
export const SESSION_GAP_MS = 20 * 60 * 1000;

/** An answer given faster than this probably was not read. */
export const RUSHED_MS = 10_000;

/** Asking counts as help; being asked a question does not. */
const HELP_INTENTS = new Set(["explain", "example", "translate"]);

export type Session = {
  startedAt: string;
  endedAt: string;
  /** Wall-clock between first and last action. NOT time on task. */
  spanMs: number;
  events: TimelineEvent[];
  answers: number;
  correct: number;
  asks: number;
};

/**
 * Groups events into sittings.
 *
 * A sitting's span is the distance between its first and last action, which is
 * a floor on the time spent and never a measure of attention. A child who
 * answered at 14:00 and again at 14:22 was present for at least 22 minutes; it
 * says nothing about the 21 minutes in between, and the interface must not
 * pretend otherwise.
 */
export function toSessions(events: TimelineEvent[], gapMs = SESSION_GAP_MS): Session[] {
  const ordered = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const sessions: Session[] = [];

  for (const event of ordered) {
    const time = Date.parse(event.at);
    if (Number.isNaN(time)) continue;

    const current = sessions[sessions.length - 1];
    if (current && time - Date.parse(current.endedAt) <= gapMs) {
      current.events.push(event);
      current.endedAt = event.at;
      current.spanMs = time - Date.parse(current.startedAt);
    } else {
      sessions.push({
        startedAt: event.at,
        endedAt: event.at,
        spanMs: 0,
        events: [event],
        answers: 0,
        correct: 0,
        asks: 0,
      });
    }
  }

  for (const s of sessions) {
    s.answers = s.events.filter((e) => e.kind === "answer").length;
    s.correct = s.events.filter((e) => e.kind === "answer" && e.correct).length;
    s.asks = s.events.filter((e) => e.kind === "ask").length;
  }
  return sessions;
}

export type HelpEffect = { helped: number; correctAfterHelp: number; unaidedCorrect: number; unaided: number };

/**
 * Did asking for help make the next answer right?
 *
 * The measure this whole product exists to justify. A closed-corpus tutor that
 * guides rather than answering is a claim about learning, and this is the
 * closest thing to evidence for it that can be had without an experiment:
 * answers given straight after asking, against answers given cold.
 *
 * Not proof. A student asks for help on the questions they find hard, so the
 * two groups are not comparable and the aided rate being LOWER is the expected
 * result, not a failure. What is worth reading is the direction over a term,
 * per child.
 */
export function helpEffect(events: TimelineEvent[], gapMs = SESSION_GAP_MS): HelpEffect {
  const ordered = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const effect: HelpEffect = { helped: 0, correctAfterHelp: 0, unaidedCorrect: 0, unaided: 0 };

  let helpPending = false;
  let helpAt = 0;
  for (const event of ordered) {
    const time = Date.parse(event.at);
    if (Number.isNaN(time)) continue;

    if (event.kind === "ask") {
      if (event.intent && HELP_INTENTS.has(event.intent)) {
        helpPending = true;
        helpAt = time;
      }
      continue;
    }

    // Help only counts if the answer came in the same sitting. An explanation
    // read last night did not help with this morning's question in any sense
    // this function can defend.
    const aided = helpPending && time - helpAt <= gapMs;
    if (aided) {
      effect.helped += 1;
      if (event.correct) effect.correctAfterHelp += 1;
    } else {
      effect.unaided += 1;
      if (event.correct) effect.unaidedCorrect += 1;
    }
    helpPending = false;
  }
  return effect;
}

export type Pacing = { medianMs: number | null; rushed: number; measured: number };

/**
 * How long between one answer and the next.
 *
 * The gap BEFORE an answer, which includes reading the question and thinking —
 * and also includes going to make a cup of tea, so only the median is reported
 * and only within a sitting. A mean would be destroyed by one interruption.
 *
 * `rushed` is the count under ten seconds: too fast to have read a question,
 * let alone answered it. That is the number worth a teacher's attention, and it
 * is a count rather than a rate because three rushed answers out of five is a
 * different conversation from three out of fifty.
 */
export function pacing(events: TimelineEvent[], gapMs = SESSION_GAP_MS): Pacing {
  const gaps: number[] = [];
  let rushed = 0;

  for (const session of toSessions(events, gapMs)) {
    let previous: number | null = null;
    for (const event of session.events) {
      const time = Date.parse(event.at);
      if (event.kind !== "answer") {
        previous = time;
        continue;
      }
      if (previous !== null) {
        const gap = time - previous;
        gaps.push(gap);
        if (gap < RUSHED_MS) rushed += 1;
      }
      previous = time;
    }
  }

  if (gaps.length === 0) return { medianMs: null, rushed, measured: 0 };
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return { medianMs, rushed, measured: gaps.length };
}

/**
 * A span in words, rounded honestly.
 *
 * Never to the second. The underlying figure is the distance between two
 * actions, and presenting that as "22m 14s" claims a precision about a child's
 * attention that nobody has.
 */
export function describeSpan(ms: number): string {
  // Checked against the raw span, not against the rounded minutes: rounding
  // first turns thirty seconds into "1 min", which is the one direction this
  // must not err in — overstating how long a child worked.
  if (ms < 60_000) return "under a minute";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
