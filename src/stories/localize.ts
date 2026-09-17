/**
 * Stories in another language.
 *
 * A translation is an *overlay*, not a second story file: a flat map from a
 * dotted path in the English story to the line that replaces it. The English
 * file stays the one place structure is decided — scenes, ids, gates, costs —
 * so a translation can never quietly add a choice or point a `next` somewhere
 * else, and a scene added without its Italian shows up as a missing path
 * rather than as two files that have drifted apart.
 *
 * Only prose is overlaid. Everything the engine reads — ids, costs, conditions,
 * effects — is the same object in every language, which is what lets two people
 * at one table read the same run in two languages.
 */
import type { Story } from "@/engine/types";

export type StoryCatalog = Record<string, string>;

/** Every path in a story that holds a line somebody reads. */
export function translatablePaths(story: Story): string[] {
  const paths: string[] = ["title"];
  if (story.hook !== undefined) paths.push("hook");

  for (const [sceneId, scene] of Object.entries(story.scenes)) {
    paths.push(`scenes.${sceneId}.text`);
    scene.choices.forEach((choice, i) => {
      const at = `scenes.${sceneId}.choices.${i}`;
      paths.push(`${at}.label`);
      for (const field of ["result", "failResult", "lockedHint"] as const) {
        if (choice[field] !== undefined) paths.push(`${at}.${field}`);
      }
      if (choice.minigame?.prompt !== undefined) paths.push(`${at}.minigame.prompt`);
    });
  }

  for (const [castId, member] of Object.entries(story.cast ?? {})) {
    paths.push(`cast.${castId}.name`);
    if (member.note !== undefined) paths.push(`cast.${castId}.note`);
  }

  for (const group of ["mishaps", "clues"] as const) {
    for (const [id, entry] of Object.entries(story[group] ?? {})) {
      paths.push(`${group}.${id}.title`);
      if (entry.description !== undefined) paths.push(`${group}.${id}.description`);
    }
  }

  for (const [id, spec] of Object.entries(story.vars ?? {})) {
    if (spec.title !== undefined) paths.push(`vars.${id}.title`);
  }

  story.endings.forEach((ending, i) => {
    paths.push(`endings.${i}.title`);
    if (ending.text !== undefined) paths.push(`endings.${i}.text`);
  });

  return paths;
}

/** Read the string a path points at, or undefined if the path is not there. */
function read(story: Story, path: string): string | undefined {
  let node: unknown = story;
  for (const step of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[step];
  }
  return typeof node === "string" ? node : undefined;
}

/** Write a string at a path, cloning only the objects on the way to it. */
function write(story: Story, path: string, value: string): void {
  const steps = path.split(".");
  let node = story as unknown as Record<string, unknown>;
  for (const step of steps.slice(0, -1)) {
    const child = node[step];
    // Arrays stay arrays, so `choices.0` keeps working after the copy.
    node[step] = Array.isArray(child) ? [...child] : { ...(child as object) };
    node = node[step] as Record<string, unknown>;
  }
  node[steps.at(-1)!] = value;
}

/**
 * The story with its prose replaced.
 *
 * A path the catalog has nothing for keeps its English, so a half-finished
 * translation is a readable story rather than a broken one. The suite refuses
 * an incomplete catalog, so that is a safety net and not a plan.
 */
export function localizeStory(story: Story, catalog: StoryCatalog): Story {
  const copy = structuredClone(story);
  for (const [path, line] of Object.entries(catalog)) {
    if (read(story, path) === undefined) continue;
    write(copy, path, line);
  }
  return copy;
}

/** Paths the catalog does not cover. Empty means the translation is complete. */
export function missingPaths(story: Story, catalog: StoryCatalog): string[] {
  return translatablePaths(story).filter((path) => !(path in catalog));
}

/** Paths the catalog has that the story no longer does — a leftover translation. */
export function strayPaths(story: Story, catalog: StoryCatalog): string[] {
  const known = new Set(translatablePaths(story));
  return Object.keys(catalog).filter((path) => !known.has(path));
}
