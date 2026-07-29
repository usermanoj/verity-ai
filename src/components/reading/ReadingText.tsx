"use client";

import { useState } from "react";

export type Glossary = Record<string, { en: string; zh: string }>;

// Highlights approved glossary terms; hover/tap shows an EN + 中文 gloss.
//
// The terms are passed in rather than imported. They used to be one fixed
// list hand-written for the two demo topics, so on any uploaded document
// nothing matched — and a glossary that highlights nothing is indistinguishable
// from one that has been switched off. Each document now carries the
// vocabulary extracted from its own text at ingestion.
export default function ReadingText({ text, glossary }: { text: string; glossary?: Glossary }) {
  const [active, setActive] = useState<string | null>(null);
  const GLOSSARY = glossary ?? {};
  // Longest first. Regex alternation takes the first branch that matches at a
  // position, so with "magnetic" ahead of "magnetic field" the phrase could
  // never win — the student would get the gloss for the adjective and the
  // word "field" left bare. Same for "pole" shadowing "north pole", and
  // "speed" shadowing "steady speed".
  const terms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  // An empty list would build /\b()\b/, which matches at every position and
  // shatters the paragraph into one span per character.
  const parts = terms.length
    ? text.split(new RegExp(`\\b(${terms.join("|")})\\b`, "gi"))
    : [text];

  return (
    <p className="text-[15px] leading-8 text-[var(--text)]/90">
      {parts.map((part, i) => {
        const key = part.toLowerCase();
        if (GLOSSARY[key]) {
          const g = GLOSSARY[key];
          return (
            <span key={i} className="relative">
              <span
                className="esl-term"
                onMouseEnter={() => setActive(`${i}`)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive(active === `${i}` ? null : `${i}`)}
              >
                {part}
              </span>
              {active === `${i}` && (
                <span className="absolute bottom-full left-1/2 z-20 mb-1 w-56 -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[#0e1530] p-2.5 text-xs shadow-xl">
                  <span className="block font-semibold text-[var(--brand2)]">{part}</span>
                  <span className="block text-[var(--muted)]">{g.en}</span>
                  <span className="mt-0.5 block text-[var(--text)]">{g.zh}</span>
                </span>
              )}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
