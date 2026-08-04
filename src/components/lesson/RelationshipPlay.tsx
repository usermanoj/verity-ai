"use client";

import { useState } from "react";
import { effectAt, readingAt, toPlayable } from "@/lib/visuals/relationship";
import { detectRelationship } from "@/components/topic/structure";
import { PRESSABLE } from "@/lib/ui";

// The proportionality a section states in words, with one end in the student's
// hand.
//
// Rendered per section like TableChart and FormulaPlayground: no catalogue
// entry, no subject gate, no competing for the one-per-lesson slot, and nothing
// at all when the section states no relationship. It has no idea what subject
// it is in — "Closer the poles, greater is the force" and "Higher the
// temperature, faster the reaction" are the same shape of sentence and get the
// same treatment.
//
// NO NUMBERS ANYWHERE. The source says force grows as separation shrinks. It
// does not say by how much, and it does not say inverse-square. A scale, an
// axis or a curve would all be inventions — so this is a bar that moves the
// way the sentence says, and the sentence itself above it.

const STEPS = 20;

export default function RelationshipPlay({ text }: { text: string }) {
  const found = detectRelationship(text);
  const play = found ? toPlayable(found.parts) : null;

  // Opens at the end the TEACHER wrote about, so the first thing on screen is
  // their own sentence rather than a position nobody described.
  //
  // It started in the middle, which looked neutral and was not: the bar sat at
  // half while the words underneath committed to one end, asserting a
  // direction the slider was not at. Seen the first time this was opened in a
  // browser, and invisible to every test — the reading and the bar were each
  // correct for the value they were given.
  const start = play && play.cause.direction === "up" ? STEPS : 0;
  const [position, setPosition] = useState(start);

  if (!play) return null;

  const cause = position / STEPS;
  const effect = effectAt(play, cause);

  // The one word for where the effect currently is — the same word shown
  // beside the bar, and the same one a screen reader is given. An aria-label
  // reading "50 per cent of the way along" would hand a blind student a
  // precise figure the section never stated, while a sighted one is shown
  // none. The discipline has to hold for both or it is not a discipline.
  const effectWord =
    effect >= 0.5
      ? play.effect.direction === "up"
        ? play.effect.word
        : play.effect.opposite
      : play.effect.direction === "up"
        ? play.effect.opposite
        : play.effect.word;

  return (
    <figure className="mt-4 rounded-2xl border border-[var(--border)] bg-black/20 p-4">
      <figcaption className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--muted)]">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--brand)] text-[9px] text-white">▶</span>
        Try it — the rule from this section
      </figcaption>

      {/* The teacher's sentence, so a student can see the widget is their
          lesson rather than something the software decided. */}
      <p className="mb-3 text-center text-sm text-[var(--brand2)]">{found!.sentence}</p>

      <label className="block">
        <span className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>{play.cause.direction === "up" ? play.cause.opposite : play.cause.word}</span>
          <span className="text-[var(--text)]">{play.cause.thing}</span>
          <span>{play.cause.direction === "up" ? play.cause.word : play.cause.opposite}</span>
        </span>
        <input
          type="range"
          min={0}
          max={STEPS}
          step={1}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="mt-1 w-full accent-[var(--brand)]"
          aria-label={play.cause.thing}
        />
      </label>

      {/* The effect as a bar with no scale on it. Deliberately: a labelled
          axis would be a quantity the section never gave. */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-[var(--muted)]">{play.effect.thing}</span>
          <span className="text-[var(--muted)]">{effectWord}</span>
        </div>
        <div
          className="h-4 w-full overflow-hidden rounded-full border border-[var(--border)] bg-black/30"
          role="img"
          aria-label={`${play.effect.thing}: ${effectWord}`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand2)] transition-[width] duration-200"
            style={{ width: `${Math.max(4, effect * 100)}%` }}
          />
        </div>
      </div>

      <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-center text-sm">{readingAt(play, cause)}</p>

      <p className="mt-2 text-center text-xs text-[var(--muted)]">
        {play.inverse ? "One goes up as the other goes down." : "They rise and fall together."}
      </p>

      <button
        onClick={() => setPosition(start)}
        className={`mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] ${PRESSABLE}`}
      >
        Reset
      </button>
    </figure>
  );
}
