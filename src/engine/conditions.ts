/**
 * Condition matching, shared by choice requirements and ending requirements.
 *
 * Pure and total: an empty condition matches everything, and an unknown clue or
 * variable simply fails to match rather than throwing. Story files are validated
 * up front (validate.ts), so a condition that can never match is caught at load
 * rather than silently swallowing a run's ending here.
 */
import type { Condition, GameState } from "./types";

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

export function matchesCondition(condition: Condition | undefined, state: GameState): boolean {
  if (!condition) return true;
  const c = condition;
  const clues = new Set(state.clues);

  for (const id of asArray(c.hasClue)) if (!clues.has(id)) return false;
  for (const id of asArray(c.lacksClue)) if (clues.has(id)) return false;
  if (c.anyClue && !c.anyClue.some((id) => clues.has(id))) return false;
  if (c.minClues !== undefined && clues.size < c.minClues) return false;
  if (c.maxClues !== undefined && clues.size > c.maxClues) return false;

  if (c.hasMishap !== undefined && !state.mishaps.includes(c.hasMishap)) return false;
  if (c.lacksMishap !== undefined && state.mishaps.includes(c.lacksMishap)) return false;
  if (c.minMishaps !== undefined && state.mishaps.length < c.minMishaps) return false;
  if (c.maxMishaps !== undefined && state.mishaps.length > c.maxMishaps) return false;

  for (const [key, value] of Object.entries(c.is ?? {})) {
    if (state.vars[key] !== value) return false;
  }
  // An unset variable counts as "not equal", so isNot holds for a run that never
  // reached the scene that would have set it.
  for (const [key, value] of Object.entries(c.isNot ?? {})) {
    if (state.vars[key] === value) return false;
  }
  for (const [key, values] of Object.entries(c.isAny ?? {})) {
    const actual = state.vars[key];
    if (actual === undefined || !values.includes(actual)) return false;
  }
  for (const key of c.isSet ?? []) if (state.vars[key] === undefined) return false;
  for (const key of c.isUnset ?? []) if (state.vars[key] !== undefined) return false;

  if (c.minTotalStars !== undefined) {
    const total = state.players.reduce((sum, p) => sum + p.stars, 0);
    if (total < c.minTotalStars) return false;
  }

  return true;
}

/** Every clue id a condition mentions, for validation and for tooling. */
export function cluesMentioned(condition: Condition | undefined): string[] {
  if (!condition) return [];
  return [
    ...asArray(condition.hasClue),
    ...asArray(condition.lacksClue),
    ...(condition.anyClue ?? []),
  ];
}

/** Every variable a condition reads, paired with the values it expects. */
export function varsMentioned(condition: Condition | undefined): [string, string[]][] {
  if (!condition) return [];
  const out: [string, string[]][] = [];
  for (const [key, value] of Object.entries(condition.is ?? {})) out.push([key, [value]]);
  for (const [key, value] of Object.entries(condition.isNot ?? {})) out.push([key, [value]]);
  for (const [key, values] of Object.entries(condition.isAny ?? {})) out.push([key, values]);
  for (const key of condition.isSet ?? []) out.push([key, []]);
  for (const key of condition.isUnset ?? []) out.push([key, []]);
  return out;
}
