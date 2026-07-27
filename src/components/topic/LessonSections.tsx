"use client";

import { motion } from "framer-motion";
import ReadingText from "@/components/reading/ReadingText";
import ConceptVisual, { assignVisuals, type VisualKind } from "./visuals/ConceptVisual";
import DataTable, { type SectionTable } from "./DataTable";
import { ComparisonCard, FormulaCard, RelationshipCard } from "./StructuredViews";
import { detectComparison, detectFormula, detectRelationship, type Comparison, type Formula, type Relationship } from "./structure";
import type { CorpusChunk } from "@/data/corpus";

// Turns approved material into a designed lesson.
//
// The hand-built demo topics read well because someone shaped them. Uploaded
// decks were getting the same words with none of that shape: an undivided
// column of paragraphs, each stamped with "<file> — Page/Section 7", which is
// filing metadata a student has no use for. The provenance guarantee is real
// and worth stating, but it belongs once at the top of the lesson, not under
// every paragraph.
//
// Nothing here invents content. Each renderer is a different *presentation*
// of text that is already in the corpus — a list already written as a list, a
// table already written as a table — chosen by looking at the shape of the
// text. Anything unrecognised falls back to prose, so the failure mode is
// "looks plain", never "shows something the teacher didn't approve".

export type SectionMedia = { url: string; width?: number; height?: number; kind?: "figure" | "slide" };

