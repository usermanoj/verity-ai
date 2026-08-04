// Whether a child opened the lesson, and how far through it they got.
//
// The gap this closes: until now a student who read carefully for twenty
// minutes and asked nothing was indistinguishable from one who never opened the
// page. Both showed as "not started", and those are opposite problems — one
// needs prompting, the other needs a reason to practise.
//
// WHAT IS DELIBERATELY NOT MEASURED
//
// No timing. Not how long a section was on screen, not how long the page was
// open, not whether the tab had focus. Those are the obvious things to record
// and they are surveillance of a minor: they measure a left-open tab as
// diligence and a fast reader as inattentive, and once collected they invite
// questions a school should not be answering about a child's afternoon.
//
// What is recorded is that a section came into view. It answers "did they get
// to the end of the lesson" and nothing finer, which is the question a teacher
// actually asked for.

/** One flush from a lesson page: the sections seen so far in that sitting. */
export type ReadingRow = {
  topicId: string;
  /** Zero-based indices of sections that came into view. */
  sections: number[];
  /** How many sections the lesson has, so "12" can be read as a fraction. */
  total: number;
  at: string;
};

export type Reading = {
  topicId: string;
  /** Distinct sections reached, across every sitting. */
  reached: number;
  /** The lesson's length, taken from the most recent report. */
  total: number;
  /** The furthest section reached, one-based for a human. */
  furthest: number;
  firstOpenedAt: string;
  lastOpenedAt: string;
};

/**
 * Folds every flush for one student into one row per lesson.
 *
 * Union rather than maximum: a child who reads sections 1-5 on Monday and 20-25
 * on Tuesday has reached ten sections, and taking the largest single report
 * would say six. Sittings add up.
 */
export function mergeReading(rows: ReadingRow[]): Reading[] {
  const byTopic = new Map<string, { seen: Set<number>; total: number; first: string; last: string }>();

  for (const row of rows) {
    const entry = byTopic.get(row.topicId) ?? {
      seen: new Set<number>(),
      total: row.total,
      first: row.at,
      last: row.at,
    };
    for (const s of row.sections) entry.seen.add(s);
    // The newest report wins on length: a teacher may have re-uploaded the
    // deck, and the fraction should describe the lesson as it stands.
    if (row.at >= entry.last) {
      entry.total = row.total;
      entry.last = row.at;
    }
    if (row.at < entry.first) entry.first = row.at;
    byTopic.set(row.topicId, entry);
  }

  return [...byTopic].map(([topicId, e]) => ({
    topicId,
    reached: e.seen.size,
    total: e.total,
    furthest: e.seen.size === 0 ? 0 : Math.max(...e.seen) + 1,
    firstOpenedAt: e.first,
    lastOpenedAt: e.last,
  }));
}

/**
 * Opening a lesson and reading none of it.
 *
 * One section is what you get for loading the page — the first card is on
 * screen before anyone has done anything — so it cannot count as reading.
 */
export const SKIMMED_AT_MOST = 1;

/** Reached this share of a lesson and they have been through it. */
export const READ_MOST_ABOVE = 0.8;

export type Engagement =
  | "never_opened"
  | "opened_only"
  | "read_some"
  | "read_most"
  | "read_and_practised";

/**
 * What to say about a child and one lesson.
 *
 * Takes the answers as well as the reading, because the two together are the
 * finding. "Read the whole lesson and answered nothing" and "answered
 * everything without opening the lesson" are both worth a teacher's attention
 * and neither is visible from one number alone.
 */
export function engagement(reading: Reading | undefined, attempts: number): Engagement {
  if (!reading) return attempts > 0 ? "read_and_practised" : "never_opened";
  if (attempts > 0) return "read_and_practised";
  if (reading.reached <= SKIMMED_AT_MOST) return "opened_only";
  if (reading.total > 0 && reading.reached / reading.total > READ_MOST_ABOVE) return "read_most";
  return "read_some";
}

/**
 * The same judgement as a sentence for a teacher.
 *
 * Written as observations rather than verdicts. "Opened it and went no further"
 * is something a teacher can ask a child about; "disengaged" is a label that
 * arrives at a conclusion they have not agreed to.
 */
export function describeEngagement(e: Engagement, reading: Reading | undefined): string {
  switch (e) {
    case "never_opened":
      return "Hasn't opened this lesson.";
    case "opened_only":
      return "Opened it and went no further than the first section.";
    case "read_some":
      return reading
        ? `Read ${reading.reached} of ${reading.total} sections, and hasn't practised.`
        : "Read part of it, and hasn't practised.";
    case "read_most":
      return "Read the lesson through, but hasn't practised any of it.";
    case "read_and_practised":
      return reading
        ? `Read ${reading.reached} of ${reading.total} sections, and practised.`
        : "Practised, though the reading wasn't recorded.";
  }
}
