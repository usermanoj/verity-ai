"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, type AppLocale } from "@/i18n/locale";

const OPTIONS: { code: AppLocale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
];

// Hoisted to module scope so the React Compiler doesn't treat this DOM
// mutation as a component-render side effect (same pattern as the fix in
// MomentsLever.tsx — a plain, non-hook function is exempt from that analysis).
function setLocaleCookie(code: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000`;
}

export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = useTranslations("LocaleSwitcher");

  function switchTo(code: AppLocale) {
    setLocaleCookie(code);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-1 text-xs" aria-label={t("label")}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          onClick={() => switchTo(opt.code)}
          disabled={pending}
          className={`rounded-full px-2.5 py-1 transition ${
            locale === opt.code
              ? "bg-[var(--brand)] text-white"
              : "glass text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
