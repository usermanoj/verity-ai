// Client-safe locale constants — kept separate from request.ts because that
// file imports next/headers (server-only). Anything a client component needs
// (e.g. LocaleSwitcher) must come from here instead.
export const SUPPORTED_LOCALES = ["en", "zh"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE = "locale";

export function isSupportedLocale(value: string | undefined): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
