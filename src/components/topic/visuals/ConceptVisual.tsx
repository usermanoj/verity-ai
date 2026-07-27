"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
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

export type VisualKind = "domains" | "field" | "broken" | "distance" | "electromagnet" | "conductor" | "grip";

// Ordered most specific first, and the first match wins.
//
// The earlier version was not as conservative as its comment claimed. Two
// loose regexes agreeing is not evidence: "magnetic field strength" in a
// heading about the right-hand thumb rule matched the bar-magnet rule, and a
// section on why solenoids use insulated wire matched the electromagnet rule.
// Both rendered a diagram of the wrong thing, which is worse than rendering
// nothing.
//
// So each rule now carries an `unless` guard naming the neighbouring concepts
// it must yield to, and the specific concepts sit above the general ones.
const RULES: { kind: VisualKind; when: RegExp; needs: RegExp; unless?: RegExp }[] = [
  {
    kind: "domains",
    when: /domain/i,
    needs: /(align|line up|same direction|magnetis)/i,
  },
  {
    kind: "broken",
    when: /(broken|break|cut in half|piece)/i,
    needs: /(pole|north|south)/i,
  },
  {
    // The field around a straight wire is a different picture from the field
    // around a bar magnet: concentric circles, not loops between poles.
    kind: "conductor",
    when: /(thumb rule|current[- ]carrying|straight wire|around a wire|around a conductor)/i,
    needs: /(current|field|direction)/i,
    unless: /(solenoid|coil|grip rule)/i,
  },
  {
    kind: "grip",
    when: /grip rule/i,
    needs: /(solenoid|coil|current|north)/i,
  },
  {
    kind: "electromagnet",
    when: /(electromagnet|solenoid|coil)/i,
    needs: /(current|switch|turned on|on and off|strength)/i,
    // A section about insulation, copper or short circuits is about wiring
    // materials, not about switching a field on and off.
    unless: /(insulat|copper wire|resistance|short circuit|grip rule|thumb rule)/i,
  },
  {
    kind: "distance",
    when: /distance/i,
    needs: /(force|closer|greater|strength)/i,
    unless: /(wire|conductor|solenoid)/i,
  },
  {
    kind: "field",
    when: /(magnetic field|field around|field line)/i,
    needs: /(pole|region|bar magnet)/i,
    // Everything current-related has a more specific rule above; without this
    // the generic bar-magnet picture swallowed conductor and solenoid
    // sections whose headings merely contained "magnetic field".
    unless: /(conductor|wire|solenoid|coil|current|thumb rule|grip rule)/i,
  },
];

export function visualFor(heading: string, text: string): VisualKind | null {
  const both = `${heading} ${text}`;
  for (const rule of RULES) {
    if (rule.unless?.test(both)) continue;
    if (rule.when.test(heading) && rule.needs.test(text)) return rule.kind;
  }
  return null;
}

// Picks which section gets which visual across a whole lesson.
//
// Repetition was the other half of the problem: a deck covering
// electromagnets from five angles rendered the same coil widget five times,
// which reads as automation rather than authorship. A concept earns its
// interactive once, at the first section that matches it.
export function assignVisuals(sections: { heading: string; text: string; hasMedia: boolean }[]): (VisualKind | null)[] {
  const used = new Set<VisualKind>();

  // Two passes, so a concept's interactive is not spent on a section that
  // already has the teacher's own diagram.
  //
  // The first version skipped any section with media outright, which made the
  // two mutually exclusive — a static picture OR something to try, never
  // both. That was the wrong call: a diagram of field lines and a field you
  // can turn in your hands do different jobs, and the deck's best-illustrated
  // sections were exactly the ones being denied interaction. Now a section
  // with media keeps its diagram and takes the interactive only if no
  // media-less section elsewhere in the lesson wants it.
  const kinds = sections.map((s) => visualFor(s.heading, s.text));
  const assigned: (VisualKind | null)[] = sections.map(() => null);

  for (const preferMediaLess of [true, false]) {
    sections.forEach((s, i) => {
      if (assigned[i]) return;
      if (preferMediaLess === s.hasMedia) return;
      const kind = kinds[i];
      if (!kind || used.has(kind)) return;
      used.add(kind);
      assigned[i] = kind;
    });
  }

  return assigned;
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
      {kind === "conductor" && <StraightConductor />}
      {kind === "grip" && <SolenoidGrip />}
      {kind === "field" && (
        <div>
          <MagnetField3D />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Drag to turn it. A field fills the space around a magnet — every flat diagram is a slice through this.
          </p>
        </div>
      )}
    </figure>
  );
}

