"use client";

import { useState } from "react";
import { motion } from "framer-motion";

// Interactive illustrations for uploaded material.
//
// The hand-built demo topics carry a bespoke visual each (the seesaw, the
// distance-time graph) and that is most of why they feel like a product
// rather than a document. Uploaded decks had nothing, because you cannot
// synthesise a simulation of an arbitrary concept.
//
// What you CAN do is recognise the concepts a syllabus actually repeats.
// Grade 7 magnetism has perhaps six of them, and every school's deck covers
// the same ones — so a small library of real interactives, matched against
// what a section already says, covers most of a real lesson.
//
// The honesty rule: a visual only ever ANIMATES a claim already in the
// approved text. Nothing here introduces a fact, a number or an example that
// the teacher did not upload — matching is deliberately narrow, and a section
// that does not clearly match gets no visual rather than an approximate one.
// A wrong diagram teaches a wrong thing, so ambiguity resolves to nothing.

type VisualKind = "domains" | "field" | "broken" | "distance" | "electromagnet";

// Ordered: the first confident match wins. Each rule needs the concept AND a
// corroborating term, so a passing mention ("...unlike a magnetic domain...")
// in a section about something else does not pull in a simulation.
const RULES: { kind: VisualKind; test: (h: string, t: string) => boolean }[] = [
  {
    kind: "domains",
    test: (h, t) => /domain/i.test(h) && /(align|line up|direction|magnetis)/i.test(t),
  },
  {
    kind: "broken",
    test: (h, t) => /(broken|break|cut|piece)/i.test(h) && /(pole|north|south)/i.test(t),
  },
  {
    kind: "electromagnet",
    test: (h, t) => /(electromagnet|solenoid|coil)/i.test(h) && /(current|turn|switch|control|on and off)/i.test(t),
  },
  {
    kind: "distance",
    test: (h, t) => /distance/i.test(h) && /(force|closer|greater|strength)/i.test(t),
  },
  {
    kind: "field",
    test: (h, t) => /(magnetic field|field around|field line)/i.test(h) && /(pole|region|strength|force)/i.test(t),
  },
];

export function visualFor(heading: string, text: string): VisualKind | null {
  for (const rule of RULES) if (rule.test(heading, text)) return rule.kind;
  return null;
}

export default function ConceptVisual({ kind }: { kind: VisualKind }) {
  return (
    <figure className="mt-4 rounded-2xl border border-[var(--border)] bg-black/20 p-4">
      <figcaption className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--muted)]">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--brand)] text-[9px] text-white">▶</span>
        Try it — interactive illustration of this section
      </figcaption>
      {kind === "domains" && <Domains />}
      {kind === "broken" && <BrokenMagnet />}
      {kind === "electromagnet" && <Electromagnet />}
      {kind === "distance" && <DistanceForce />}
      {kind === "field" && <FieldLines />}
    </figure>
  );
}

/* ------------------------------------------------------- shared primitives */

function Slider({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs text-[var(--muted)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--brand)]"
      />
    </label>
  );
}

// A bar magnet drawn as two halves. Used by several visuals, so the colour
// coding of north and south stays identical across the whole lesson.
function Bar({ x, y, w, h, flipped = false }: { x: number; y: number; w: number; h: number; flipped?: boolean }) {
  const left = flipped ? "S" : "N";
  const right = flipped ? "N" : "S";
  const leftFill = flipped ? "#6366f1" : "#f472b6";
  const rightFill = flipped ? "#f472b6" : "#6366f1";
  return (
    <g>
      <rect x={x} y={y} width={w / 2} height={h} fill={leftFill} rx={3} />
      <rect x={x + w / 2} y={y} width={w / 2} height={h} fill={rightFill} rx={3} />
      <text x={x + w / 4} y={y + h / 2 + 5} textAnchor="middle" fill="white" fontSize="14" fontWeight="700">
        {left}
      </text>
      <text x={x + (3 * w) / 4} y={y + h / 2 + 5} textAnchor="middle" fill="white" fontSize="14" fontWeight="700">
        {right}
      </text>
    </g>
  );
}

