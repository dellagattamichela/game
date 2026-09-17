import { describe, expect, it } from "vitest";
import { LOCALES, toLocale } from "./locale";
import { MESSAGES, type MessageKey } from "./messages";
import { t } from "./t";

const keysOf = (locale: (typeof LOCALES)[number]) => Object.keys(MESSAGES[locale]).sort();

describe("the catalogue", () => {
  it("says the same things in every language", () => {
    for (const locale of LOCALES) {
      // Not "has at least the English keys" — exactly the same set. A key only
      // Italian has is as much a bug as one only English has: it means the two
      // sides have drifted and nobody noticed.
      expect(keysOf(locale), `${locale} is out of step with English`).toEqual(keysOf("en"));
    }
  });

  it("leaves no message empty", () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("asks for the same holes in every language", () => {
    const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const locale of LOCALES) {
      for (const key of keysOf("en") as MessageKey[]) {
        // A translation that drops a placeholder renders a sentence with a
        // number missing from it, which is worse than an untranslated one.
        expect(holes(MESSAGES[locale][key]), `${locale}.${key}`).toEqual(
          holes(MESSAGES.en[key]),
        );
      }
    }
  });
});

describe("t", () => {
  it("fills the holes", () => {
    expect(t("en", "lobby.players", { count: 2, max: 4 })).toBe("Players (2/4)");
    expect(t("it", "lobby.players", { count: 2, max: 4 })).toBe("Giocatori (2/4)");
  });

  it("leaves a hole alone when nothing is given for it", () => {
    expect(t("en", "lobby.players", { count: 2 })).toBe("Players (2/{max})");
  });

  it("returns the template when there is nothing to fill", () => {
    expect(t("it", "table.crisis")).toBe("Crisi");
  });
});

describe("toLocale", () => {
  it("accepts what it knows and falls back to English for the rest", () => {
    expect(toLocale("it")).toBe("it");
    expect(toLocale("en")).toBe("en");
    for (const junk of [undefined, null, "", "fr", "IT", 7, {}]) {
      expect(toLocale(junk)).toBe("en");
    }
  });
});
