/**
 * End-of-run awards.
 *
 * The design doc asks the ending screen for "awards such as Most Stars given
 * away or Caused the most mishaps". They are computed here rather than in the
 * ending screen for the usual reason: the log is the record of what happened,
 * and every client must read the same story out of it.
 *
 * Pure, like everything else in this folder. Given the same finished state, the
 * same awards, in the same order, on every machine.
 */
import type { GameState, LogEntry, PlayerState } from "./types";

export type Award = {
  id: string;
  /**
   * The score, as a number and the kind of thing it counts — not as a
   * sentence. "2 mishaps" is a translation's problem, and which of "mishap"
   * and "mishaps" applies is decided here because here is where the count is.
   */
  detail: { unit: AwardUnit; count: number };
  /** More than one when the run ends in a tie. Never empty. */
  playerIds: string[];
};

export type AwardUnit =
  | "stars"
  | "mishap"
  | "mishaps"
  | "clue"
  | "clues"
  | "passed"
  | "failed"
  | "scene"
  | "scenes";

type Tally = Record<string, number>;

const add = (tally: Tally, playerId: string, amount = 1) => {
  tally[playerId] = (tally[playerId] ?? 0) + amount;
};

/**
 * The players who scored highest, and their score — or null when nobody scored
 * at all. A room where nobody gave a Star away should not be told who gave the
 * fewest; an award for zero is not an award.
 */
function winners(tally: Tally, players: PlayerState[]): { ids: string[]; score: number } | null {
  const scores = players.map((p) => tally[p.id] ?? 0);
  const best = Math.max(0, ...scores);
  if (best <= 0) return null;

  // Ties share the award rather than being broken arbitrarily. Two people who
  // each gave three Stars away both gave three Stars away.
  const ids = players.filter((p) => (tally[p.id] ?? 0) === best).map((p) => p.id);
  return { ids, score: best };
}

const plural = (n: number, one: AwardUnit, many: AwardUnit): AwardUnit => (n === 1 ? one : many);

export function awards(state: GameState): Award[] {
  const { players, log } = state;

  const given: Tally = {};
  const spent: Tally = {};
  const mishaps: Tally = {};
  const clues: Tally = {};
  const passed: Tally = {};
  const failed: Tally = {};
  const decisions: Tally = {};

  for (const entry of log) {
    for (const gift of entry.gifts) add(given, gift.fromId, gift.amount);
    for (const id of entry.deciderIds) {
      add(decisions, id);
      if (entry.mishapAdded) add(mishaps, id);
      if (entry.cluesFound.length) add(clues, id, entry.cluesFound.length);
    }
    // Only the spotlight player pays, and on a spotlight scene they are the
    // only decider — so the first decider is the one who was charged.
    if (entry.starsSpent > 0) add(spent, entry.deciderIds[0], entry.starsSpent);
    if (entry.minigame) add(entry.minigame.passed ? passed : failed, entry.deciderIds[0]);
  }

  const held: Tally = Object.fromEntries(players.map((p) => [p.id, p.stars]));

  const candidates: { id: string; tally: Tally; unit: (n: number) => AwardUnit }[] = [
    { id: "generous", tally: given, unit: () => "stars" },
    { id: "spender", tally: spent, unit: () => "stars" },
    { id: "chaos", tally: mishaps, unit: (n) => plural(n, "mishap", "mishaps") },
    { id: "detective", tally: clues, unit: (n) => plural(n, "clue", "clues") },
    { id: "steady", tally: passed, unit: () => "passed" },
    { id: "fumbler", tally: failed, unit: () => "failed" },
    { id: "driver", tally: decisions, unit: (n) => plural(n, "scene", "scenes") },
    { id: "hoarder", tally: held, unit: () => "stars" },
  ];

  return candidates.flatMap(({ id, tally, unit }) => {
    const won = winners(tally, players);
    if (!won) return [];
    return [{ id, detail: { unit: unit(won.score), count: won.score }, playerIds: won.ids }];
  });
}

/**
 * The handful of scenes worth retelling: the ones that cost Stars, collected a
 * mishap, found a clue, or turned on a skill test.
 *
 * The doc asks the ending screen for "a short recap of the biggest choices",
 * and a fifty-scene run listed in full is not a recap. If nothing stood out —
 * a short story where every choice was free — the last few scenes stand in, so
 * the recap is never empty.
 */
export function highlights(state: GameState, limit = 6): LogEntry[] {
  const notable = state.log.filter(
    (entry) =>
      entry.starsSpent > 0 ||
      entry.mishapAdded !== null ||
      entry.cluesFound.length > 0 ||
      entry.minigame !== null ||
      entry.gifts.length > 0,
  );

  const chosen = notable.length > 0 ? notable : state.log;
  return chosen.slice(-limit);
}