// three.js is ~600 kB. Loading it inside the component that needs it means a
// lesson with no field section never downloads it at all, and one that has a
// field section downloads it after its text is already readable.
const MagnetField3D = dynamic(() => import("./MagnetField3D"), {
  ssr: false,
  loading: () => <div className="grid h-64 place-items-center text-xs text-[var(--muted)]">Loading 3D view…</div>,
});

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

/* ------------------------------------------------------- straight conductor */

// "Grip the conductor with your thumb along the current, and your fingers
// point the way of the field." The whole rule is about handedness, so the
// visual has to let you reverse the current and watch the field reverse with
// it — a static arrow diagram teaches this badly, which is why students
// memorise it instead of understanding it.
function StraightConductor() {
  const [up, setUp] = useState(true);

  return (
    <div>
      <svg viewBox="0 0 320 150" className="w-full">
        <line x1={160} y1={10} x2={160} y2={140} stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" />
        <motion.polygon
          points={up ? "160,14 152,32 168,32" : "160,136 152,118 168,118"}
          fill="#fbbf24"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
        <text x={175} y={up ? 26 : 132} fill="#fbbf24" fontSize="11">
          current
        </text>

        {/* Concentric circles, seen edge-on as ellipses: the field wraps the
            wire rather than running between poles. */}
        {[30, 52, 74].map((r, i) => (
          <g key={r}>
            <ellipse cx={160} cy={75} rx={r} ry={r / 2.6} fill="none" stroke="#22d3ee" strokeWidth="1.4" opacity={0.75 - i * 0.16} />
            <motion.polygon
              points={
                up
                  ? `${160 + r},${75 - 5} ${160 + r + 7},${75} ${160 + r},${75 + 5}`
                  : `${160 + r},${75 + 5} ${160 + r + 7},${75} ${160 + r},${75 - 5}`
              }
              fill="#22d3ee"
              opacity={0.75 - i * 0.16}
              animate={{ x: [0, 3, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
            />
          </g>
        ))}
      </svg>
      <button
        onClick={() => setUp((v) => !v)}
        className="mt-1 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white"
      >
        ⇅ Reverse the current
      </button>
      <p className="mt-2 text-xs text-[var(--muted)]">
        The field circles the wire. Reverse the current and the circles turn the other way — and the further out you
        look, the weaker it gets.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- solenoid grip */

// "Fingers along the current, thumb points to north." Reversing the current
// swaps which end is north, which is the part a diagram can state but only an
// interaction can make stick.
function SolenoidGrip() {
  const [clockwise, setClockwise] = useState(true);
  const northLeft = clockwise;

  return (
    <div>
      <svg viewBox="0 0 320 120" className="w-full">
        <line x1={30} y1={60} x2={70} y2={60} stroke="#fbbf24" strokeWidth="3" />
        <line x1={250} y1={60} x2={290} y2={60} stroke="#fbbf24" strokeWidth="3" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <ellipse key={i} cx={85 + i * 30} cy={60} rx={11} ry={30} fill="none" stroke="#fbbf24" strokeWidth="3" />
        ))}

        <motion.text
          key={`${northLeft}`}
          x={62}
          y={26}
          fontSize="17"
          fontWeight="700"
          fill={northLeft ? "#f472b6" : "#6366f1"}
          textAnchor="middle"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          {northLeft ? "N" : "S"}
        </motion.text>
        <motion.text
          key={`r-${northLeft}`}
          x={272}
          y={26}
          fontSize="17"
          fontWeight="700"
          fill={northLeft ? "#6366f1" : "#f472b6"}
          textAnchor="middle"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          {northLeft ? "S" : "N"}
        </motion.text>

        <motion.polygon
          points={northLeft ? "150,95 190,95 190,88 205,99 190,110 190,103 150,103" : "190,95 150,95 150,88 135,99 150,110 150,103 190,103"}
          fill="#34d399"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      </svg>
      <button
        onClick={() => setClockwise((v) => !v)}
        className="mt-1 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white"
      >
        ⇄ Reverse the current
      </button>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Wrap your right hand around the coil with your fingers following the current — your thumb points at the north
        pole, now on the {northLeft ? "left" : "right"}.
      </p>
    </div>
  );
}

