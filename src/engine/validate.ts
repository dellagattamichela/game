/**
 * Story file validation.
 *
 * Stories are data, and the design doc's goal is that a writer can add one
 * without touching code. That only holds if a malformed story fails loudly with
 * a message pointing at the offending field, instead of throwing somewhere deep
 * in the reducer three scenes into a playthrough.
 *
 * Shape is checked by zod; the rules that span fields (dangling `next` targets,
 * costs outside crisis scenes, a missing fallback ending) are checked after.
 */
import { z } from "zod";
import { cluesMentioned, varsMentioned } from "./conditions";
import type { Condition, Story } from "./types";

const stringOrArray = z.union([z.string(), z.array(z.string())]);

const condition = z
  .object({
    hasClue: stringOrArray.optional(),
    anyClue: z.array(z.string()).optional(),
    lacksClue: stringOrArray.optional(),
    minClues: z.number().int().min(0).optional(),
    maxClues: z.number().int().min(0).optional(),
    hasMishap: z.string().optional(),
    lacksMishap: z.string().optional(),
    minMishaps: z.number().int().min(0).optional(),
    maxMishaps: z.number().int().min(0).optional(),
    is: z.record(z.string(), z.string()).optional(),
    isNot: z.record(z.string(), z.string()).optional(),
    isAny: z.record(z.string(), z.array(z.string())).optional(),
    isSet: z.array(z.string()).optional(),
    isUnset: z.array(z.string()).optional(),
    minTotalStars: z.number().int().min(0).optional(),
  })
  .strict();

const effectSpec = z
  .object({
    stars: z.number().int().optional(),
    starsAll: z.number().int().optional(),
    addMishap: z.string().optional(),
    removeMishap: z.string().optional(),
    addClue: stringOrArray.optional(),
    removeClue: stringOrArray.optional(),
    set: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const choice = z
  .object({
    label: z.string().min(1),
    cost: z.number().int().min(0).optional(),
    requires: condition.optional(),
    lockedHint: z.string().min(1).optional(),
    effects: effectSpec.optional(),
    result: z.string().optional(),
    next: z.string().nullable().optional(),
  })
  .strict();

const scene = z
  .object({
    type: z.enum(["normal", "crisis"]).optional(),
    mode: z.enum(["spotlight", "group"]).optional(),
    background: z.string().optional(),
    text: z.string().min(1),
    // Investigation scenes offer more options than a comedy beat, because some
    // are hidden behind clues and a given run sees only a few of them.
    choices: z.array(choice).min(2).max(8),
  })
  .strict();

const mishap = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    crisisCostDelta: z.number().int().optional(),
  })
  .strict();

const clue = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

const varSpec = z
  .object({
    title: z.string().optional(),
    values: z.array(z.string().min(1)).min(1),
  })
  .strict();

const ending = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    text: z.string().optional(),
    requires: condition.optional(),
  })
  .strict();

export const storySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    hook: z.string().optional(),
    players: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }).strict(),
    startingStars: z.number().int().min(0),
    start: z.string().min(1),
    scenes: z.record(z.string(), scene),
    mishaps: z.record(z.string(), mishap).optional(),
    clues: z.record(z.string(), clue).optional(),
    vars: z.record(z.string(), varSpec).optional(),
    endings: z.array(ending).min(1),
  })
  .strict();

export class StoryValidationError extends Error {
  constructor(
    readonly storyId: string,
    readonly problems: string[],
  ) {
    super(`Story "${storyId}" is invalid:\n  - ${problems.join("\n  - ")}`);
    this.name = "StoryValidationError";
  }
}

const toArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Whether any choice anywhere in the story grants this clue. */
function grantedCluesEventually(story: Story, clueId: string): boolean {
  return Object.values(story.scenes).some((scene) =>
    scene.choices.some((choice) => toArray(choice.effects?.addClue).includes(clueId)),
  );
}

