"use client";

import { useState } from "react";
import { splitByGlossary, type Glossary } from "@/lib/glossary-match";

export type { Glossary };

// Highlights approved glossary terms; hover/tap shows an EN + 中文 gloss.
//
// The terms are passed in rather than imported. They used to be one fixed
// list hand-written for the two demo topics, so on any uploaded document
// nothing matched — and a glossary that highlights nothing is indistinguishable
// from one that has been switched off. Each document now carries the
// vocabulary extracted from its own text at ingestion.
//
// The matching itself lives in lib/glossary-match.ts so it can be tested: it
// has already carried two faults that were invisible on screen (a phrase that
// could never win against a word inside it, and an empty list that matched
// every position).
export default function ReadingText({ text, glossary }: { text: string; glossary?: Glossary }) {
  const [active, setActive] = useState<number | null>(null);
  const pieces = splitByGlossary(text, glossary ?? {});

  return (
    <p className="text-[15px] leading-8 text-[var(--text)]/90">
      {pieces.map((piece, i) => {
        if (piece.kind === "text") return <span key={i}>{piece.text}</span>;
        return (
          <span key={i} className="relative">
            <span
              className="esl-term"
              // Tap as well as hover: the primary device is an iPad, where
              // there is no hover at all.
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
            >
              {piece.text}
            </span>
            {active === i && (
              <span className="absolute bottom-full left-1/2 z-20 mb-1 w-56 -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[#0e1530] p-2.5 text-xs shadow-xl">
                <span className="block font-semibold text-[var(--brand2)]">{piece.text}</span>
                <span className="block text-[var(--muted)]">{piece.en}</span>
                <span className="mt-0.5 block text-[var(--text)]">{piece.zh}</span>
              </span>
            )}
          </span>
        );
      })}
    </p>
  );
}
