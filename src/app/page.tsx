import Link from "next/link";
import { useTranslations } from "next-intl";
import LocaleSwitcher from "@/components/LocaleSwitcher";

const ROLE_KEYS = ["student", "teacher", "hod", "principal"] as const;
const ROLE_META: Record<(typeof ROLE_KEYS)[number], { icon: string; href: string; primary?: boolean }> = {
  student: { icon: "🎒", href: "/subjects", primary: true },
  teacher: { icon: "👩‍🏫", href: "/teacher", primary: true },
  hod: { icon: "📊", href: "/hod" },
  principal: { icon: "🏫", href: "/principal" },
};

const FEATURE_KEYS = ["closedCorpus", "translation", "interactive", "guides", "adaptive", "grading"] as const;
const FEATURE_ICONS: Record<(typeof FEATURE_KEYS)[number], string> = {
  closedCorpus: "🔒",
  translation: "🌏",
  interactive: "🧲",
  guides: "🎯",
  adaptive: "📈",
  grading: "✅",
};

export default function Home() {
  const t = useTranslations("HomePage");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--brand)] text-xl glow-brand">🛡️</span>
          <span className="text-lg font-semibold tracking-tight">
            Verity <span className="text-[var(--brand2)]">AI</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <span className="glass rounded-full px-3 py-1 text-xs text-[var(--muted)]">IG · IB · Cambridge</span>
        </div>
      </header>

      <section className="mt-14 text-center">
        <div className="mx-auto mb-4 w-fit rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 text-xs text-[var(--muted)]">
          {t("badge")}
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          {t.rich("headline", {
            material: (chunks) => (
              <span className="bg-gradient-to-r from-[#22d3ee] to-[#6366f1] bg-clip-text text-transparent">{chunks}</span>
            ),
            language: (chunks) => (
              <span className="bg-gradient-to-r from-[#6366f1] to-[#f472b6] bg-clip-text text-transparent">{chunks}</span>
            ),
          })}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[var(--muted)]">
          {t.rich("subtitle", {
            brand: (chunks) => <strong className="text-[var(--text)]">{chunks}</strong>,
            highlight: (chunks) => <strong className="text-[var(--text)]">{chunks}</strong>,
          })}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/subjects" className="rounded-2xl bg-[var(--brand)] px-6 py-3 font-medium text-white transition hover:-translate-y-0.5 glow-brand">
            {t("ctaStudent")}
          </Link>
          <Link href="/topics/moments" className="glass rounded-2xl px-6 py-3 font-medium transition hover:-translate-y-0.5">
            {t("ctaDemo")}
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-[rgba(52,211,153,0.4)] bg-[rgba(52,211,153,0.16)] px-3 py-1.5 text-xs font-medium text-[#6ee7b7]">
            {t("languages.zh")}
          </span>
          <span className="glass rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">{t("languages.ko")}</span>
          <span className="glass rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">{t("languages.ms")}</span>
          <span className="glass rounded-full px-3 py-1.5 text-xs text-[var(--muted)]">{t("languages.ta")}</span>
          <span className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs text-[var(--muted)]">
            {t("languages.more")}
          </span>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="mb-4 text-center text-sm font-medium uppercase tracking-widest text-[var(--muted)]">
          {t("rolesHeading")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_KEYS.map((key) => {
            const meta = ROLE_META[key];
            return (
              <Link
                key={key}
                href={meta.href}
                className={`glass group rounded-3xl p-5 transition hover:-translate-y-1 hover:border-[var(--brand)] ${meta.primary ? "ring-1 ring-[var(--brand)]" : ""}`}
              >
                <div className="mb-3 text-3xl transition group-hover:scale-110">{meta.icon}</div>
                <div className="font-semibold">{t(`roles.${key}.label`)}</div>
                <div className="mt-1 text-sm text-[var(--muted)]">{t(`roles.${key}.desc`)}</div>
                {meta.primary && <div className="mt-3 text-xs font-medium text-[var(--brand2)]">{t("liveDemo")}</div>}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_KEYS.map((key) => (
          <div key={key} className="glass rounded-3xl p-5">
            <div className="mb-2 text-2xl">{FEATURE_ICONS[key]}</div>
            <div className="font-semibold">{t(`features.${key}.title`)}</div>
            <div className="mt-1 text-sm text-[var(--muted)]">{t(`features.${key}.body`)}</div>
          </div>
        ))}
      </section>

      <footer className="mt-20 pb-8 text-center text-xs text-[var(--muted)]">{t("footer")}</footer>
    </main>
  );
}
