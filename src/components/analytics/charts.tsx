"use client";

import { motion } from "framer-motion";

// Chart primitives for the dashboards.
//
// Series colours are NOT the app's brand hues. Indigo, cyan and pink read
// well as UI accents and fail as a categorical set: validated against the
// dark chart surface, cyan and green sit at ΔE 12.1 for normal vision, below
// the 15 floor — two adjacent bars a fully-sighted reader cannot reliably
// tell apart, let alone a colourblind one. The order below passes every
// check (CVD ΔE 8.4 worst adjacent, normal-vision 19.3) at five slots.
//
// Assigned in fixed order and never cycled: a filter that removes a series
// must not repaint the others, or the colour stops meaning the thing.
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"] as const;

/* ------------------------------------------------------------- stat tile */

// A single number is not a chart, and drawing one as a chart wastes the
// reader's time. Magnitude with no comparison belongs in type.
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "good";
}) {
  const color = tone === "warn" ? "var(--warn)" : tone === "good" ? "var(--good)" : "var(--text)";
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------- horizontal bars */

export type BarDatum = { label: string; value: number; secondary?: number };

// Horizontal, because category labels are words: rotated x-axis labels are
// the most common reason a bar chart is unreadable.
export function BarList({
  data,
  max,
  valueLabel,
  secondaryLabel,
}: {
  data: BarDatum[];
  max?: number;
  valueLabel: string;
  secondaryLabel?: string;
}) {
  const ceiling = max ?? Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-[var(--text)]/85">{d.label}</span>
            <span className="shrink-0 tabular-nums text-[var(--muted)]">
              {d.secondary !== undefined ? `${d.value} / ${d.secondary}` : d.value}
            </span>
          </div>
          <div
            className="relative h-2.5 overflow-hidden rounded-full bg-white/8"
            role="img"
            aria-label={`${d.label}: ${d.value} ${valueLabel}${
              d.secondary !== undefined ? ` of ${d.secondary} ${secondaryLabel ?? ""}` : ""
            }`}
          >
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: SERIES[0] }}
              initial={{ width: 0 }}
              whileInView={{ width: `${(d.value / ceiling) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.04 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ stacked bar */

export type Segment = { label: string; value: number };

// One bar, segmented. A 2px gap between segments so adjacent fills read as
// separate quantities rather than one gradient, and every segment is
// direct-labelled in the legend below — identity is never colour alone.
export function StackedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <p className="text-sm text-[var(--muted)]">Nothing yet.</p>;

  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <motion.div
            key={s.label}
            style={{ background: SERIES[i % SERIES.length] }}
            initial={{ width: 0 }}
            whileInView={{ width: `${(s.value / total) * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.06 }}
            className="first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="text-[var(--muted)]">{s.label}</span>
            <span className="tabular-nums text-[var(--text)]/85">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- trendline */

export type Point = { week: string; count: number };

// Weeks are zero-filled server-side, so a quiet fortnight is drawn as a flat
// line rather than silently closing the gap between two busy weeks.
export function Trend({ points }: { points: Point[] }) {
  if (points.length < 2) return <p className="text-sm text-[var(--muted)]">Not enough history yet.</p>;

  const W = 520;
  const H = 120;
  const pad = { top: 10, right: 8, bottom: 20, left: 8 };
  const peak = Math.max(1, ...points.map((p) => p.count));

  const x = (i: number) => pad.left + (i / (points.length - 1)) * (W - pad.left - pad.right);
  const y = (v: number) => H - pad.bottom - (v / peak) * (H - pad.top - pad.bottom);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.count)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${H - pad.bottom} L ${x(0)} ${H - pad.bottom} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Material added per week">
      <path d={area} fill={SERIES[0]} opacity="0.14" />
      <motion.path
        d={line}
        fill="none"
        stroke={SERIES[0]}
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      />
      {points.map((p, i) => (
        <circle key={p.week} cx={x(i)} cy={y(p.count)} r="3.5" fill={SERIES[0]}>
          <title>{`Week of ${p.week}: ${p.count}`}</title>
        </circle>
      ))}
      <text x={pad.left} y={H - 4} fontSize="10" fill="var(--muted)">
        {points[0].week.slice(5)}
      </text>
      <text x={W - pad.right} y={H - 4} fontSize="10" fill="var(--muted)" textAnchor="end">
        this week
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------ panel shell */

export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-3xl p-5">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">{title}</h2>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// A panel for a metric that has no data yet BECAUSE a capability is missing,
// not because the school has done nothing.
//
// The alternative was inventing numbers, which is what these dashboards did
// before. A believable fake engagement chart is worse than an empty one: it
// survives exactly until someone asks what it means.
export function Locked({ title, needs, children }: { title: string; needs: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-dashed border-[var(--border)] p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">{title}</h2>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
          Not yet available
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--text)]/70">{children}</p>
      <p className="mt-2 text-xs text-[var(--muted)]">Needs: {needs}</p>
    </section>
  );
}
