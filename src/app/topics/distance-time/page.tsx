"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import DistanceTimeGraph, { type JourneyState } from "@/components/physics/DistanceTimeGraph";
import AiTutorPanel from "@/components/tutor/AiTutorPanel";
import ReadingText from "@/components/reading/ReadingText";
import PracticeZone from "@/components/practice/PracticeZone";
import { CORPUS, TOPICS } from "@/data/corpus";
import { DISTANCE_TIME_BANK } from "@/data/practice-banks";

const TOPIC = TOPICS["distance-time"];
const learnChunks = CORPUS.filter((c) => ["dt-def", "dt-axes", "dt-stationary"].includes(c.id));

const PHASE_LABEL: Record<JourneyState["phase"], string> = {
  "walking-out": "walking (first leg) ↗",
  resting: "resting (stationary) ⏸",
  "walking-on": "walking (second leg) ↗",
};

export default function DistanceTimeTopic() {
  const [journey, setJourney] = useState<JourneyState | null>(null);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/subjects" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Subjects</Link>
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <span className="rounded-full bg-[rgba(34,211,238,0.15)] px-3 py-1 text-[var(--brand2)]">🧲 Physics</span>
          <span>Grade 7</span>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-bold tracking-tight">{TOPIC.title}</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          <span className="font-medium text-[var(--text)]">Objective:</span> {TOPIC.objective}
        </p>
      </motion.div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* LEFT: learn + interact */}
        <div className="space-y-6">
          <section className="glass rounded-3xl p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">📘</span>
              <h2 className="text-lg font-semibold">Learn</h2>
              <span className="ml-auto text-xs text-[var(--muted)]">hover a dotted word for meaning + 中文</span>
            </div>
            <div className="space-y-4">
              {learnChunks.map((c) => (
                <div key={c.id}>
                  <h3 className="mb-1 text-sm font-semibold text-[var(--brand2)]">{c.heading}</h3>
                  <ReadingText text={c.text} />
                  <div className="mt-1 text-xs text-[var(--muted)]">📖 {c.source}</div>
                </div>
              ))}
            </div>
          </section>

          <DistanceTimeGraph onChange={setJourney} />

          <div className="glass rounded-2xl px-4 py-2.5 text-sm text-[var(--muted)]">
            Live from the journey: at{" "}
            <span className="font-semibold text-[var(--brand2)]">{journey?.time ?? "—"} s</span> the object is at{" "}
            <span className="font-semibold text-[var(--brand2)]">{journey?.distance ?? "—"} m</span>,{" "}
            <span className="font-semibold" style={{ color: journey?.phase === "resting" ? "var(--warn)" : "var(--accent)" }}>
              {journey ? PHASE_LABEL[journey.phase] : "loading…"}
            </span>{" "}
            at <span className="font-semibold text-[var(--accent)]">{journey?.speed ?? "—"} m/s</span>.
          </div>

          <PracticeZone key="distance-time" bank={DISTANCE_TIME_BANK} />
        </div>

        {/* RIGHT: sticky tutor */}
        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <AiTutorPanel topicId="distance-time" topicTitle={TOPIC.title} />
        </div>
      </div>
    </main>
  );
}
