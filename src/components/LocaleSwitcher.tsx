import Link from "next/link";
import type { AppLocale } from "@/i18n/locale";

const OPTIONS: { code: AppLocale; label: string; href: string }[] = [
  { code: "en", label: "EN", href: "/" },
  { code: "zh", label: "中文", href: "/zh" },
];

// Plain links between two statically prerendered homepages — no longer a
// Client Component.
//
// It used to set a locale cookie and call router.refresh(). next-intl read
// that cookie during render, which forced EVERY route in the app to render
// dynamically: nothing could be CDN-cached, so each visit paid a serverless
// invocation (measured on the live homepage at 1575ms cold, ~75ms warm).
// Distinct URLs let both locales be prerendered and served from the edge —
// and unlike a cookie, they're linkable, shareable and indexable.
export default function LocaleSwitcher({ locale, label }: { locale: AppLocale; label: string }) {
  return (
    <div className="flex items-center gap-1 text-xs" aria-label={label}>
      {OPTIONS.map((opt) => (
        <Link
          key={opt.code}
          href={opt.href}
          hrefLang={opt.code}
          aria-current={locale === opt.code ? "page" : undefined}
          className={`rounded-full px-2.5 py-1 transition ${
            locale === opt.code
              ? "bg-[var(--brand)] text-white"
              : "glass text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
