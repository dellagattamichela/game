import { describe, expect, it } from "vitest";
import { STORIES, STORY_CATALOGS, getStory } from "./index";
import { missingPaths, strayPaths, translatablePaths } from "./localize";
import { LOCALES } from "@/i18n/locale";

const TRANSLATED = LOCALES.filter((locale) => locale !== "en");

describe("story translations", () => {
  for (const locale of TRANSLATED) {
    for (const story of STORIES) {
      const catalog = STORY_CATALOGS[locale]?.[story.id] ?? {};

      it(`${locale} covers every line of ${story.id}`, () => {
        // The point of the whole overlay design: a scene added without its
        // translation is a failing test, not a screen that silently falls
        // back to English in the middle of a story.
        expect(missingPaths(story, catalog)).toEqual([]);
      });

      it(`${locale} has no leftover lines for ${story.id}`, () => {
        // And a scene deleted leaves its translation behind, which is how a
        // catalog slowly fills with prose for scenes nobody can reach.
        expect(strayPaths(story, catalog)).toEqual([]);
      });

      it(`${locale} keeps every placeholder in ${story.id}`, () => {
        const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        const translated = getStory(story.id, locale)!;

        for (const path of translatablePaths(story)) {
          const read = (from: unknown) =>
            path.split(".").reduce<unknown>((node, step) => (node as never)[step], from) as string;
          // A translation that drops {spotlight} turns a personal sentence
          // into a generic one, and one that invents a placeholder renders
          // the braces on screen.
          expect(holes(read(translated)), `${story.id} ${path}`).toEqual(holes(read(story)));
        }
      });

      it(`${locale} actually changes ${story.id}`, () => {
        const translated = getStory(story.id, locale)!;
        expect(translated.title).not.toBe(story.title);
        // And leaves the structure alone, which is what makes it safe to run
        // the rules against the English copy while showing this one.
        expect(Object.keys(translated.scenes)).toEqual(Object.keys(story.scenes));
        expect(translated.endings.map((e) => e.id)).toEqual(story.endings.map((e) => e.id));
      });
    }
  }
});
