"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CLASS, STUDENTS, DIFFICULT_TOPICS, HARD_VOCAB, type StudentRow } from "@/data/monitoring";

const relianceStyle: Record<StudentRow["reliance"], { c: string; label: string }> = {
  healthy: { c: "var(--good)", label: "Healthy" },
  watch: { c: "var(--warn)", label: "Watch" },
  high: { c: "var(--bad)", label: "High" },
};
const statusStyle: Record<StudentRow["status"], { c: string; label: string }> = {
  "on-track": { c: "var(--good)", label: "On track" },
  "needs-help": { c: "var(--warn)", label: "Needs help" },
  inactive: { c: "var(--muted)", label: "Inactive" },
};

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: color || "var(--text)" }}>{value}</div>
      {sub && <div className="text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export default function TeacherDashboard() {
  const [open, setOpen] = useState<StudentRow | null>(null);

  const avgTime = Math.round(STUDENTS.reduce((a, s) => a + s.minutes, 0) / STUDENTS.length);
  const totalQ = STUDENTS.reduce((a, s) => a + s.aiQuestions, 0);
  const flagged = STUDENTS.filter((s) => s.reliance === "high").length;
  const needHelp = STUDENTS.filter((s) => s.status !== "on-track").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Active students" value={`${CLASS.active}/${CLASS.students}`} sub="this week" color="var(--brand2)" />
        <Kpi label="Avg time on task" value={`${avgTime}m`} sub="per student" />
        <Kpi label="AI questions" value={`${totalQ}`} sub="asked this week" />
        <Kpi label="Over-relying on AI" value={`${flagged}`} sub="answer-seeking" color="var(--bad)" />
        <Kpi label="Need attention" value={`${needHelp}`} sub="inactive / low score" color="var(--warn)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Student table */}
        <section className="glass overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="font-semibold">Students · {CLASS.topic}</h2>
            <span className="text-xs text-[var(--muted)]">click a row to see their AI chats</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr className="border-y border-[var(--border)]">
                  <th className="px-5 py-2.5">Student</th>
                  <th className="px-3 py-2.5">Time</th>
                  <th className="px-3 py-2.5">AI Qs</th>
                  <th className="px-3 py-2.5">Score</th>
                  <th className="px-3 py-2.5">AI reliance</th>
                  <th className="px-3 py-2.5">Struggling with</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {STUDENTS.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setOpen(s)}
                    className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
                  >
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-[11px] text-[var(--muted)]">{s.eslLevel}</div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{s.minutes}m</td>
                    <td className="px-3 py-2.5 tabular-nums">{s.aiQuestions}</td>
                    <td className="px-3 py-2.5 tabular-nums">{s.quizScore ? `${s.quizScore}%` : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: `${relianceStyle[s.reliance].c}22`, color: relianceStyle[s.reliance].c }}>
                        {relianceStyle[s.reliance].label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">{s.struggling}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-medium" style={{ color: statusStyle[s.status].c }}>● {statusStyle[s.status].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Insights */}
        <section className="space-y-6">
          <div className="glass rounded-3xl p-5">
            <h3 className="mb-3 font-semibold">Most difficult topics</h3>
            <div className="space-y-2.5">
              {DIFFICULT_TOPICS.map((t) => (
                <div key={t.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{t.label}</span>
                    <span className="text-[var(--muted)]">{t.pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${t.pct}%` }}
                      transition={{ duration: 0.7 }}
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg,var(--brand2),var(--accent))" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-3xl p-5">
            <h3 className="mb-3 font-semibold">Vocabulary causing difficulty</h3>
            <div className="flex flex-wrap gap-2">
              {HARD_VOCAB.map((w) => (
                <span key={w} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs">{w}</span>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">Auto-detected from student translate/explain requests. Consider a pre-teach vocabulary task.</p>
          </div>
        </section>
      </div>

      {/* AI transparency drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 flex justify-end bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(null)}
          >
            <motion.div
              className="glass-strong h-full w-full max-w-md overflow-y-auto p-6"
              initial={{ x: 40 }} animate={{ x: 0 }} exit={{ x: 40 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{open.name}</div>
                  <div className="text-xs text-[var(--muted)]">{open.eslLevel} · {open.minutes}m · {open.aiQuestions} AI questions</div>
                </div>
                <button onClick={() => setOpen(null)} className="glass rounded-xl px-3 py-1.5 text-sm">Close</button>
              </div>

              <div className="mt-3 rounded-2xl bg-[rgba(99,102,241,0.12)] p-3 text-xs text-[var(--muted)]">
                🔍 Full AI transparency — every message the student exchanged with the tutor, with flags. Nothing is hidden.
              </div>

              <div className="mt-4 space-y-3">
                {open.chat.length === 0 && <div className="text-sm text-[var(--muted)]">No AI activity yet.</div>}
                {open.chat.map((t, i) => (
                  <div key={i} className={t.from === "student" ? "flex justify-end" : "flex justify-start"}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${t.from === "student" ? "bg-[var(--brand)] text-white" : "glass"}`}>
                      <p className="whitespace-pre-wrap">{t.text}</p>
                      {t.flag && (
                        <span className="mt-1 inline-block rounded-full bg-[rgba(248,113,113,0.2)] px-2 py-0.5 text-[10px] text-[var(--bad)]">
                          ⚠ {t.flag === "answer-seeking" ? "asked for the answer" : "possible copy-paste"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
