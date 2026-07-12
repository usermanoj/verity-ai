"use client";

import { useState } from "react";
import { GLOSSARY } from "@/data/corpus";

// Highlights approved glossary terms; hover/tap shows an EN + 中文 gloss.
export default function ReadingText({ text }: { text: string }) {
  const [active, setActive] = useState<string | null>(null);
  const terms = Object.keys(GLOSSARY);
  const pattern = new RegExp(`\\b(${terms.join("|")})\\b`, "gi");
  const parts = text.split(pattern);

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
