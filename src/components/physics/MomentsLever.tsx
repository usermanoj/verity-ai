"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Weight = { id: string; force: number; distance: number; color: string; label: string };

const BEAM_HALF_M = 3;          // beam spans -3m .. +3m
const PX_PER_M = 80;            // scale
const CENTER_X = 320;
const CENTER_Y = 150;

export type LeverState = { clockwise: number; anticlockwise: number; balanced: boolean };

export default function MomentsLever({
  onChange,
}: {
  onChange?: (s: LeverState) => void;
}) {
  const [left, setLeft] = useState<Weight>({
    id: "L", force: 200, distance: 1.5, color: "#22d3ee", label: "Ram",
  });
  const [right, setRight] = useState<Weight>({
    id: "R", force: 300, distance: 1.0, color: "#f472b6", label: "Shyam",
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<string | null>(null);

  const anticlockwise = left.force * left.distance;   // left side = anticlockwise
  const clockwise = right.force * right.distance;      // right side = clockwise
  const net = clockwise - anticlockwise;
  const balanced = Math.abs(net) < 1;

  useEffect(() => {
    onChange?.({ clockwise, anticlockwise, balanced });
  }, [clockwise, anticlockwise, balanced, onChange]);

  const tilt = Math.max(-11, Math.min(11, net / 60)); // degrees, clamped

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 640 / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    let dist = Math.abs(x - CENTER_X) / PX_PER_M;
    dist = Math.max(0.2, Math.min(BEAM_HALF_M, Math.round(dist * 10) / 10));
    if (dragging.current === "L") setLeft((w) => ({ ...w, distance: dist }));
    else setRight((w) => ({ ...w, distance: dist }));
  }, []);

  const stopDrag = () => (dragging.current = null);

  const WeightBlock = ({ w, side }: { w: Weight; side: -1 | 1 }) => {
    const x = CENTER_X + side * w.distance * PX_PER_M;
    const size = 26 + Math.min(34, w.force / 12);
    return (
      <g
        transform={`rotate(${tilt} ${CENTER_X} ${CENTER_Y})`}
        onPointerDown={() => (dragging.current = w.id)}
        style={{ cursor: "grab" }}
      >
        <line x1={x} y1={CENTER_Y - 8} x2={x} y2={CENTER_Y - 8 - size * 0.5} stroke={w.color} strokeWidth={3} />
        <motion.rect
          layout
          x={x - size / 2}
          y={CENTER_Y - 8 - size * 0.5 - size}
          width={size}
          height={size}
          rx={8}
          fill={w.color}
          opacity={0.92}
          style={{ filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.4))" }}
        />
        <text x={x} y={CENTER_Y - 8 - size * 0.5 - size - 8} textAnchor="middle" fontSize="13" fill="#eef2ff" fontWeight={600}>
          {w.label}
        </text>
        <text x={x} y={CENTER_Y - 8 - size * 0.5 - size / 2 + 4} textAnchor="middle" fontSize="12" fill="#0b1020" fontWeight={700}>
          {w.force}N
        </text>
      </g>
    );
  };

  const ForceControl = ({ w, set, color }: { w: Weight; set: (f: number) => void; color: string }) => (
    <div className="flex items-center gap-3">
      <span className="w-14 text-sm font-semibold" style={{ color }}>{w.label}</span>
      <input
        type="range" min={50} max={600} step={10} value={w.force}
        onChange={(e) => set(Number(e.target.value))}
        className="flex-1 accent-[var(--brand)]"
      />
      <span className="w-24 text-right text-sm text-[var(--muted)] tabular-nums">
        {w.force}N × {w.distance}m
      </span>
    </div>
  );

  return (
    <div className="glass-strong rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Interactive Seesaw — feel the moments</h3>
        <span className="text-xs text-[var(--muted)]">drag a weight to change its distance</span>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 640 260"
        className="w-full touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        <defs>
          <linearGradient id="beam" x1="0" x2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#f472b6" />
          </linearGradient>
        </defs>

        {/* distance ticks */}
        {[-3, -2, -1, 1, 2, 3].map((m) => (
          <g key={m} transform={`rotate(${tilt} ${CENTER_X} ${CENTER_Y})`}>
            <line x1={CENTER_X + m * PX_PER_M} y1={CENTER_Y - 4} x2={CENTER_X + m * PX_PER_M} y2={CENTER_Y + 4} stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
            <text x={CENTER_X + m * PX_PER_M} y={CENTER_Y + 20} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)">{Math.abs(m)}m</text>
          </g>
        ))}

        {/* beam */}
        <motion.rect
          animate={{ rotate: tilt }}
          transition={{ type: "spring", stiffness: 60, damping: 12 }}
          style={{ transformOrigin: `${CENTER_X}px ${CENTER_Y}px` }}
          x={CENTER_X - BEAM_HALF_M * PX_PER_M}
          y={CENTER_Y - 8}
          width={BEAM_HALF_M * 2 * PX_PER_M}
          height={16}
          rx={8}
          fill="url(#beam)"
        />

        <WeightBlock w={left} side={-1} />
        <WeightBlock w={right} side={1} />

        {/* pivot */}
        <polygon points={`${CENTER_X - 26},${CENTER_Y + 70} ${CENTER_X + 26},${CENTER_Y + 70} ${CENTER_X},${CENTER_Y + 4}`} fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.3)" />
      </svg>

      <div className="mt-4 space-y-2">
        <ForceControl w={left} color="#22d3ee" set={(f) => setLeft((w) => ({ ...w, force: f }))} />
        <ForceControl w={right} color="#f472b6" set={(f) => setRight((w) => ({ ...w, force: f }))} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="glass rounded-2xl p-3">
          <div className="text-xs text-[var(--muted)]">Anticlockwise</div>
          <div className="text-lg font-bold text-[var(--brand2)] tabular-nums">{anticlockwise} Nm</div>
        </div>
        <motion.div
          animate={{ scale: balanced ? [1, 1.06, 1] : 1 }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl p-3"
          style={{
            background: balanced ? "rgba(52,211,153,0.16)" : "rgba(251,191,36,0.12)",
            border: `1px solid ${balanced ? "rgba(52,211,153,0.5)" : "rgba(251,191,36,0.4)"}`,
          }}
        >
          <div className="text-xs text-[var(--muted)]">Status</div>
          <div className="text-lg font-bold" style={{ color: balanced ? "var(--good)" : "var(--warn)" }}>
            {balanced ? "⚖️ Balanced" : net > 0 ? "↻ Tips right" : "↺ Tips left"}
          </div>
        </motion.div>
        <div className="glass rounded-2xl p-3">
          <div className="text-xs text-[var(--muted)]">Clockwise</div>
          <div className="text-lg font-bold text-[var(--accent)] tabular-nums">{clockwise} Nm</div>
        </div>
      </div>
    </div>
  );
}
