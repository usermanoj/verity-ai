"use client";

import { motion } from "framer-motion";

export type SectionTable = { headers: string[]; rows: string[][] };

// A table from the teacher's deck, shown as a table and — when the numbers
// support it — as the graph the table exists to be plotted as.
//
// The distance-time deck literally says "readings are recorded in a table and
// are used to plot a graph", then shows the table. Rendering the numbers and
// leaving the student to imagine the line was the gap.
//
// Nothing here is inferred: every value plotted is a cell the teacher typed.
export default function DataTable({ table }: { table: SectionTable }) {
  const series = numericSeries(table);

  return (
    <figure className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-black/20">
      {series && <LineChart series={series} />}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              {table.headers.map((h, i) => (
                <th key={i} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <motion.tr
                key={i}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                className="border-b border-[var(--border)] last:border-0"
              >
                {row.map((cell, j) => (
                  <td key={j} className={`px-4 py-2 ${/^-?\d/.test(cell) ? "tabular-nums" : ""}`}>
                    {cell}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

type Series = { xLabel: string; yLabel: string; points: { x: number; y: number }[] };

// The first fully-numeric column is the axis; the next is what's plotted
// against it.
//
// Columns are checked cell by cell rather than assumed, because a real
// teacher's table mixes them: the deck's speed column holds "(10-0)/(1-0) =
// 10m/s" — a worked calculation, not a number — and plotting a column like
// that would either crash or invent values.
function numericSeries(table: SectionTable): Series | null {
  const numericCols = table.headers
    .map((_, col) => col)
    .filter((col) => table.rows.every((r) => isNumeric(r[col])) && table.rows.length >= 3);

  if (numericCols.length < 2) return null;
  const [xCol, yCol] = numericCols;

  const points = table.rows.map((r) => ({ x: Number(r[xCol]), y: Number(r[yCol]) }));
  // A flat line is a real and important result — a stationary car — so this
  // deliberately does not require the values to vary.
  return { xLabel: table.headers[xCol], yLabel: table.headers[yCol], points };
}

function isNumeric(cell: string | undefined): boolean {
  return typeof cell === "string" && /^-?\d+(\.\d+)?$/.test(cell.trim());
}

// Hand-drawn SVG rather than a charting library: this needs an axis, a line
// and some dots, and the smallest React chart packages start around 40 kB —
// more than the whole lesson page currently ships.
function LineChart({ series }: { series: Series }) {
  const W = 520;
  const H = 200;
  const pad = { top: 16, right: 16, bottom: 34, left: 46 };

  const xs = series.points.map((p) => p.x);
  const ys = series.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys);
  // A constant series has zero range; without this the scale divides by zero
  // and every point lands on the same pixel.
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const px = (x: number) => pad.left + ((x - minX) / spanX) * (W - pad.left - pad.right);
  const py = (y: number) => H - pad.bottom - ((y - minY) / spanY) * (H - pad.top - pad.bottom);

  const path = series.points.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.x)} ${py(p.y)}`).join(" ");

  return (
    <div className="border-b border-[var(--border)] p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${series.yLabel} against ${series.xLabel}`}>
        <line x1={pad.left} y1={H - pad.bottom} x2={W - pad.right} y2={H - pad.bottom} stroke="var(--border)" />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={H - pad.bottom} stroke="var(--border)" />

        {[minY, maxY].map((v) => (
          <text key={v} x={pad.left - 8} y={py(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
            {v}
          </text>
        ))}
        {[minX, maxX].map((v) => (
          <text key={v} x={px(v)} y={H - pad.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {v}
          </text>
        ))}

        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--muted)">
          {series.xLabel}
        </text>
        <text x={12} y={pad.top + 4} fontSize="11" fill="var(--muted)">
          {series.yLabel}
        </text>

        <motion.path
          d={path}
          fill="none"
          stroke="var(--brand2)"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
        {series.points.map((p, i) => (
          <motion.circle
            key={i}
            cx={px(p.x)}
            cy={py(p.y)}
            r="4"
            fill="var(--brand)"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + i * 0.06 }}
          >
            <title>{`${series.xLabel} ${p.x}, ${series.yLabel} ${p.y}`}</title>
          </motion.circle>
        ))}
      </svg>
    </div>
  );
}
