"use client";

import { useId, useState } from "react";
import { axisTicks, toChart, toPath, type TopicTable } from "@/lib/visuals/table-chart";

// The teacher's own table, drawn.
//
// Hand-rolled SVG rather than a charting library: this needs four lines, an
// axis and a hover, and a dependency would cost more in bundle than it saves in
// code — on a school tablet over a school connection, that is the wrong trade.
//
// The table stays on the page underneath. The graph is an additional way to
// read the same numbers, not a replacement for them: a student who is asked to
// find a value still needs the value, and a student who cannot see the shape
// still needs the shape.

const W = 520;
const H = 240;
const PAD = { left: 46, right: 14, top: 14, bottom: 34 };

export default function TableChart({ table, caption }: { table: TopicTable; caption?: string }) {
  const chart = toChart(table);
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  // Not a chart. Says nothing rather than drawing axes around a vocabulary
  // list — see toChart for what is rejected and why.
  if (!chart) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const allY = chart.series.flatMap((s) => s.values);
  const yTicks = axisTicks(allY);
  const xTicks = axisTicks(chart.x.values);

  const place = (p: { x: number; y: number }) => ({ x: PAD.left + p.x * plotW, y: PAD.top + p.y * plotH });
  const paths = chart.series.map((s) => toPath(s.values, chart.x.values).map(place));

  return (
    <figure className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${chart.series[0].label} against ${chart.x.label}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines before the data, so the data sits on top of them. */}
        {yTicks.map((t, i) => {
          const y = PAD.top + plotH - (i / (yTicks.length - 1 || 1)) * plotH;
          return (
            <g key={`y${t}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="fill-[var(--muted)]" fontSize="11">
                {t}
              </text>
            </g>
          );
        })}
        {xTicks.map((t, i) => {
          const x = PAD.left + (i / (xTicks.length - 1 || 1)) * plotW;
          return (
            <text key={`x${t}`} x={x} y={H - 12} textAnchor="middle" className="fill-[var(--muted)]" fontSize="11">
              {t}
            </text>
          );
        })}

        {paths.map((pts, si) => (
          <g key={chart.series[si].label}>
            {si === 0 && (
              <path
                d={`M ${pts[0].x} ${PAD.top + plotH} ${pts.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${pts.at(-1)!.x} ${PAD.top + plotH} Z`}
                fill={`url(#${gradientId})`}
              />
            )}
            <path
              d={pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
              fill="none"
              stroke={si === 0 ? "var(--brand2)" : "var(--good)"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={hover === i ? 6 : 4}
                fill={si === 0 ? "var(--brand2)" : "var(--good)"}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer transition-[r]"
              />
            ))}
          </g>
        ))}

        {/* The reading, on hover. The point of an interactive chart for a
            student is being able to ask "what is it here?" and be answered. */}
        {hover !== null && (
          <text x={W - PAD.right} y={PAD.top + 12} textAnchor="end" className="fill-[var(--text)]" fontSize="12">
            {chart.x.label} {chart.x.values[hover]} · {chart.series.map((s) => `${s.label} ${s.values[hover]}`).join(" · ")}
          </text>
        )}
      </svg>

      <figcaption className="mt-1 text-xs text-[var(--muted)]">
        {caption ?? `${chart.series.map((s) => s.label).join(" and ")} against ${chart.x.label}`} — from the table
        below. Tap a point to read it.
      </figcaption>
    </figure>
  );
}
