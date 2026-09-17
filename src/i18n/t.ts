/**
 * Translation lookup.
 *
 * A flat catalogue of keys rather than nested objects, because the flat form
 * is what makes "does Italian cover everything English has?" a one-line test
 * rather than a recursive walk — and that test is the only thing that keeps a
 * translation honest as the app grows.
 */
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { MESSAGES, type MessageKey } from "./messages";

export type Params = Record<string, string | number>;

/**
 * Look a message up, filling `{named}` holes.
 *
 * A key missing from a locale falls back to English rather than rendering
 * blank or throwing: a half-translated screen is readable, and an empty one is
 * not. The test suite refuses incomplete catalogues, so the fallback is a
 * safety net rather than a policy.
 */
export function t(locale: Locale, key: MessageKey, params?: Params): string {
  const template = MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** A `t` bound to one locale, for components that translate more than once. */
export function translator(locale: Locale) {
  return (key: MessageKey, params?: Params) => t(locale, key, params);
}

export type Translate = ReturnType<typeof translator>;
