"use client";

import { motion } from "framer-motion";
import ReadingText from "@/components/reading/ReadingText";
import type { CorpusChunk } from "@/data/corpus";

// Presents approved material as a numbered lesson rather than a flat list of
// chunks. The hand-built demo topics read well because they were *designed*
// — sectioned, paced, with the eye pulled down the page. Uploaded decks were
// getting the same content with none of that shape.
//
// Tabular slide content ("Time in s Distance in m 0 50 1 50") is detected and
// rendered as an actual table: PowerPoint tables flatten into a run-on line
// during extraction, which was some of the least readable output on the page.
export default function LessonSections({ chunks }: { chunks: CorpusChunk[] }) {
  return (
    <div className="space-y-4">
      {chunks.map((c, i) => {
        const body = c.text.trim() === c.heading.trim() ? "" : c.text;
        const table = body ? detectTable(body) : null;
        return (
          <motion.section
            key={c.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.04 }}
            className="glass rounded-3xl p-6"
          >
            <div className="mb-3 flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold leading-snug">{c.heading || "Section"}</h3>
            </div>

            {table ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                    <tr className="border-b border-[var(--border)]">
                      {table.headers.map((h, j) => (
                        <th key={j} className="px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, j) => (
                      <tr key={j} className="border-b border-[var(--border)] last:border-0">
                        {row.map((cell, k) => (
                          <td key={k} className="px-3 py-2 tabular-nums">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.rest && (
                  <div className="mt-3">
                    <ReadingText text={table.rest} />
                  </div>
                )}
              </div>
            ) : (
              body && <ReadingText text={body} />
            )}

            <div className="mt-3 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">📖 {c.source}</div>
          </motion.section>
        );
      })}
    </div>
  );
}

type DetectedTable = { headers: string[]; rows: string[][]; rest: string };

// A column label: up to three words, then "in", then a unit ("Time in s",
// "Distance travelled in m", "Speed in m/s"). Sentence punctuation is
// excluded and the word count capped so a label cannot run backwards into the
// prose in front of it — an earlier version matched periods and unlimited
// words, which turned "A car is stationary. Time in s" into one header.
const LABEL = String.raw`[A-Za-z][\w()/]*(?:\s+[A-Za-z][\w()/]*){0,2}\s+in\s+[\w/²³]+`;
const HEADER_PAIR = new RegExp(String.raw`(${LABEL})\s+(${LABEL})\s+(?=-?\d)`);

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
