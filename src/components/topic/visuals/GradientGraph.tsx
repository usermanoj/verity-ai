"use client";

import { useState } from "react";
import { meaning, slope, workings, type Point } from "@/lib/visuals/gradient";
import { PRESSABLE } from "@/lib/ui";

// Gradient equals speed, with the two points a student can actually move.
//
// The deck asks "Calculate the slope or gradient of this distance time graph
// between the points A and B" and then answers it once, on a fixed picture.
// This is the same graph with A and B in the student's hands: drag either, and
// the subtraction rewrites itself in the teacher's own form.
//
// The journey line is fixed and generic — a steady climb, a pause, a steeper
// climb — because inventing a specific journey would be inventing content. The
// numbers a student reads off are the ones they choose by dragging, not
// numbers this file asserts about anything.

// The plotted journey, in seconds and metres.
//
// Chosen so that the default A and B land on the teacher's own worked example
// — A at (1s, 50m), B at (3s, 150m), giving (150 − 50) ÷ (3 − 1) = 50 m/s,
// which is the sum printed on their slide. A student opens the interactive
// already looking at the answer in their exercise book, and only then starts
// moving things. Landing on some other pair would make the widget look like it
// disagreed with the lesson.
//
// The rest of the line carries the two other shapes the deck asks students to
// explain: a horizontal stretch (not moving) and a steeper one (faster).
const JOURNEY: Point[] = [
  { t: 0, d: 0 },
  { t: 3, d: 150 },
  { t: 4, d: 150 },
  { t: 6, d: 300 },
];

const T_MAX = 6;
const D_MAX = 300;
const X0 = 52;
const X1 = 300;
const Y0 = 150;
const Y1 = 20;

const x = (t: number) => X0 + (t / T_MAX) * (X1 - X0);
const y = (d: number) => Y0 - (d / D_MAX) * (Y0 - Y1);

/** Where the journey line is at time t — so a dragged point stays on the line. */
function distanceAt(t: number): number {
  for (let i = 1; i < JOURNEY.length; i++) {
    const a = JOURNEY[i - 1];
    const b = JOURNEY[i];
    if (t <= b.t) return a.d + ((b.d - a.d) * (t - a.t)) / (b.t - a.t);
  }
  return JOURNEY[JOURNEY.length - 1].d;
}

export default function GradientGraph() {
  // The slide's own A and B.
  const [ta, setTa] = useState(1);
  const [tb, setTb] = useState(3);

  const a: Point = { t: ta, d: distanceAt(ta) };
  const b: Point = { t: tb, d: distanceAt(tb) };
  const m = slope(a, b);
  const sum = workings(a, b);

  return (
    <div>
      <svg viewBox="0 0 320 170" className="w-full" role="img" aria-label="A distance-time graph with two movable readings">
        {/* Gridlines every second and every 100 m, so a value can be read off
            rather than guessed at. */}
        {[0, 1, 2, 3, 4, 5, 6].map((t) => (
          <line key={`t${t}`} x1={x(t)} y1={Y1} x2={x(t)} y2={Y0} stroke="var(--border)" strokeWidth={0.5} />
        ))}
        {[0, 100, 200, 300].map((d) => (
          <line key={`d${d}`} x1={X0} y1={y(d)} x2={X1} y2={y(d)} stroke="var(--border)" strokeWidth={0.5} />
        ))}

        <line x1={X0} y1={Y1} x2={X0} y2={Y0} stroke="var(--muted)" strokeWidth={1} />
        <line x1={X0} y1={Y0} x2={X1} y2={Y0} stroke="var(--muted)" strokeWidth={1} />

        {[0, 100, 200, 300].map((d) => (
          <text key={`dl${d}`} x={X0 - 6} y={y(d) + 3} textAnchor="end" fontSize={7} className="fill-[var(--muted)]">
            {d}
          </text>
        ))}
        {[0, 2, 4, 6].map((t) => (
          <text key={`tl${t}`} x={x(t)} y={Y0 + 10} textAnchor="middle" fontSize={7} className="fill-[var(--muted)]">
            {t}
          </text>
        ))}
        <text x={14} y={y(150)} fontSize={7} className="fill-[var(--muted)]" transform={`rotate(-90 14 ${y(150)})`} textAnchor="middle">
          Distance in m
        </text>
        <text x={(X0 + X1) / 2} y={Y0 + 20} fontSize={7} textAnchor="middle" className="fill-[var(--muted)]">
          Time in s
        </text>

        <polyline
          points={JOURNEY.map((p) => `${x(p.t)},${y(p.d)}`).join(" ")}
          fill="none"
          stroke="var(--brand2)"
          strokeWidth={2}
        />

        {/* The line being measured, drawn over the journey so the gradient the
            student is calculating is the one they can see. */}
        <line x1={x(a.t)} y1={y(a.d)} x2={x(b.t)} y2={y(b.d)} stroke="var(--brand)" strokeWidth={1.5} strokeDasharray="4 3" />

        {/* Rise and run as two sides of a triangle — the shape the worked
            example draws on the slide. */}
        {m !== null && (
          <>
            <line x1={x(a.t)} y1={y(a.d)} x2={x(b.t)} y2={y(a.d)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2 2" />
            <line x1={x(b.t)} y1={y(a.d)} x2={x(b.t)} y2={y(b.d)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2 2" />
          </>
        )}

        {([["A", a], ["B", b]] as const).map(([label, p]) => (
          <g key={label}>
            <circle cx={x(p.t)} cy={y(p.d)} r={4} fill="var(--brand)" />
            <text x={x(p.t) + 7} y={y(p.d) - 5} fontSize={8} fontWeight={600} className="fill-[var(--text)]">
              {label}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Reading label="A" t={ta} d={a.d} onChange={setTa} />
        <Reading label="B" t={tb} d={b.d} onChange={setTb} />
      </div>

      <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-center text-sm tabular-nums">
        {sum ?? "Move A and B to different times to find a speed."}
      </p>
      <p className="mt-2 text-center text-xs text-[var(--muted)]">{meaning(a, b)}</p>

      <button
        onClick={() => {
          setTa(1);
          setTb(3);
        }}
        className={`mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] ${PRESSABLE}`}
      >
        Reset
      </button>
    </div>
  );
}

function Reading({
  label,
  t,
  d,
  onChange,
}: {
  label: string;
  t: number;
  d: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>Point {label}</span>
        <span className="tabular-nums text-[var(--text)]">
          {t}s, {Math.round(d)}m
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={T_MAX}
        step={0.5}
        value={t}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--brand)]"
      />
    </label>
  );
}
