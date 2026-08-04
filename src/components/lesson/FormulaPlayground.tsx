"use client";

import { useState } from "react";
import { compute, parseFormula, shortLabel, workingOut } from "@/lib/visuals/formula-play";
import { PRESSABLE } from "@/lib/ui";

// The teacher's own formula, with the numbers in the student's hands.
//
// Rendered per section like TableChart, not matched like the concept visuals:
// no catalogue entry, no subject gate, no competing for the one-per-lesson
// slot. It has no idea what subject it is in. If a section says
//
//   Moment = force x perpendicular distance from the turning point
//
// then that is what appears, and the same code does Density = mass / volume in
// a chemistry deck and Area = length x width in a maths one.
//
// Renders NOTHING when the section states no general formula — which is most
// sections, and the same contract TableChart has. A silent absence is the
// correct behaviour, not a gap to fill.

/** Sliders start here, so the first thing on screen is already a real sum. */
const START = 4;
const MAX = 12;

export default function FormulaPlayground({ text }: { text: string }) {
  const formula = parseFormula(text);
  const [values, setValues] = useState<number[]>([START, START]);

  if (!formula) return null;

  const answer = compute(formula, values);
  const sum = workingOut(formula, values);

  return (
    <figure className="mt-4 rounded-2xl border border-[var(--border)] bg-black/20 p-4">
      <figcaption className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--muted)]">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--brand)] text-[9px] text-white">▶</span>
        Try it — the rule from this section
      </figcaption>

      {/* The relationship as the teacher wrote it, above the numbers. A
          student should be able to see that the widget is their lesson and
          not something the software decided. */}
      <p className="mb-3 text-center text-sm text-[var(--brand2)]">{formula.source}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {formula.operands.map((operand, i) => (
          <label key={operand + i} className="block">
            <span className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span title={operand}>{shortLabel(operand)}</span>
              <span className="tabular-nums text-[var(--text)]">{values[i]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={MAX}
              step={1}
              value={values[i]}
              onChange={(e) => {
                const next = [...values];
                next[i] = Number(e.target.value);
                setValues(next);
              }}
              className="mt-1 w-full accent-[var(--brand)]"
            />
          </label>
        ))}
      </div>

      <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-center text-sm tabular-nums">
        {/* Dividing by zero has no answer, and saying so is better than
            printing one. */}
        {sum ?? `${formula.result} has no value when ${shortLabel(formula.operands[1])} is zero.`}
      </p>

      {answer !== null && (
        <p className="mt-2 text-center text-xs text-[var(--muted)]">
          {/* No units: the section names the quantities, and inventing units
              for them would be inventing content. The relationship is the
              thing being taught. */}
          Change either value and watch {formula.result.toLowerCase()} follow.
        </p>
      )}

      <button
        onClick={() => setValues([START, START])}
        className={`mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] ${PRESSABLE}`}
      >
        Reset
      </button>
    </figure>
  );
}
