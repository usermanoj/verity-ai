import { createHash } from "node:crypto";

// Turning a failure into something groupable, and safe to store.
//
// Pure and separate from the reporting call, because both rules here are
// judgements worth testing: what counts as "the same problem" (or an error log
// becomes a list of near-duplicates nobody reads), and what must never be
// written down (this is a database about children).

/** Longer than this and nobody reads the rest anyway. */
export const MAX_MESSAGE = 300;

// Redacted before storage AND before hashing. Before storage because a school's
// operations log must not accumulate personal data as a side effect of things
// going wrong — Supabase errors quote row contents, which here means a child's
// email or their answer. Before hashing because an id in the message would make
// every occurrence a distinct "problem".
const REDACTIONS: [RegExp, string][] = [
  [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "<email>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>"],
  // Bearer tokens and API keys, in case one reaches an error message. A leaked
  // key in a table staff can read is a security incident born of a log line.
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "<key>"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "<jwt>"],
  // A developer's home directory carries their name, and a stack from a local
  // run would put it in a table the whole school's staff can read.
  [/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\\/\s)]+/g, "<home>"],
  // Any run of four or more digits: row counts, ports and timestamps all differ
  // between occurrences of one fault.
  [/\d{4,}/g, "<n>"],
];

/**
 * The message with identifiers and secrets removed, truncated.
 *
 * Applied to everything stored, not only to what is hashed.
 */
export function sanitise(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out.length > MAX_MESSAGE ? `${out.slice(0, MAX_MESSAGE - 1)}…` : out;
}

/**
 * A stable id for "this problem in this place".
 *
 * Hashed from the area and the sanitised message, so the same fault reported a
 * thousand times in a retry loop is one row with a count of a thousand rather
 * than a thousand rows burying everything else.
 */
export function fingerprintFor(area: string, message: string): string {
  return createHash("sha256").update(`${area}\n${sanitise(message)}`).digest("hex").slice(0, 32);
}

/**
 * The readable part of a stack: where our code was, not the framework's.
 *
 * Node stacks run to dozens of frames of internals. The first few of ours are
 * what identify the call site; the rest is noise that would have to be scrolled
 * past every time.
 */
export function briefStack(stack: string | undefined, frames = 4): string | null {
  if (!stack) return null;
  const usable = stack
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at ") && !l.includes("node:internal"));

  // Our own frames first. A failure inside Next or Supabase produces several
  // library frames before reaching our code, and with a fixed window the one
  // line naming the call site gets pushed out — which is the only line that
  // tells anyone where to look. Observed on the first real report: three Next
  // frames ahead of `getRecordedErrors`. Falls back to library frames when
  // there are no others, since a stack of something beats a stack of nothing.
  const ours = usable.filter((l) => !l.includes("node_modules"));
  const kept = (ours.length ? ours : usable).slice(0, frames);
  return kept.length ? sanitiseStack(kept.join("\n")) : null;
}

// Stacks get the same redaction as messages: a path can contain a user name,
// and a query string in a frame can contain anything at all.
function sanitiseStack(stack: string): string {
  let out = stack;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}