/** Cross-field rules zod can't express on its own. */
function referentialProblems(story: Story): string[] {
  const problems: string[] = [];
  const sceneIds = new Set(Object.keys(story.scenes));
  const mishapIds = new Set(Object.keys(story.mishaps ?? {}));

  if (!sceneIds.has(story.start)) {
    problems.push(`start scene "${story.start}" does not exist`);
  }

  for (const [sceneId, scene] of Object.entries(story.scenes)) {
    const isCrisis = scene.type === "crisis";
    const isGroup = (scene.mode ?? "spotlight") === "group";

    scene.choices.forEach((choice, i) => {
      const where = `scenes.${sceneId}.choices[${i}]`;

      if (choice.next != null && !sceneIds.has(choice.next)) {
        problems.push(`${where}.next points at missing scene "${choice.next}"`);
      }

      // Gates belong to crisis scenes only (design doc §7: "gates should appear
      // only at a few crisis scenes, so they feel special").
      if ((choice.cost ?? 0) > 0 && !isCrisis) {
        problems.push(`${where} has a cost but scene "${sceneId}" is not type "crisis"`);
      }

      // Nobody has agreed who pays in a group vote, so v1 forbids the case
      // rather than inventing a rule the players can't see.
      if ((choice.cost ?? 0) > 0 && isGroup) {
        problems.push(`${where} has a cost, which group scenes do not support`);
      }

      for (const key of ["addMishap", "removeMishap"] as const) {
        const id = choice.effects?.[key];
        if (id && !mishapIds.has(id)) {
          problems.push(`${where}.effects.${key} references unknown mishap "${id}"`);
        }
      }
    });
  }

  for (const [key, m] of Object.entries(story.mishaps ?? {})) {
    if (key !== m.id) problems.push(`mishaps.${key} has mismatched id "${m.id}"`);
  }
  for (const [key, c] of Object.entries(story.clues ?? {})) {
    if (key !== c.id) problems.push(`clues.${key} has mismatched id "${c.id}"`);
  }

  // --- clues and run variables -------------------------------------------
  const clueIds = new Set(Object.keys(story.clues ?? {}));
  const varSpecs = story.vars ?? {};
  /** Clues some choice actually grants. A clue nothing grants can never be held. */
  const grantedClues = new Set<string>();
  /** Values some choice actually sets, per variable. */
  const setValues = new Map<string, Set<string>>();

  const checkCondition = (condition: Condition | undefined, where: string) => {
    for (const id of cluesMentioned(condition)) {
      if (!clueIds.has(id)) problems.push(`${where} references unknown clue "${id}"`);
    }
    for (const [key, values] of varsMentioned(condition)) {
      const spec = varSpecs[key];
      if (!spec) {
        problems.push(`${where} references undeclared variable "${key}"`);
        continue;
      }
      for (const value of values) {
        if (!spec.values.includes(value)) {
          problems.push(`${where} expects ${key}="${value}", which is not a declared value`);
        }
      }
    }
  };

  for (const [sceneId, scene] of Object.entries(story.scenes)) {
    scene.choices.forEach((choice, i) => {
      const where = `scenes.${sceneId}.choices[${i}]`;
      checkCondition(choice.requires, `${where}.requires`);

      for (const key of ["addClue", "removeClue"] as const) {
        for (const id of toArray(choice.effects?.[key])) {
          if (!clueIds.has(id)) {
            problems.push(`${where}.effects.${key} references unknown clue "${id}"`);
          } else if (key === "addClue") {
            grantedClues.add(id);
          }
        }
      }

      for (const [key, value] of Object.entries(choice.effects?.set ?? {})) {
        const spec = varSpecs[key];
        if (!spec) {
          problems.push(`${where}.effects.set uses undeclared variable "${key}"`);
          continue;
        }
        if (!spec.values.includes(value)) {
          problems.push(`${where}.effects.set assigns ${key}="${value}", not a declared value`);
          continue;
        }
        const seen = setValues.get(key) ?? new Set<string>();
        seen.add(value);
        setValues.set(key, seen);
      }

      // A hidden choice that nothing can ever unlock is a dead branch. Catching
      // it here is the difference between "this ending is rare" and "this ending
      // is unreachable", which is invisible when reading a story file.
      if (choice.requires && !choice.lockedHint) {
        for (const id of toArray(choice.requires.hasClue)) {
          if (clueIds.has(id) && !grantedCluesEventually(story, id)) {
            problems.push(`${where} requires clue "${id}", which no choice grants`);
          }
        }
      }
    });
  }

  story.endings.forEach((e, i) => {
    checkCondition(e.requires, `endings[${i}].requires`);
  });

  for (const id of clueIds) {
    if (!grantedClues.has(id)) problems.push(`clue "${id}" is declared but never found anywhere`);
  }
  for (const [key, spec] of Object.entries(varSpecs)) {
    for (const value of spec.values) {
      if (!setValues.get(key)?.has(value)) {
        problems.push(`vars.${key} declares value "${value}", which no choice ever sets`);
      }
    }
  }

  story.endings.forEach((e, i) => {
    for (const key of ["hasMishap", "lacksMishap"] as const) {
      const id = e.requires?.[key];
      if (id && !mishapIds.has(id)) {
        problems.push(`endings[${i}].requires.${key} references unknown mishap "${id}"`);
      }
    }
  });



  // Endings are evaluated in order and the first match wins, so a story without
  // an unconditional ending can reach a state with no ending at all.
  if (!story.endings.some((e) => !e.requires)) {
    problems.push("no fallback ending: the last ending must have no `requires`");
  } else if (story.endings.at(-1)?.requires) {
    problems.push("the unconditional fallback ending must be listed last");
  }

  if (story.players.min > story.players.max) {
    problems.push("players.min is greater than players.max");
  }

  // A scene nothing links to is almost always a typo in some other scene's `next`.
  const reachable = new Set([story.start]);
  const queue = [story.start];
  while (queue.length) {
    const id = queue.pop()!;
    for (const choice of story.scenes[id]?.choices ?? []) {
      if (choice.next && !reachable.has(choice.next)) {
        reachable.add(choice.next);
        queue.push(choice.next);
      }
    }
  }
  for (const id of sceneIds) {
    if (!reachable.has(id)) problems.push(`scene "${id}" is unreachable from "${story.start}"`);
  }

  return problems;
}

export function validateStory(input: unknown): Story {
  const parsed = storySchema.safeParse(input);
  if (!parsed.success) {
    const id =
      typeof input === "object" && input !== null && "id" in input
        ? String((input as { id: unknown }).id)
        : "<unknown>";
    throw new StoryValidationError(
      id,
      parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`),
    );
  }

  const story = parsed.data as Story;
  const problems = referentialProblems(story);
  if (problems.length) throw new StoryValidationError(story.id, problems);
  return story;
}
