import Link from "next/link";

const ROLES = [
  { key: "student", label: "Student", icon: "🎒", desc: "Learn with a curriculum-locked AI tutor", href: "/subjects", primary: true },
  { key: "teacher", label: "Teacher", icon: "👩‍🏫", desc: "Monitor AI use, track progress & misconceptions", href: "/teacher", primary: true },
  { key: "hod", label: "HOD", icon: "📊", desc: "Department analytics & curriculum coverage", href: "/hod" },
  { key: "principal", label: "Principal", icon: "🏫", desc: "School-wide dashboard & ESL improvement", href: "/principal" },
];

const FEATURES = [
  { icon: "🔒", title: "Closed-corpus AI", body: "Answers only from teacher-approved materials — with an exact citation every time." },
  { icon: "🌏", title: "Top-end translation", body: "Simplified English + Chinese (中文), tuned with a physics glossary for accuracy." },
  { icon: "🧲", title: "Interactive science", body: "Drag-and-feel simulations turn abstract physics into something you can play with." },
  { icon: "🎯", title: "Guides, never cheats", body: "The tutor hints and asks questions — it won't do the assignment for you." },
  { icon: "📈", title: "Adaptive & transparent", body: "Adapts difficulty to each learner; every AI chat is visible to teachers." },
  { icon: "✅", title: "Trusted grading", body: "Numbers graded deterministically — never by a guessing chatbot." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--brand)] text-xl glow-brand">🛡️</span>
          <span className="text-lg font-semibold tracking-tight">
            Verity <span className="text-[var(--brand2)]">AI</span>
          </span>
        </div>
        <span className="glass rounded-full px-3 py-1 text-xs text-[var(--muted)]">IG · IB · Cambridge</span>
      </header>

      <section className="mt-14 text-center">
        <div className="mx-auto mb-4 w-fit rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 text-xs text-[var(--muted)]">
          ✦ Cited. Curriculum-only. Built for ESL classrooms.
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          One truth:{" "}
          <span className="bg-gradient-to-r from-[#22d3ee] to-[#6366f1] bg-clip-text text-transparent">
            your teacher&apos;s material
          </span>
          , in{" "}
          <span className="bg-gradient-to-r from-[#6366f1] to-[#f472b6] bg-clip-text text-transparent">
            every student&apos;s language
          </span>
          .
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[var(--muted)]">
          <strong className="text-[var(--text)]">Verity AI</strong> answers only from your school&apos;s approved material — never the open internet, cited every time — and speaks in a student&apos;s own language, starting with{" "}
          <strong className="text-[var(--text)]">Chinese (Mandarin, Simplified)</strong>.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/subjects" className="rounded-2xl bg-[var(--brand)] px-6 py-3 font-medium text-white transition hover:-translate-y-0.5 glow-brand">
            Enter as a Student →
          </Link>
          <Link href="/topics/moments" className="glass rounded-2xl px-6 py-3 font-medium transition hover:-translate-y-0.5">
            Try the Physics demo
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-[rgba(52,211,153,0.4)] bg-[rgba(52,211,153,0.16)] px-3 py-1.5 text-xs font-medium text-[#6ee7b7]">
            🇨🇳 Chinese (Mandarin) · Live now
          </span>
          <span className="glass rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">🇰🇷 Korean · Coming soon</span>
          <span className="glass rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">🇲🇾 Malay · Coming soon</span>
          <span className="glass rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">🇮🇳 Tamil · Coming soon</span>
          <span className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs text-[var(--muted)]">
            + more languages
          </span>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="mb-4 text-center text-sm font-medium uppercase tracking-widest text-[var(--muted)]">Choose your role</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <Link
              key={r.key}
              href={r.href}
              className={`glass group rounded-3xl p-5 transition hover:-translate-y-1 hover:border-[var(--brand)] ${r.primary ? "ring-1 ring-[var(--brand)]" : ""}`}
            >
              <div className="mb-3 text-3xl transition group-hover:scale-110">{r.icon}</div>
              <div className="font-semibold">{r.label}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">{r.desc}</div>
              {r.primary && <div className="mt-3 text-xs font-medium text-[var(--brand2)]">Live demo →</div>}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="glass rounded-3xl p-5">
            <div className="mb-2 text-2xl">{f.icon}</div>
            <div className="font-semibold">{f.title}</div>
            <div className="mt-1 text-sm text-[var(--muted)]">{f.body}</div>
          </div>
        ))}
      </section>

      <footer className="mt-20 pb-8 text-center text-xs text-[var(--muted)]">
        Built for the Claude Code Hackathon · Grade 7 Physics demo corpus · © Verity AI
      </footer>
    </main>
  );
}
