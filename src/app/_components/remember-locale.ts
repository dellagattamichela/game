/**
 * Writing the language choice down, in both places it has to live.
 *
 * Separate from the components that call it because writing a cookie is a
 * side effect on the document, and a component body is the wrong place to put
 * one — the lint rule that says so is right, even though this particular
 * assignment is harmless.
 */
import { LOCALE_KEY, LOCALE_MAX_AGE, type Locale } from "@/i18n";

/** The cookie is the half the server can read. */
export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_KEY}=${locale}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;
}

/**
 * Remember a choice: `localStorage` because it is the browser's preference,
 * and the cookie because the server renders most of what you read.
 */
export function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Private mode, or storage refused. The cookie still carries the choice
    // for as long as it lives, which is the whole of this visit.
  }
  writeLocaleCookie(locale);
}
