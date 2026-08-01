"use client";

import { useState } from "react";
import { balancingForce, leverState, nm, type Side } from "@/lib/visuals/lever";

// A beam you can load, for the topic the whole deck is about.
//
// Moments is the one Grade 7 mechanics idea that a static diagram teaches
// badly: the misconception is "the heavier side goes down", and a picture of a
// balanced see-saw does nothing to dislodge it. Being able to put 10 N far out
// and watch it lift 30 N close in is the argument.
//
// SVG rather than 3D. A lever is a lever in two dimensions, and the third would
// add a camera to control and nothing to understand — the field visual earns
// 3D because a field genuinely fills space, and this does not.

const BEAM = 300;   // half-length, in svg units
const PER_M = 100;  // svg units per metre, so 3 m fits each side

export default function LeverBalance() {
  const [left, setLeft] = useState<Side>({ force: 200, distance: 1.5 });
  const [right, setRight] = useState<Side>({ force: 100, distance: 1.0 });
  const s = leverState(left, right);
  const needed = balancingForce(left, right.distance);

  return (
    <div>
      <svg viewBox="0 0 720 240" className="w-full" role="img" aria-label="A beam on a pivot with a weight on each side">
        {/* Ground and pivot, drawn before the beam so it turns above them. */}
        <polygon points="360,175 330,215 390,215" fill="var(--brand)" opacity="0.75" />
        <line x1="120" y1="215" x2="600" y2="215" stroke="var(--border)" strokeWidth="3" />

        <g transform={`rotate(${s.tiltDeg} 360 170)`} style={{ transition: "transform 220ms ease-out" }}>
          <rect x={360 - BEAM} y="163" width={BEAM * 2} height="14" rx="7" fill="#b45309" />

          {/* Distance marks every half metre, so "1.5 m" is something you can
              count rather than a number in a box. */}
          {[-3, -2.5, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5, 3].map((m) => (
            <line
              key={m}
              x1={360 + m * PER_M}
              x2={360 + m * PER_M}
              y1="163"
              y2={Number.isInteger(m) ? 155 : 159}
              stroke="var(--muted)"
              strokeWidth="1.5"
            />
          ))}

          <Weight x={360 - left.distance * PER_M} force={left.force} tone="var(--brand2)" />
          <Weight x={360 + right.distance * PER_M} force={right.force} tone="var(--good)" />
        </g>

        <text x="360" y="26" textAnchor="middle" fontSize="15" className="fill-[var(--text)]" fontWeight="600">
          {s.balanced ? "Balanced" : s.net > 0 ? "Tips clockwise →" : "← Tips anticlockwise"}
        </text>
        <text x="360" y="48" textAnchor="middle" fontSize="12" className="fill-[var(--muted)]">
          anticlockwise {nm(s.anticlockwise)} · clockwise {nm(s.clockwise)}
        </text>
      </svg>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Controls label="Left" tone="text-[var(--brand2)]" side={left} onChange={setLeft} />
        <Controls label="Right" tone="text-[var(--good)]" side={right} onChange={setRight} />
      </div>

      {/* The sum, written the way the section writes it. The point is not that
          the beam moves — it is that the student can see WHY, in the same
          notation their worksheet uses. */}
      <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-center text-sm tabular-nums">
        {left.force} N × {left.distance} m = {nm(s.anticlockwise)}
        <span className="mx-2 text-[var(--muted)]">{s.balanced ? "=" : s.net > 0 ? "<" : ">"}</span>
        {right.force} N × {right.distance} m = {nm(s.clockwise)}
      </p>

      {!s.balanced && needed !== null && (
        <p className="mt-2 text-center text-xs text-[var(--muted)]">
          To balance it, the right side needs {Number(needed.toFixed(1))} N at {right.distance} m.
        </p>
      )}
    </div>
  );
}

function Weight({ x, force, tone }: { x: number; force: number; tone: string }) {
  // Height grows with force so the picture and the number agree, but slowly —
  // a 400 N block ten times the height of a 40 N one would leave the beam.
  const h = 18 + Math.min(force, 400) / 12;
  return (
    <g>
      <rect x={x - 15} y={163 - h} width="30" height={h} rx="4" fill={tone} />
      <text x={x} y={163 - h - 6} textAnchor="middle" fontSize="12" className="fill-[var(--text)]" fontWeight="600">
        {force} N
      </text>
    </g>
  );
}

function Controls({
  label,
  tone,
  side,
  onChange,
}: {
  label: string;
  tone: string;
  side: Side;
  onChange: (s: Side) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-3">
      <div className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</div>
      <label className="mt-2 block text-xs text-[var(--muted)]">
        Force {side.force} N
        <input
          type="range"
          min={0}
          max={400}
          step={10}
          value={side.force}
          onChange={(e) => onChange({ ...side, force: Number(e.target.value) })}
          className="mt-1 w-full accent-[var(--brand)]"
        />
      </label>
      <label className="mt-1 block text-xs text-[var(--muted)]">
        Distance from pivot {side.distance} m
        <input
          type="range"
          min={0}
          max={3}
          step={0.5}
          value={side.distance}
          onChange={(e) => onChange({ ...side, distance: Number(e.target.value) })}
          className="mt-1 w-full accent-[var(--brand)]"
        />
      </label>
    </div>
  );
}
