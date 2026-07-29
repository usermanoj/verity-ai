"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// One teacher area, four jobs.
//
// Everything used to sit on a single scroll: enrolment codes and QR posters,
// the uploads list, and eight panels of analytics. Those are not one task —
// they are a once-a-term task, a daily one, and a weekly one — and stacking
// them meant the daily one started below the fold and looked missing.
//
// Split by job rather than by data source, so each screen answers one
// question a teacher actually arrives with.
const TABS = [
  { href: "/teacher", label: "Overview", icon: "📋", blurb: "What's live and what needs you" },
  { href: "/teacher/ingest", label: "Upload & review", icon: "📤", blurb: "Add material, approve chunks" },
  { href: "/teacher/classes", label: "Classes", icon: "🔑", blurb: "Join codes and QR" },
  { href: "/teacher/language", label: "Language", icon: "🈶", blurb: "Vocabulary and translations, and your corrections" },
  { href: "/teacher/insights", label: "Insights", icon: "📊", blurb: "Coverage, difficulty, progress" },
];

export default function TeacherTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Teacher sections" className="mb-6 flex flex-wrap gap-2">
      {TABS.map((tab) => {
        // Exact match for the index route, prefix for the rest — otherwise
        // /teacher would light up on every child page.
        const active = tab.href === "/teacher" ? pathname === "/teacher" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.blurb}
            aria-current={active ? "page" : undefined}
            className={`rounded-2xl border px-4 py-2 text-sm transition ${
              active
                ? "border-[var(--brand)] bg-[rgba(99,102,241,0.18)] text-[var(--text)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--text)]"
            }`}
          >
            <span aria-hidden className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
