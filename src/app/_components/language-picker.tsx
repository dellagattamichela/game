"use client";

/**
 * Choosing a language.
 *
 * Writes the choice to `localStorage`, which is where it belongs — it is this
 * browser's preference and nothing to do with any room — and mirrors it into a
 * cookie, because the lobby, the scene text and the ending are rendered on the
 * server and the server cannot read `localStorage`. The cookie is the same
 * value under the same name, set from here rather than through an action so
 * the switch costs no round trip of its own.
 *
 * Then `router.refresh()`, which re-renders every server component with the
 * new cookie in hand. Client state survives it, so switching language
 * mid-scene does not restart anything.
 */
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n";
import { rememberLocale } from "./remember-locale";

export function LanguagePicker({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();

  function choose(next: Locale) {
    if (next === locale) return;
    rememberLocale(next);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="opacity-50">{label}</span>
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => choose(option)}
          aria-pressed={option === locale}
          className={option === locale ? "font-semibold underline" : "opacity-60 underline"}
        >
          {LOCALE_NAMES[option]}
        </button>
      ))}
    </div>
  );
}
