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
  title: string;
  /** Ready to display: "4 ⭐" or "2 scenes". */
  detail: string;
  /** More than one when the run ends in a tie. Never empty. */
  playerIds: string[];
};

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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

  const candidates: { id: string; title: string; tally: Tally; detail: (n: number) => string }[] = [
    { id: "generous", title: "Most Stars given away", tally: given, detail: (n) => `${n} ⭐` },
    { id: "spender", title: "Biggest spender", tally: spent, detail: (n) => `${n} ⭐` },
    {
      id: "chaos",
      title: "Caused the most mishaps",
      tally: mishaps,
      detail: (n) => plural(n, "mishap"),
    },
    { id: "detective", title: "Found the most clues", tally: clues, detail: (n) => plural(n, "clue") },
    { id: "steady", title: "Steadiest hands", tally: passed, detail: (n) => `${n} passed` },
    { id: "fumbler", title: "Fumbled the most", tally: failed, detail: (n) => `${n} failed` },
    {
      id: "driver",
      title: "Made the most calls",
      tally: decisions,
      detail: (n) => plural(n, "scene"),
    },
    { id: "hoarder", title: "Ended with the most Stars", tally: held, detail: (n) => `${n} ⭐` },
  ];

  return candidates.flatMap(({ id, title, tally, detail }) => {
    const won = winners(tally, players);
    return won ? [{ id, title, detail: detail(won.score), playerIds: won.ids }] : [];
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