export default function LessonSections({
  chunks,
  mediaByPage = {},
  tablesByPage = {},
}: {
  chunks: CorpusChunk[];
  mediaByPage?: Record<number, SectionMedia[]>;
  tablesByPage?: Record<number, SectionTable[]>;
}) {
  const mediaFor = (c: CorpusChunk) => mediaByPage[pageOf(c.source)] ?? [];
  const tablesFor = (c: CorpusChunk) => tablesByPage[pageOf(c.source)] ?? [];

  // Decided across the whole lesson, not per section: a concept earns its
  // interactive once. Five sections about electromagnets used to render five
  // identical coil widgets, which reads as automation rather than authorship.
  const visuals = assignVisuals(
    chunks.map((c) => {
      const heading = c.heading?.trim() ?? "";
      return {
        heading,
        text: c.text.trim() === heading ? "" : c.text,
        // Only an inline figure counts as already-illustrated. A rendered
        // slide is collapsed by default, so treating it as media would
        // quietly deny the section an interactive it could have had.
        hasMedia: mediaFor(c).some((m) => m.kind !== "slide"),
      };
    }),
  );

  // Consecutive sections sharing a module become one part of the lesson.
  // Grouping by consecutive run rather than by name keeps reading order
  // intact — a deck that returns to an earlier theme should not have its
  // later sections yanked back up the page to join it.
  const parts: { module?: string; items: { chunk: CorpusChunk; index: number }[] }[] = [];
  chunks.forEach((chunk, index) => {
    const last = parts[parts.length - 1];
    if (last && last.module === chunk.module) last.items.push({ chunk, index });
    else parts.push({ module: chunk.module, items: [{ chunk, index }] });
  });

  const showModules = parts.some((p) => p.module) && parts.length > 1;

  return (
    <div className="space-y-5">
      {parts.map((part, partIndex) => (
        <div key={`${part.module ?? "part"}-${partIndex}`} className="space-y-5">
          {showModules && part.module && (
            <motion.h3
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex items-center gap-3 pt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand2)]"
            >
              <span className="h-px w-6 bg-[var(--brand2)]/50" />
              {part.module}
              <span className="text-[var(--muted)] normal-case tracking-normal">
                · {part.items.length} section{part.items.length === 1 ? "" : "s"}
              </span>
            </motion.h3>
          )}
          {part.items.map(({ chunk, index }) => (
            <Section
              key={chunk.id}
              chunk={chunk}
              index={index}
              media={mediaFor(chunk)}
              tables={tablesFor(chunk)}
              visual={visuals[index]}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// The page number a chunk came from lives only in its citation string.
function pageOf(source: string): number {
  const match = /Page\/Section\s+(\d+)\s*$/.exec(source);
  return match ? Number(match[1]) : -1;
}

function Section({
  chunk,
  index,
  media,
  tables,
  visual,
}: {
  chunk: CorpusChunk;
  index: number;
  media: SectionMedia[];
  tables: SectionTable[];
  visual: VisualKind | null;
}) {
  const heading = chunk.heading?.trim() || "Section";
  const body = chunk.text.trim() === heading ? "" : chunk.text;
  const view = body ? classify(body) : { kind: "empty" as const };
  const figures = media.filter((m) => m.kind !== "slide");
  const slides = media.filter((m) => m.kind === "slide");

  return (
    <motion.section
      id={`section-${index + 1}`}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass group relative scroll-mt-28 overflow-hidden rounded-3xl p-6 transition-colors hover:border-[rgba(99,102,241,0.45)]"
    >
      {/* A quiet accent that warms on hover — the cards read as objects you
          can move through rather than as one undifferentiated wall. */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(99,102,241,0.6)] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <header className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand2)] text-base shadow-lg shadow-[rgba(99,102,241,0.25)]">
          {iconFor(heading)}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug">{heading}</h3>
          <span className="text-[11px] uppercase tracking-widest text-[var(--muted)]">Section {index + 1}</span>
        </div>
      </header>

      {view.kind === "table" && (
        <>
          <DataTable table={{ headers: view.table.headers, rows: view.table.rows }} />
          {view.table.rest && (
            <div className="mt-3">
              <ReadingText text={view.table.rest} />
            </div>
          )}
        </>
      )}
      {view.kind === "comparison" && <ComparisonCard comparison={view.comparison} />}
      {view.kind === "formula" && <FormulaCard formula={view.formula} />}
      {view.kind === "relationship" && <RelationshipCard relationship={view.relationship} />}
      {view.kind === "chips" && <ChipList items={view.items} lead={view.lead} />}
      {view.kind === "definition" && (
        <div className="rounded-2xl border-l-2 border-[var(--brand2)] bg-[rgba(34,211,238,0.07)] py-3 pl-4 pr-3">
          <ReadingText text={view.text} />
        </div>
      )}
      {view.kind === "prose" && <ReadingText text={view.text} />}

      {figures.length > 0 && (
        <div className={`mt-4 grid gap-3 ${figures.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {figures.map((m) => (
            <motion.figure
              key={m.url}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white/95 p-2"
            >
              {/* Plain <img>: these are signed, short-lived Storage URLs on a
                  host next/image would have to be configured to allow, and
                  the signature changes per request so an optimiser cache
                  would miss every time. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt={`Diagram from ${heading}`}
                width={m.width}
                height={m.height}
                loading="lazy"
                className="mx-auto h-auto max-h-80 w-auto max-w-full rounded-lg"
              />
            </motion.figure>
          ))}
        </div>
      )}

      {/* A rendered page carries the section's text as well as its diagram,
          so showing it inline would print everything twice. It sits behind a
          disclosure instead — there for the vector-drawn figures that cannot
          be extracted any other way, and for a student who wants to see the
          slide exactly as their teacher presented it. */}
      {slides.length > 0 && (
        <details className="group mt-4">
          <summary className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
            <span className="transition-transform group-open:rotate-90">▸</span>
            Show the original slide
          </summary>
          <div className="mt-3 grid gap-3">
            {slides.map((m) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={m.url}
                src={m.url}
                alt={`Original slide for ${heading}`}
                width={m.width}
                height={m.height}
                loading="lazy"
                className="w-full rounded-2xl border border-[var(--border)]"
              />
            ))}
          </div>
        </details>
      )}

      {tables.map((t, i) => (
        <DataTable key={i} table={t} />
      ))}

      {visual && <ConceptVisual kind={visual} />}
    </motion.section>
  );
}

/* ---------------------------------------------------------------- classify */

type View =
  | { kind: "empty" }
  | { kind: "prose"; text: string }
  | { kind: "definition"; text: string }
  | { kind: "chips"; items: string[]; lead: string }
  | { kind: "comparison"; comparison: Comparison }
  | { kind: "formula"; formula: Formula }
  | { kind: "relationship"; relationship: Relationship }
  | { kind: "table"; table: DetectedTable };

function classify(text: string): View {
  const table = detectTable(text);
  if (table) return { kind: "table", table };

  // Ordered by how specific the shape is. A comparison is unmistakable and
  // reads worst as a paragraph, so it goes first; a formula can sit inside
  // any kind of section; a proportionality is a single sentence and yields to
  // both. Anything unmatched stays prose — the safe default, since a wrong
  // layout misrepresents the teacher's meaning.
  const comparison = detectComparison(text);
  if (comparison) return { kind: "comparison", comparison };

  const formula = detectFormula(text);
  if (formula) return { kind: "formula", formula };

  const relationship = detectRelationship(text);
  if (relationship) return { kind: "relationship", relationship };

  const chips = detectChipList(text);
  if (chips) return { kind: "chips", ...chips };

  if (DEFINITION.test(text) && text.length < 320) return { kind: "definition", text };

  return { kind: "prose", text };
}

const DEFINITION = /\b(is called|are called|is defined as|is known as|means that)\b/i;

// Heading keywords → a glyph. Purely decorative: a wrong guess costs nothing,
// so the fallback is a neutral mark rather than anything that would assert
// something false about the content.
const ICONS: [RegExp, string][] = [
  [/magnet|pole|field/i, "🧲"],
  [/force|moment|torque|push|pull/i, "⚙️"],
  [/graph|chart|plot|distance|speed|time/i, "📈"],
  [/energy|heat|electric|current|circuit/i, "⚡"],
  [/example|worked|practice/i, "✏️"],
  [/definition|meaning|what is/i, "📗"],
  [/material|substance|metal|element/i, "🔬"],
  [/goal|objective|learn|outcome/i, "🎯"],
  [/history|ancient|discover/i, "🏛️"],
  [/use|application|everyday|real/i, "🌍"],
];

function iconFor(heading: string): string {
  for (const [pattern, icon] of ICONS) if (pattern.test(heading)) return icon;
  return "◆";
}

/* ------------------------------------------------------------------- chips */

// Slides list things as a stream ("aluminium (Al) silver (Ag) iron (Fe)…"),
// which extraction flattens into an unreadable run of words. The items are
// already discrete in the source; this only stops rendering them as a
// sentence.
function detectChipList(text: string): { items: string[]; lead: string } | null {
  const matches = [...text.matchAll(/([A-Za-z][A-Za-z-]+)\s*\(([A-Za-z]{1,3})\)/g)];
  if (matches.length < 4) return null;

  const first = matches[0];
  const last = matches[matches.length - 1];
  const runStart = first.index ?? 0;
  const runEnd = (last.index ?? 0) + last[0].length;

  // Bail out if the "list" is really prose with parenthetical asides sprinkled
  // through it — a dense run is the signal, not the count alone.
  const run = text.slice(runStart, runEnd);
  const matchedChars = matches.reduce((n, m) => n + m[0].length, 0);
  if (matchedChars / run.length < 0.7) return null;

  return {
    items: matches.map((m) => `${m[1]} (${m[2]})`),
    lead: text.slice(0, runStart).trim(),
  };
}

function ChipList({ items, lead }: { items: string[]; lead: string }) {
  return (
    <div>
      {lead && (
        <div className="mb-3">
          <ReadingText text={lead} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <motion.span
            key={item + i}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.03 }}
            className="rounded-xl border border-[var(--border)] bg-[rgba(99,102,241,0.1)] px-3 py-1.5 text-sm"
          >
            {item}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- table */

export type DetectedTable = { headers: string[]; rows: string[][]; rest: string };


// Looks for the flattened "<label> <label> <n> <n> <n> <n>…" shape a
// PowerPoint data table collapses into. Conservative on purpose: anything it
// isn't confident about falls back to prose, since a wrong table is worse
// than none — a student would read mispaired numbers as real data.
//
// The value run is walked token by token rather than matched by regex: a
// quantifier over "number + whitespace" cannot see the final value of a run
// that ends the string, which both dropped a reading from every well-formed
// table and turned odd-length runs into plausible-looking even ones.
export function detectTable(text: string): DetectedTable | null {
  const headers = HEADER_PAIR.exec(text);
  if (!headers) return null;

  const afterHeaders = headers.index + headers[0].length;
  const tokens = text.slice(afterHeaders).split(/\s+/);

  const values: string[] = [];
  while (values.length < tokens.length && /^-?\d+(\.\d+)?$/.test(tokens[values.length])) {
    values.push(tokens[values.length]);
  }

  // Four values (two rows) is the minimum that reads as a table, and an odd
  // count means the run isn't two clean columns.
  if (values.length < 4 || values.length % 2 !== 0) return null;

  const rows: string[][] = [];
  for (let i = 0; i < values.length; i += 2) rows.push([values[i], values[i + 1]]);

  return {
    headers: [headers[1].trim(), headers[2].trim()],
    rows,
    rest: `${text.slice(0, headers.index).trim()} ${tokens.slice(values.length).join(" ").trim()}`.trim(),
  };
}

// A column label: up to three words, then "in", then a unit ("Time in s",
// "Distance travelled in m", "Speed in m/s"). Sentence punctuation is
// excluded and the word count capped so a label cannot run backwards into the
// prose in front of it — an earlier version matched periods and unlimited
// words, which turned "A car is stationary. Time in s" into one header.
const LABEL = String.raw`[A-Za-z][\w()/]*(?:\s+[A-Za-z][\w()/]*){0,2}\s+in\s+[\w/²³]+`;
const HEADER_PAIR = new RegExp(String.raw`(${LABEL})\s+(${LABEL})\s+(?=-?\d)`);
