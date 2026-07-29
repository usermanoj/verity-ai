// Machine-checkable properties of an English → Chinese translation.
//
// A caveat that has to be stated plainly, because the request was for
// "accurate, unit tested": you cannot unit-test that a translation is
// FAITHFUL. Fidelity is a judgement about meaning; a test can only assert
// things that are decidable. Pretending otherwise produces a suite that is
// green while the Chinese is wrong, which is worse than no suite at all.
//
// What IS decidable, and what every one of these checks covers, is the class
// of failure that actually shows up in production translation and that a
// reader cannot catch for themselves:
//
//   - a number or unit silently changed         (7 N becomes 5 N)
//   - the agreed term not used                  (磁场 becomes 磁力线)
//   - a passage dropped                         (the last third goes missing)
//   - English left untranslated                 (a sentence comes back as-is)
//   - the model answering instead of translating
//
// Semantic fidelity is covered separately, by the eval harness in
// evals/translate.eval.ts, which is a graded run against real material rather
// than a unit test — see docs/translation.md.

export type CheckSeverity = "error" | "warning";

export type CheckIssue = {
  code:
    | "numbers_changed"
    | "glossary_term_missing"
    | "too_short"
    | "untranslated"
    | "not_a_translation"
    | "empty";
  severity: CheckSeverity;
  detail: string;
};

export type Glossary = Record<string, { en: string; zh: string }>;

const CJK = /[㐀-䶿一-鿿]/;

// Numbers carry the physics. "moment = 7 N × 0.4 m" translated with 5 instead
// of 7 is not a style problem, and it is the one error a student reading in
// their second language has no way to catch.
function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d{3})*(?:[.,]\d+)?/g) ?? []).map(canonicalNumber);
}

// "0,4" and "0.4" are the same quantity written under different conventions,
// and so are "0.40" and "0.4" — comparing the raw strings reported a changed
// number for a translation that changed nothing.
function canonicalNumber(raw: string): string {
  // A comma before exactly three digits, followed by more digits or nothing,
  // is a thousands separator; anything else is a decimal mark.
  const withoutThousands = raw.replace(/,(?=\d{3}(?:\D|$))/g, "");
  const n = Number(withoutThousands.replace(",", "."));
  return Number.isFinite(n) ? String(n) : raw;
}

function countCjk(text: string): number {
  let n = 0;
  for (const ch of text) if (CJK.test(ch)) n += 1;
  return n;
}

// Phrases a model reaches for when it decides to comment rather than
// translate. Any of them at the start means the output is not the translation.
const PREAMBLE = /^\s*(here(?:'s| is)\b|sure[,!]|translation:|译文[:：]|以下是)/i;

/**
 * Checks a translation against its source.
 *
 * `glossary` maps an English term to its approved Chinese rendering; a term
 * present in the source must appear in the translation in that exact form, so
 * a student can match what they read back to the lesson.
 */
export function checkTranslation(source: string, translation: string, glossary: Glossary = {}): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const out = translation.trim();

  if (out.length === 0) {
    return [{ code: "empty", severity: "error", detail: "The translation is empty." }];
  }

  if (PREAMBLE.test(out)) {
    issues.push({
      code: "not_a_translation",
      severity: "error",
      detail: "Output starts with a preamble rather than the translation itself.",
    });
  }

  // Every number in the source must survive. Extra numbers are allowed —
  // Chinese renders some quantities differently — but a missing one is a
  // changed fact.
  const sourceNumbers = numbersIn(source);
  const outNumbers = new Set(numbersIn(out));
  const lost = sourceNumbers.filter((n) => !outNumbers.has(n));
  if (lost.length > 0) {
    issues.push({
      code: "numbers_changed",
      severity: "error",
      detail: `Numbers missing from the translation: ${[...new Set(lost)].join(", ")}`,
    });
  }

  for (const [term, entry] of Object.entries(glossary)) {
    if (!term.trim() || !entry.zh.trim()) continue;
    const present = new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "i");
    if (!present.test(source)) continue;
    // The approved rendering often carries a bracketed explanation; only the
    // head term needs to appear.
    const head = entry.zh.split(/[（(]/)[0].trim();
    if (head && !out.includes(head)) {
      issues.push({
        code: "glossary_term_missing",
        severity: "warning",
        detail: `"${term}" should appear as ${head}`,
      });
    }
  }

  // Chinese is far denser than English — a faithful translation of a long
  // English passage is usually well under half its length in characters. A
  // ratio this low means text was dropped, not that Chinese is compact.
  const cjk = countCjk(out);
  if (source.trim().length > 80 && cjk > 0 && cjk < source.trim().length * 0.15) {
    issues.push({
      code: "too_short",
      severity: "warning",
      detail: `Translation looks truncated (${cjk} Chinese characters for ${source.trim().length} of English).`,
    });
  }

  // An output with no Chinese at all, for a source that had none either, is
  // fine — a formula, a number. Otherwise it was not translated.
  if (cjk === 0 && /[A-Za-z]{3,}/.test(source)) {
    issues.push({
      code: "untranslated",
      severity: "error",
      detail: "The output contains no Chinese characters.",
    });
  }

  return issues;
}

export function hasBlockingIssue(issues: CheckIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** One line for a log or a teacher-facing panel. */
export function describeIssues(issues: CheckIssue[]): string {
  return issues.map((i) => `${i.severity}: ${i.detail}`).join("; ");
}
