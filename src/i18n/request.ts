import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isSupportedLocale } from "./locale";

// Cookie-based locale (no path-prefixed routing yet) — the simplest scaffold
// that doesn't require restructuring every existing route under `[locale]/`.
// Full locale-prefixed routing (e.g. /zh/subjects) is a Phase 1 decision once
// more pages actually need translating.
export default getRequestConfig(async () => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(stored) ? stored : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
