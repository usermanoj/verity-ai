"use client";

import { motion } from "framer-motion";
import ReadingText from "@/components/reading/ReadingText";
import type { Comparison, Formula, Relationship } from "./structure";

// Layouts for the shapes a lesson keeps writing in. Every word rendered here
// came from the teacher's slide — these components only decide where it sits.

/* -------------------------------------------------------------- comparison */

// Two labelled groups side by side. A contrast written as one paragraph makes
// a student hold both halves in their head at once and compare from memory;
// side by side, the comparison is the layout.
export function ComparisonCard({ comparison }: { comparison: Comparison }) {
  const sides = [
    { ...comparison.left, accent: "var(--brand)", tint: "rgba(99,102,241,0.10)" },
    { ...comparison.right, accent: "var(--brand2)", tint: "rgba(34,211,238,0.10)" },
  ];

  return (
    <div>
      {comparison.lead && <ReadingText text={comparison.lead} />}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {sides.map((side, i) => (
          <motion.div
            key={side.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="rounded-2xl border p-4"
            style={{ borderColor: side.accent, background: side.tint }}
          >
            <h4 className="mb-2 text-sm font-semibold" style={{ color: side.accent }}>
              {side.title}
            </h4>
            <ul className="space-y-1.5">
              {side.points.map((point, j) => (
                <li key={j} className="flex gap-2 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: side.accent }} />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ relationship */

// "Closer the poles, greater is the force." The sentence states a
// proportionality; the arrow shows it. Students are asked to state these back
// in exams, so the shape is worth making memorable.
export function RelationshipCard({ relationship }: { relationship: Relationship }) {
  return (
    <div>
      {relationship.lead && <ReadingText text={relationship.lead} />}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-black/20 p-4"
      >
        <span className="rounded-xl bg-[rgba(99,102,241,0.16)] px-3 py-2 text-sm font-medium text-[var(--brand2)]">
          {relationship.cause}
        </span>
        <motion.span
          aria-hidden
          className="text-lg text-[var(--muted)]"
          animate={{ x: [0, 5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          →
        </motion.span>
        <span className="rounded-xl bg-[rgba(52,211,153,0.16)] px-3 py-2 text-sm font-medium text-[#6ee7b7]">
          {relationship.effect}
        </span>
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------------- formula */

// A formula buried mid-paragraph is read as prose and forgotten. Pulled out
// and set large, it becomes the thing the section is about — which it is.
export function FormulaCard({ formula }: { formula: Formula }) {
  return (
    <div>
      {formula.lead && <ReadingText text={formula.lead} />}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="my-3 overflow-x-auto rounded-2xl border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.07)] p-4 text-center"
      >
        <div className="flex flex-wrap items-center justify-center gap-2 text-lg">
          <span className="font-semibold text-[var(--warn)]">{formula.result}</span>
          <span className="text-[var(--muted)]">=</span>
          <span className="font-medium">{formula.expression}</span>
        </div>
      </motion.div>
      {formula.rest && <ReadingText text={formula.rest} />}
    </div>
  );
}
