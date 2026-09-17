/**
 * Story registry.
 *
 * Stories are validated at import time rather than lazily, so a malformed story
 * file fails the build and the test run instead of at the moment a player picks
 * it from the lobby.
 *
 * Each story is held once in English and once per translation. The translations
 * are overlays applied at import, so a locale costs one pass over the prose at
 * startup and nothing at all per request — and, more to the point, the engine
 * only ever sees one structure whichever language a player is reading in.
 */
import type { Locale } from "@/i18n/locale";
import { DEFAULT_LOCALE } from "@/i18n/locale";
import type { Story } from "@/engine/types";
import { validateStory } from "@/engine/validate";
import { localizeStory, type StoryCatalog } from "./localize";
import stranded from "./stranded.json";
import thePilot from "./the-pilot.json";
import strandedIt from "./it/stranded.json";
import thePilotIt from "./it/the-pilot.json";

export const STORIES: Story[] = [thePilot, stranded].map(validateStory);

/** Prose overlays, by locale and story id. English needs none: it is the file. */
export const STORY_CATALOGS: Partial<Record<Locale, Record<string, StoryCatalog>>> = {
  it: { "the-pilot": thePilotIt, stranded: strandedIt },
};

const TRANSLATED: Record<string, Partial<Record<Locale, Story>>> = Object.fromEntries(
  STORIES.map((story) => [
    story.id,
    Object.fromEntries(
      Object.entries(STORY_CATALOGS).map(([locale, catalogs]) => [
        locale,
        localizeStory(story, catalogs[story.id] ?? {}),
      ]),
    ),
  ]),
);

/**
 * A story, in a language.
 *
 * The English object is the canonical one: it is what the engine is given, and
 * what every rule is evaluated against. A localized copy differs only in the
 * strings a player reads, so the two are interchangeable everywhere a decision
 * is made and distinguishable only on screen.
 */
export function getStory(id: string, locale: Locale = DEFAULT_LOCALE): Story | undefined {
  const english = STORIES.find((s) => s.id === id);
  if (!english) return undefined;
  return TRANSLATED[id]?.[locale] ?? english;
}

export function requireStory(id: string, locale: Locale = DEFAULT_LOCALE): Story {
  const story = getStory(id, locale);
  if (!story) throw new Error(`No story with id "${id}"`);
  return story;
}
