"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// Models the real journey from the school's slides (Distance-Time Graphs,
// Slide 10): "I walked 5 m in 10 seconds, stopped for 10 seconds, then
// walked 5 m in 5 seconds." Speeds are adjustable so students can see how a
// steeper line (higher speed) changes the graph's gradient.
const LEG_DISTANCE = 5; // metres, fixed — matches the real "5 m" in the slide
const TOTAL_DISTANCE = LEG_DISTANCE * 2;

const GRAPH_X0 = 70;
const GRAPH_X1 = 600;
const GRAPH_Y0 = 250; // distance = 0 (bottom)
const GRAPH_Y1 = 110; // distance = 10 m (top)

export type JourneyState = {
  time: number;
  distance: number;
  speed: number;
  phase: "walking-out" | "resting" | "walking-on";
};

export default function DistanceTimeGraph({
  onChange,
}: {
  onChange?: (s: JourneyState) => void;
}) {
  const [speed1, setSpeed1] = useState(0.5); // m/s — matches "5 m in 10 s"
  const [restTime, setRestTime] = useState(10); // s — matches the slide
  const [speed2, setSpeed2] = useState(1); // m/s — matches "5 m in 5 s"

  const dur1 = LEG_DISTANCE / speed1;
  const dur2 = LEG_DISTANCE / speed2;
  const totalTime = dur1 + restTime + dur2;

  // Clamp during render rather than storing an out-of-range value and
  // correcting it in an effect afterwards — if a speed/rest slider shrinks
  // totalTime, this takes effect on the same render, with no stale frame.
  const [tRaw, setTRaw] = useState(0);
  const t = Math.min(tRaw, totalTime);

  function distanceAt(time: number): number {
    if (time <= dur1) return speed1 * time;
    if (time <= dur1 + restTime) return LEG_DISTANCE;
    const tRet = Math.min(time - (dur1 + restTime), dur2);
    return LEG_DISTANCE + speed2 * tRet;
  }

  function phaseAt(time: number): { phase: JourneyState["phase"]; speed: number } {
    if (time <= dur1) return { phase: "walking-out", speed: speed1 };
    if (time <= dur1 + restTime) return { phase: "resting", speed: 0 };
    return { phase: "walking-on", speed: speed2 };
  }

  const dist = distanceAt(t);
  const { phase, speed: speedNow } = phaseAt(t);

  useEffect(() => {
    onChange?.({ time: Math.round(t * 10) / 10, distance: Math.round(dist * 10) / 10, speed: speedNow, phase });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, dist, speedNow, phase]);

  const pxPerSecond = (GRAPH_X1 - GRAPH_X0) / totalTime;
  const pxPerMetre = (GRAPH_Y0 - GRAPH_Y1) / TOTAL_DISTANCE;
  const toX = (time: number) => GRAPH_X0 + time * pxPerSecond;
  const toY = (d: number) => GRAPH_Y0 - d * pxPerMetre;

  const pathPoints = [
    [0, 0],
    [dur1, LEG_DISTANCE],
    [dur1 + restTime, LEG_DISTANCE],
    [totalTime, TOTAL_DISTANCE],
  ]
    .map(([time, d]) => `${toX(time)},${toY(d)}`)
    .join(" ");

  const trackX0 = 70;
  const trackX1 = 600;
  const iconX = trackX0 + (dist / TOTAL_DISTANCE) * (trackX1 - trackX0);

  const phaseLabel =
    phase === "walking-out" ? "🚶 Walking (first leg)" : phase === "resting" ? "🧍 Resting (stationary)" : "🚶 Walking (second leg)";
  const phaseColor = phase === "resting" ? "var(--warn)" : "var(--brand2)";

  return (
    <div className="glass-strong rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Interactive Journey — feel the graph</h3>
        <span className="text-xs text-[var(--muted)]">drag the time slider below</span>
      </div>

      <svg viewBox="0 0 640 300" className="w-full select-none">
        {/* walking track */}
        <line x1={trackX0} y1={60} x2={trackX1} y2={60} stroke="rgba(255,255,255,0.18)" strokeWidth={4} strokeLinecap="round" />
        <motion.circle
          cx={iconX}
          cy={60}
          r={10}
          fill={phaseColor}
          animate={{ cx: iconX }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        <text x={iconX} y={40} textAnchor="middle" fontSize="20">🚶</text>

        {/* graph axes */}
        <line x1={GRAPH_X0} y1={GRAPH_Y0} x2={GRAPH_X1 + 10} y2={GRAPH_Y0} stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
        <line x1={GRAPH_X0} y1={GRAPH_Y0} x2={GRAPH_X0} y2={GRAPH_Y1 - 15} stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
        <text x={(GRAPH_X0 + GRAPH_X1) / 2} y={285} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.6)">Time (s)</text>
        <text
          x={20}
          y={(GRAPH_Y0 + GRAPH_Y1) / 2}
          textAnchor="middle"
          fontSize="11"
          fill="rgba(255,255,255,0.6)"
          transform={`rotate(-90 20 ${(GRAPH_Y0 + GRAPH_Y1) / 2})`}
        >
          Distance (m)
        </text>

        {/* y ticks */}
        {[0, 2, 4, 6, 8, 10].map((d) => (
          <g key={d}>
            <line x1={GRAPH_X0 - 4} y1={toY(d)} x2={GRAPH_X0} y2={toY(d)} stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
            <text x={GRAPH_X0 - 10} y={toY(d) + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.5)">{d}</text>
          </g>
        ))}

        {/* the distance-time line */}
        <polyline points={pathPoints} fill="none" stroke="var(--brand2)" strokeWidth={3} strokeLinejoin="round" />

        {/* current marker + vertical guide */}
        <line
          x1={toX(t)} y1={toY(dist)} x2={toX(t)} y2={GRAPH_Y0}
          stroke="rgba(244,114,182,0.5)" strokeDasharray="4 3" strokeWidth={1.5}
        />
        <circle cx={toX(t)} cy={toY(dist)} r={7} fill="var(--accent)" stroke="white" strokeWidth={1.5} />
      </svg>

      <input
        type="range" min={0} max={totalTime} step={0.1} value={t}
        onChange={(e) => setTRaw(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--brand)]"
      />

      <div className="mt-3 space-y-2">
        <SliderRow label="Speed — first leg (m/s)" value={speed1} min={0.2} max={2} step={0.1} onChange={setSpeed1} color="#22d3ee" />
        <SliderRow label="Rest time (s)" value={restTime} min={0} max={20} step={1} onChange={setRestTime} color="#fbbf24" />
        <SliderRow label="Speed — second leg (m/s)" value={speed2} min={0.2} max={3} step={0.1} onChange={setSpeed2} color="#f472b6" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="glass rounded-2xl p-3">
          <div className="text-xs text-[var(--muted)]">Time</div>
          <div className="text-lg font-bold tabular-nums">{t.toFixed(1)} s</div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: `${phaseColor}22`, border: `1px solid ${phaseColor}66` }}>
          <div className="text-xs text-[var(--muted)]">Phase</div>
          <div className="text-sm font-bold" style={{ color: phaseColor }}>{phaseLabel}</div>
        </div>
        <div className="glass rounded-2xl p-3">
          <div className="text-xs text-[var(--muted)]">Speed now (gradient)</div>
          <div className="text-lg font-bold text-[var(--accent)] tabular-nums">{speedNow.toFixed(1)} m/s</div>
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, onChange, color,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 text-sm font-semibold" style={{ color }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--brand)]"
      />
      <span className="w-14 text-right text-sm text-[var(--muted)] tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}
