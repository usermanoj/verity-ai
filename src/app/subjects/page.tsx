import Link from "next/link";

const SUBJECTS = [
  { id: "physics", name: "Physics", icon: "🧲", color: "#22d3ee", topics: 6, ready: true, blurb: "Mechanics · Moments · Magnetism" },
  { id: "math", name: "Mathematics", icon: "📐", color: "#6366f1", topics: 0, ready: false, blurb: "Algebra · Geometry · Data" },
  { id: "science", name: "Science", icon: "🔬", color: "#34d399", topics: 0, ready: false, blurb: "Biology · Chemistry · Energy" },
  { id: "english", name: "English", icon: "📖", color: "#f472b6", topics: 0, ready: false, blurb: "Reading · Grammar · Essays" },
];

const TASKS = [
  { subject: "Physics", title: "Moments of a Force", due: "This week", status: "In progress", href: "/topics/moments" },
  { subject: "Physics", title: "Distance–Time Graphs", due: "Next week", status: "Not started", href: "/topics/moments" },
];

export default function Subjects() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--muted)]">Grade 7 · Student</span>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--brand)] text-sm font-semibold">L</span>
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Good afternoon 👋</h1>
      <p className="mt-1 text-[var(--muted)]">Pick a subject to continue learning. Your AI tutor is ready.</p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SUBJECTS.map((s) => {
          const card = (
            <div
              className={`glass group h-full rounded-3xl p-5 transition ${s.ready ? "cursor-pointer hover:-translate-y-1 hover:border-[var(--brand)]" : "opacity-60"}`}
            >
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl text-2xl" style={{ background: `${s.color}22` }}>{s.icon}</div>
              <div className="font-semibold">{s.name}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{s.blurb}</div>
              <div className="mt-3 text-xs" style={{ color: s.ready ? s.color : "var(--muted)" }}>
                {s.ready ? `${s.topics} topics · open →` : "Coming soon"}
              </div>
            </div>
          );
          return s.ready ? (
            <Link key={s.id} href="/topics/moments">{card}</Link>
          ) : (
            <div key={s.id}>{card}</div>
          );
        })}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">This week&apos;s tasks</h2>
        <div className="glass overflow-hidden rounded-3xl">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Task</th>
                <th className="px-5 py-3">Due</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {TASKS.map((t, i) => (
                <tr key={i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]">
                  <td className="px-5 py-3">{t.subject}</td>
                  <td className="px-5 py-3 font-medium">{t.title}</td>
                  <td className="px-5 py-3 text-[var(--muted)]">{t.due}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${t.status === "In progress" ? "bg-[rgba(99,102,241,0.2)] text-[var(--brand2)]" : "bg-white/10 text-[var(--muted)]"}`}>{t.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={t.href} className="text-[var(--brand2)] hover:underline">Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
