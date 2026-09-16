/**
 * Story registry.
 *
 * Stories are validated at import time rather than lazily, so a malformed story
 * file fails the build and the test run instead of at the moment a player picks
 * it from the lobby.
 */
import type { Story } from "@/engine/types";
import { validateStory } from "@/engine/validate";
import stranded from "./stranded.json";
import thePilot from "./the-pilot.json";

export const STORIES: Story[] = [thePilot, stranded].map(validateStory);

export function getStory(id: string): Story | undefined {
  return STORIES.find((s) => s.id === id);
}

export function requireStory(id: string): Story {
  const story = getStory(id);
  if (!story) throw new Error(`No story with id "${id}"`);
  return story;
}