/* ----------------------------------------------------------------- domains */

// "Domains point in different directions in an unmagnetised material; once
// magnetised they line up in the same direction." The slider IS that
// sentence — the point only lands when you watch the arrows swing together.
function Domains() {
  const [aligned, setAligned] = useState(0);
  // Fixed pseudo-random starting angles: a real random() would reshuffle on
  // every render and make the alignment look like noise rather than order.
  const scatter = [34, 200, 118, 275, 62, 310, 155, 240, 95, 20, 180, 300, 130, 260, 75, 215];

  return (
    <div>
      <svg viewBox="0 0 320 120" className="w-full">
        {scatter.map((angle, i) => {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const cx = 25 + col * 40;
          const cy = 35 + row * 50;
          const current = angle + ((0 - angle) * aligned) / 100;
          return (
            <motion.g key={i} animate={{ rotate: current }} style={{ originX: `${cx}px`, originY: `${cy}px` }}>
              <line
                x1={cx - 13}
                y1={cy}
                x2={cx + 13}
                y2={cy}
                stroke={aligned > 60 ? "#22d3ee" : "#9aa6c4"}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <polygon points={`${cx + 18},${cy} ${cx + 8},${cy - 6} ${cx + 8},${cy + 6}`} fill={aligned > 60 ? "#22d3ee" : "#9aa6c4"} />
            </motion.g>
          );
        })}
      </svg>
      <Slider value={aligned} onChange={setAligned} label="Magnetise the material →" />
      <p className="mt-1 text-xs text-[var(--muted)]">
        {aligned < 25
          ? "Unmagnetised: domains point every which way, so their effects cancel out."
          : aligned < 75
            ? "Partly magnetised: more domains are lining up."
            : "Magnetised: the domains point the same way, so the material acts as one magnet."}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- broken magnet */

// "No matter how many times a bar magnet is cut in half, there is always a
// north and south pole." Cutting it yourself is the only way that lands.
function BrokenMagnet() {
  const [cuts, setCuts] = useState(0);
  const pieces = 2 ** cuts;
  const gap = 6;
  const total = 280 - gap * (pieces - 1);
  const pieceW = total / pieces;

  return (
    <div>
      <svg viewBox="0 0 300 70" className="w-full">
        {Array.from({ length: pieces }, (_, i) => (
          <motion.g key={`${cuts}-${i}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <Bar x={10 + i * (pieceW + gap)} y={20} w={pieceW} h={32} />
          </motion.g>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => setCuts((c) => Math.min(c + 1, 3))}
          disabled={cuts >= 3}
          className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          ✂️ Cut in half
        </button>
        <button
          onClick={() => setCuts(0)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]"
        >
          Reset
        </button>
        <span className="text-xs text-[var(--muted)]">
          {pieces} piece{pieces > 1 ? "s" : ""} — every one still has N and S
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ electromagnet */

// "Bar magnets cannot be turned on and off; electromagnets can." A switch is
// the whole idea, so the visual is a switch.
function Electromagnet() {
  const [current, setCurrent] = useState(0);
  const on = current > 0;

  return (
    <div>
      <svg viewBox="0 0 320 110" className="w-full">
        <rect x={110} y={40} width={100} height={30} fill="#475569" rx={4} />
        {[0, 1, 2, 3, 4].map((i) => (
          <ellipse
            key={i}
            cx={125 + i * 20}
            cy={55}
            rx={9}
            ry={24}
            fill="none"
            stroke={on ? "#fbbf24" : "#64748b"}
            strokeWidth="3"
          />
        ))}
        {/* Field loops scale with current: the same coil is weak or strong,
            which is the controllable part the text is about. */}
        {on &&
          [1, 2, 3].map((ring) => (
            <motion.ellipse
              key={ring}
              cx={160}
              cy={55}
              rx={55 + ring * 22 * (current / 100)}
              ry={26 + ring * 11 * (current / 100)}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 - ring * 0.18 }}
            />
          ))}
        <circle cx={40} cy={55} r={12} fill={on ? "#34d399" : "#334155"} />
        <text x={40} y={60} textAnchor="middle" fontSize="10" fill="white" fontWeight="700">
          {on ? "ON" : "OFF"}
        </text>
      </svg>
      <Slider value={current} onChange={setCurrent} label="Current through the coil →" />
      <p className="mt-1 text-xs text-[var(--muted)]">
        {on
          ? `Current flowing — the coil is magnetic, and stronger as the current rises.`
          : "No current, no magnetism. This is what a permanent magnet cannot do."}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- distance/force */

// "Closer the poles, greater is the force."
function DistanceForce() {
  const [distance, setDistance] = useState(50);
  // Inverse-square falloff, shown as a relative bar only — deliberately
  // unlabelled by any number, because the source text states the relationship
  // qualitatively and inventing a quantity would be inventing content.
  const strength = Math.round(100 / Math.pow(1 + distance / 25, 2));

  return (
    <div>
      <svg viewBox="0 0 320 80" className="w-full">
        <Bar x={20} y={25} w={80} h={30} />
        <Bar x={140 + distance} y={25} w={80} h={30} flipped />
        {[0, 1, 2].map((i) => (
          <motion.line
            key={i}
            x1={104}
            y1={34 + i * 6}
            x2={136 + distance}
            y2={34 + i * 6}
            stroke="#34d399"
            strokeWidth={Math.max(0.5, (strength / 100) * 3)}
            strokeDasharray="4 3"
            animate={{ opacity: strength / 100 }}
          />
        ))}
      </svg>
      <Slider value={distance} onChange={setDistance} label="← Move the magnets apart →" min={0} max={90} />
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-[var(--muted)]">Force</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full bg-gradient-to-r from-[var(--brand)] to-[var(--good)]" animate={{ width: `${strength}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- field */

// "A magnetic field is the region around a magnet where magnetic materials
// experience a force. Strength is concentrated at the poles." Moving a
// compass around it is how that gets taught with iron filings.
function FieldLines() {
  const [pos, setPos] = useState({ x: 160, y: 30 });

  // Angle of the field at the probe, from the two poles' positions.
  const northX = 110;
  const southX = 210;
  const angle =
    (Math.atan2(pos.y - 60, pos.x - northX) + Math.atan2(60 - pos.y, southX - pos.x)) / 2;

  return (
    <div>
      <svg
        viewBox="0 0 320 120"
        className="w-full cursor-crosshair"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: ((e.clientX - r.left) / r.width) * 320, y: ((e.clientY - r.top) / r.height) * 120 });
        }}
      >
        {[18, 34, 52].map((spread) => (
          <g key={spread}>
            <path
              d={`M ${northX} 60 C ${northX} ${60 - spread * 1.6}, ${southX} ${60 - spread * 1.6}, ${southX} 60`}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.2"
              opacity="0.55"
            />
            <path
              d={`M ${northX} 60 C ${northX} ${60 + spread * 1.6}, ${southX} ${60 + spread * 1.6}, ${southX} 60`}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.2"
              opacity="0.55"
            />
          </g>
        ))}
        <Bar x={110} y={46} w={100} h={28} />
        <g transform={`translate(${pos.x} ${pos.y}) rotate(${(angle * 180) / Math.PI})`}>
          <circle r="11" fill="rgba(0,0,0,0.55)" stroke="#fbbf24" strokeWidth="1.5" />
          <polygon points="9,0 -4,-4 -4,4" fill="#f472b6" />
        </g>
      </svg>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Move your pointer over the magnet — the compass needle turns to follow the field. The lines crowd together at
        the poles, where the field is strongest.
      </p>
    </div>
  );
}
