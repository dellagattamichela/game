/**
 * Which language a browser is reading in.
 *
 * The choice is stored twice, on purpose. `localStorage` is where it lives —
 * it is the browser's own preference and survives everything. But most of this
 * app renders on the server: the lobby, the scene text, the ending. The server
 * cannot read `localStorage`, so the same value is mirrored into a cookie,
 * which is the only thing a server render can see. The cookie is not httpOnly
 * precisely so the client can keep the two in step without a round trip.
 *
 * Language is per browser, not per room. Two people at the same table can read
 * the same scene in different languages, because nothing about the language
 * reaches the engine: the rules, the ids and the saved state are all prose-free.
 */

export const LOCALES = ["en", "it"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  it: "Italiano",
};

/** Cookie and storage key. The same name in both, so they are obviously a pair. */
export const LOCALE_KEY = "ps_locale";

/** A year: a language preference is not a session. */
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Coerce anything — a cookie, a stored string, a URL param — into a locale. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
