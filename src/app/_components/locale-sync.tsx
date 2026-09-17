"use client";

/**
 * Keeps the cookie in step with `localStorage`.
 *
 * The preference lives in `localStorage`, but the server can only see the
 * cookie, and the two can come apart: a cookie expires, or is cleared, or the
 * browser arrives at the site for the first time in a year. This reconciles
 * them on load — if storage remembers a language the cookie does not, the
 * cookie is rewritten and the page re-rendered once in the right language.
 *
 * It renders nothing and, in the ordinary case where the two already agree,
 * does nothing at all.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_KEY, isLocale, type Locale } from "@/i18n";
import { writeLocaleCookie } from "./remember-locale";

export function LocaleSync({ serverLocale }: { serverLocale: Locale }) {
  const router = useRouter();

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LOCALE_KEY);
    } catch {
      return;
    }
    if (!isLocale(stored) || stored === serverLocale) return;

    writeLocaleCookie(stored);
    router.refresh();
  }, [router, serverLocale]);

  return null;
}
