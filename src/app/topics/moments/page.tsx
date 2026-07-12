"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import MomentsLever, { type LeverState } from "@/components/physics/MomentsLever";
import AiTutorPanel from "@/components/tutor/AiTutorPanel";
import ReadingText from "@/components/reading/ReadingText";
import PracticeZone from "@/components/practice/PracticeZone";
import { CORPUS, TOPIC } from "@/data/corpus";

const learnChunks = CORPUS.filter((c) => ["m-def", "m-principle"].includes(c.id));

export default function MomentsTopic() {
  const [lever, setLever] = useState<LeverState | null>(null);

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

          <MomentsLever onChange={setLever} />

          <div className="glass rounded-2xl px-4 py-2.5 text-sm text-[var(--muted)]">
            Live from the seesaw: anticlockwise{" "}
            <span className="font-semibold text-[var(--brand2)]">{lever?.anticlockwise ?? "—"} Nm</span> vs clockwise{" "}
            <span className="font-semibold text-[var(--accent)]">{lever?.clockwise ?? "—"} Nm</span> —{" "}
            <span className="font-semibold" style={{ color: lever?.balanced ? "var(--good)" : "var(--warn)" }}>
              {lever ? (lever.balanced ? "balanced ⚖️" : "not balanced") : "loading…"}
            </span>
          </div>

          <PracticeZone />
        </div>

        {/* RIGHT: sticky tutor */}
        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <AiTutorPanel topicTitle={TOPIC.title} />
        </div>
      </div>
    </main>
  );
}
