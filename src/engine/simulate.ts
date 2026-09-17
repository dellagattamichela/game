/**
 * Playthrough simulation, for tooling and tests. Not used by the game itself.
 *
 * Both `npm run scenarios` and the story tests drive stories through here, so a
 * coverage number in the report and a coverage assertion in CI can never
 * disagree about what "a run" means.
 */
import { applyAction, createGame, sceneView, totalStars } from "./engine";
import { mulberry32 } from "./rng";
import type { Action, GameState, Story } from "./types";

export function applyOrThrow(story: Story, state: GameState, action: Action): GameState {
  const result = applyAction(story, state, action);
  if (!result.ok) throw new Error(`${action.type} rejected: ${result.message}`);
  return result.state;
}

export const advance = (story: Story, state: GameState): GameState =>
  applyOrThrow(story, state, { type: "continue", playerId: state.players[0].id });

/**
 * Resolves the current scene toward `choiceIndex`, pooling the room's Stars if
 * the spotlight player cannot cover a gate alone — which is what a real table
 * does, and therefore what the coverage numbers should assume.
 *
 * Returns null when the choice is unavailable or unaffordable even pooled.
 */
/**
 * Resolves a skill test if one is open. `passRate` is the probability the
 * simulated player succeeds, so a story can be checked both at the pass rate a
 * competent group would hit and at the rate a struggling one would.
 */
export function settleMinigame(
  story: Story,
  state: GameState,
  rand: () => number,
  passRate: number,
): GameState {
  if (state.phase !== "minigame" || !state.minigame) return state;
  return applyOrThrow(story, state, {
    type: "minigameResult",
    playerId: state.minigame.playerId,
    passed: rand() < passRate,
  });
}

export function takeChoice(story: Story, state: GameState, choiceIndex: number): GameState | null {
  const view = sceneView(story, state);
  const choice = view.choices[choiceIndex];
  if (!choice || !choice.available) return null;

  if (view.mode === "group") {
    return state.players.reduce(
      (acc, p) => applyOrThrow(story, acc, { type: "vote", playerId: p.id, choiceIndex }),
      state,
    );
  }

  let working = state;
  if (choice.cost > view.spotlight.stars) {
    if (totalStars(state) < choice.cost) return null;
    for (const donor of state.players) {
      if (donor.id === view.spotlight.id) continue;
      const need = choice.cost - working.players[working.spotlightIndex].stars;
      if (need <= 0) break;
      const give = Math.min(need, working.players.find((p) => p.id === donor.id)!.stars);
      if (give > 0) {
        working = applyOrThrow(story, working, {
          type: "give",
          fromId: donor.id,
          toId: view.spotlight.id,
          amount: give,
        });
      }
    }
  }

  return applyOrThrow(story, working, {
    type: "choose",
    playerId: view.spotlight.id,
    choiceIndex,
  });
}

/** Called on every scene before it is resolved, for collecting statistics. */
export type SceneVisitor = (state: GameState) => void;

/** One random playthrough, picking uniformly among the choices a table could take. */
export function sampleRun(
  story: Story,
  players: { id: string; name: string }[],
  rand: () => number,
  onScene?: SceneVisitor,
  passRate = 0.7,
): GameState {
  let state = createGame(story, players, 99);
  // Bounded rather than while(true): a story with a cycle should fail loudly
  // here instead of hanging whatever called us.
  for (let step = 0; step < 500 && state.phase !== "ended"; step++) {
    onScene?.(state);
    const view = sceneView(story, state);
    const options = view.choices.filter(
      (c) => c.available && (view.mode === "group" || c.cost <= totalStars(state)),
    );
    if (options.length === 0) {
      throw new Error(`Scene "${state.sceneId}" offers no choice this room could take`);
    }
    const picked = takeChoice(story, state, options[Math.floor(rand() * options.length)].index);
    if (!picked) throw new Error(`Scene "${state.sceneId}" refused a choice it offered`);
    state = advance(story, settleMinigame(story, picked, rand, passRate));
  }
  if (state.phase !== "ended") throw new Error("Run did not reach an ending within 500 scenes");
  return state;
}

/** Every distinct playthrough, up to `limit` endings. */
export function enumerateRuns(
  story: Story,
  players: { id: string; name: string }[],
  limit: number,
  onScene?: SceneVisitor,
): GameState[] {
  const out: GameState[] = [];

  const walk = (state: GameState) => {
    if (out.length >= limit) return;
    if (state.phase === "ended") {
      out.push(state);
      return;
    }
    onScene?.(state);
    const scene = story.scenes[state.sceneId];
    for (let i = 0; i < scene.choices.length; i++) {
      const chosen = takeChoice(story, state, i);
      if (!chosen) continue;
      if (chosen.phase === "minigame") {
        // Both outcomes are real branches, so both get walked.
        for (const passed of [true, false]) {
          walk(
            advance(
              story,
              applyOrThrow(story, chosen, {
                type: "minigameResult",
                playerId: chosen.minigame!.playerId,
                passed,
              }),
            ),
          );
        }
      } else {
        walk(advance(story, chosen));
      }
    }
  };

  walk(createGame(story, players, 99));
  return out;
}

/** Upper bound on distinct paths. Used only to choose a strategy. */
export function estimatePaths(story: Story, cap: number): number {
  let total = 1;
  for (const scene of Object.values(story.scenes)) {
    // Each skill test doubles the branches below it.
    const attempts = scene.choices.filter((c) => c.minigame).length;
    total *= Math.max(1, scene.choices.length) * 2 ** attempts;
    if (total > cap) return Infinity;
  }
  return total;
}

/** Past this many paths, walking every one costs more memory than it is worth. */
export const EXHAUSTIVE_CAP = 300_000;

export type CoverageRuns = {
  runs: GameState[];
  /** True when every path was walked, false when the runs were sampled. */
  exhaustive: boolean;
};

/**
 * Every run of a story, or a fair sample of them.
 *
 * Which one you get depends on the size of the story, not on the caller: a
 * twelve-scene comedy has few enough paths to walk all of them, and a
 * thirty-six-scene investigation with eight skill tests has tens of millions.
 * Sampling uses a fixed seed, so a failure is reproducible.
 *
 * Shared by the test suite and `npm run scenarios` so that the two cannot
 * disagree about how a story was measured — and so that a story crossing the
 * cap changes the strategy in both places at once, which is exactly what
 * happened to The Pilot when it grew skill tests.
 */
export function coverageRuns(
  story: Story,
  players: { id: string; name: string }[],
  options: { samples?: number; seed?: number; passRate?: number; onScene?: SceneVisitor } = {},
): CoverageRuns {
  const { samples = 8_000, seed = 20260916, passRate, onScene } = options;

  if (estimatePaths(story, EXHAUSTIVE_CAP) <= EXHAUSTIVE_CAP) {
    return { runs: enumerateRuns(story, players, Number.POSITIVE_INFINITY, onScene), exhaustive: true };
  }

  const rand = mulberry32(seed);
  return {
    runs: Array.from({ length: samples }, () => sampleRun(story, players, rand, onScene, passRate)),
    exhaustive: false,
  };
}
