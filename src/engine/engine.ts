/**
 * The story engine: a pure reducer over (Story, GameState, Action).
 *
 * Rules of this module:
 *   - No I/O, no Date.now(), no Math.random(). Same inputs, same output, always.
 *   - Never mutate the state passed in; always return a new object.
 *
 * Both properties exist for stage 4 of the build plan. When rooms become
 * server-authoritative, the route handler reads the room's state, calls
 * applyAction, and writes the result back under an optimistic lock. Clients run
 * the identical function to predict the outcome. Any impurity here would show up
 * as two players seeing different stories.
 */
import { matchesCondition } from "./conditions";
import { resolveText, type TextContext } from "./text";
import type {
  Action,
  ActionResult,
  Choice,
  Ending,
  GameState,
  Gift,
  LogEntry,
  PlayerState,
  RejectionCode,
  Scene,
  Story,
} from "./types";

const asArray = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(
  story: Story,
  players: { id: string; name: string }[],
  seed: number,
): GameState {
  return {
    storyId: story.id,
    phase: "scene",
    sceneId: story.start,
    players: players.map((p) => ({ ...p, stars: story.startingStars })),
    spotlightIndex: 0,
    mishaps: [],
    clues: [],
    vars: {},
    votes: {},
    gifts: [],
    pending: null,
    endingId: null,
    log: [],
    seed,
  };
}

// ---------------------------------------------------------------------------
// Derived reads — used by the UI and by the reducer itself, so both agree
// ---------------------------------------------------------------------------

export function currentScene(story: Story, state: GameState): Scene {
  const scene = story.scenes[state.sceneId];
  if (!scene) throw new Error(`Story "${story.id}" has no scene "${state.sceneId}"`);
  return scene;
}

export function spotlightPlayer(state: GameState): PlayerState {
  return state.players[state.spotlightIndex];
}

export function sceneMode(scene: Scene) {
  return scene.mode ?? "spotlight";
}

export function isCrisis(scene: Scene) {
  return scene.type === "crisis";
}

/**
 * What a choice actually costs right now, after mishap surcharges.
 *
 * Free choices stay free no matter how many mishaps the group has collected.
 * Without that floor, a run with two surcharge mishaps could lock every option
 * in a crisis and leave the story with nowhere to go.
 */
export function effectiveCost(story: Story, state: GameState, scene: Scene, choice: Choice): number {
  const base = choice.cost ?? 0;
  if (base <= 0) return 0;
  if (!isCrisis(scene)) return base;

  const surcharge = state.mishaps.reduce(
    (sum, id) => sum + (story.mishaps?.[id]?.crisisCostDelta ?? 0),
    0,
  );
  // A paid choice never drops below 1, so a discount mishap can't make a gated
  // option free and erase the decision.
  return Math.max(1, base + surcharge);
}

export function textContext(state: GameState): TextContext {
  return {
    players: state.players,
    spotlightIndex: state.spotlightIndex,
    sceneId: state.sceneId,
    seed: state.seed,
  };
}

export type ChoiceView = {
  index: number;
  label: string;
  cost: number;
  /** The choice's `requires` condition is satisfied. */
  available: boolean;
  /**
   * Unavailable and the story offered no hint: do not render it at all.
   * Rendering it greyed out would tell players that evidence they have not
   * found exists, which is the one thing an investigation must not leak.
   */
  hidden: boolean;
  /** Shown, but not pickable right now. */
  locked: boolean;
  /** Why it is locked, ready to display. Null when the choice is pickable. */
  lockedReason: string | null;
  /** Stars still needed. 0 unless locked on price. Drives the "who can help?" prompt. */
  shortfall: number;
  votes: string[];
};

export type SceneView = {
  sceneId: string;
  text: string;
  mode: "spotlight" | "group";
  isCrisis: boolean;
  spotlight: PlayerState;
  choices: ChoiceView[];
  /** Group scenes: who still has to vote. */
  awaitingVotes: PlayerState[];
};

/**
 * Everything the UI needs to draw a scene, with placeholders resolved and gates
 * evaluated. Deriving this in the engine rather than in components means the
 * lock state the player sees is the same one the reducer will enforce.
 */
export function sceneView(story: Story, state: GameState): SceneView {
  const scene = currentScene(story, state);
  const ctx = textContext(state);
  const spotlight = spotlightPlayer(state);
  const mode = sceneMode(scene);

  const choices: ChoiceView[] = scene.choices.map((choice, index) => {
    const cost = effectiveCost(story, state, scene, choice);
    const available = matchesCondition(choice.requires, state);
    // Only spotlight scenes are payable, so only they can lock on price.
    const tooExpensive = available && mode === "spotlight" && cost > spotlight.stars;

    return {
      index,
      label: resolveText(choice.label, ctx),
      cost,
      available,
      hidden: !available && !choice.lockedHint,
      locked: !available || tooExpensive,
      lockedReason: !available
        ? (choice.lockedHint ?? null)
        : tooExpensive
          ? `needs ${cost - spotlight.stars} more ⭐`
          : null,
      shortfall: tooExpensive ? cost - spotlight.stars : 0,
      votes: Object.entries(state.votes)
        .filter(([, v]) => v === index)
        .map(([playerId]) => playerId),
    };
  });

  return {
    sceneId: state.sceneId,
    text: resolveText(scene.text, ctx),
    mode,
    isCrisis: isCrisis(scene),
    spotlight,
    choices,
    awaitingVotes:
      mode === "group" ? state.players.filter((p) => !(p.id in state.votes)) : [],
  };
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

export function totalStars(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.stars, 0);
}

/**
 * First matching ending wins, so stories must list their endings from most
 * specific to least. An ending with no `requires` always matches and acts as the
 * fallback; validation guarantees every story has one.
 */
export function resolveEnding(story: Story, state: GameState): Ending {
  for (const ending of story.endings) {
    if (matchesCondition(ending.requires, state)) return ending;
  }
  return story.endings[story.endings.length - 1];
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const reject = (code: RejectionCode, message: string): ActionResult => ({
  ok: false,
  code,
  message,
});

export function applyAction(story: Story, state: GameState, action: Action): ActionResult {
  if (state.phase === "ended") {
    return reject("already_ended", "The story is over.");
  }

  switch (action.type) {
    case "give":
      return applyGive(state, action);
    case "vote":
      return applyVote(story, state, action);
    case "choose":
      return applyChoose(story, state, action);
    case "continue":
      return applyContinue(story, state);
  }
}

function applyGive(
  state: GameState,
  action: Extract<Action, { type: "give" }>,
): ActionResult {
  if (state.phase !== "scene") {
    return reject("wrong_phase", "Stars can only be given while a scene is open.");
  }

  const from = state.players.find((p) => p.id === action.fromId);
  const to = state.players.find((p) => p.id === action.toId);
  if (!from || !to) return reject("unknown_player", "That player is not in this room.");
  if (from.id === to.id) return reject("invalid_gift", "You cannot give Stars to yourself.");
  if (!Number.isInteger(action.amount) || action.amount <= 0) {
    return reject("invalid_gift", "Give a whole number of Stars, at least 1.");
  }
  if (from.stars < action.amount) {
    return reject("invalid_gift", `${from.name} only has ${from.stars} ⭐.`);
  }

  // Transfers land immediately so the gate unlocks the moment help arrives,
  // which is the whole point of the "who's going to save us?" beat.
  const gift: Gift = { fromId: from.id, toId: to.id, amount: action.amount };
  return {
    ok: true,
    state: {
      ...state,
      players: state.players.map((p) =>
        p.id === from.id
          ? { ...p, stars: p.stars - action.amount }
          : p.id === to.id
            ? { ...p, stars: p.stars + action.amount }
            : p,
      ),
      gifts: [...state.gifts, gift],
    },
  };
}

function applyVote(
  story: Story,
  state: GameState,
  action: Extract<Action, { type: "vote" }>,
): ActionResult {
  const scene = currentScene(story, state);
  if (state.phase !== "scene") return reject("wrong_phase", "There is nothing to vote on.");
  if (sceneMode(scene) !== "group") {
    return reject("wrong_phase", "This scene is the spotlight player's call.");
  }
  if (!state.players.some((p) => p.id === action.playerId)) {
    return reject("unknown_player", "That player is not in this room.");
  }
  const target = scene.choices[action.choiceIndex];
  if (!target) return reject("unknown_choice", "That option does not exist.");
  if (!matchesCondition(target.requires, state)) {
    return reject("unavailable_choice", "The room does not know enough for that yet.");
  }

  // Re-voting is allowed until the last player commits, so a group can talk it out.
  const votes = { ...state.votes, [action.playerId]: action.choiceIndex };
  const voted = { ...state, votes };
  if (Object.keys(votes).length < state.players.length) {
    return { ok: true, state: voted };
  }

  const winner = tallyVotes(voted, scene.choices.length);
  return commitChoice(story, voted, winner, votersFor(voted, winner));
}

/** Majority wins; the spotlight player breaks ties (design doc §6). */
export function tallyVotes(state: GameState, choiceCount: number): number {
  const counts = new Array<number>(choiceCount).fill(0);
  for (const index of Object.values(state.votes)) counts[index] += 1;

  const max = Math.max(...counts);
  const tied = counts.flatMap((c, i) => (c === max ? [i] : []));
  if (tied.length === 1) return tied[0];

  const spotlightVote = state.votes[spotlightPlayer(state).id];
  return spotlightVote !== undefined && tied.includes(spotlightVote) ? spotlightVote : tied[0];
}

function votersFor(state: GameState, choiceIndex: number): string[] {
  return Object.entries(state.votes)
    .filter(([, v]) => v === choiceIndex)
    .map(([playerId]) => playerId);
}

function applyChoose(
  story: Story,
  state: GameState,
  action: Extract<Action, { type: "choose" }>,
): ActionResult {
  const scene = currentScene(story, state);
  if (state.phase !== "scene") return reject("wrong_phase", "There is nothing to choose.");
  if (sceneMode(scene) !== "spotlight") {
    return reject("wrong_phase", "This scene is a group vote.");
  }
  if (action.playerId !== spotlightPlayer(state).id) {
    return reject("not_spotlight", "Only the spotlight player picks this scene.");
  }
  const choice = scene.choices[action.choiceIndex];
  if (!choice) return reject("unknown_choice", "That option does not exist.");
  if (!matchesCondition(choice.requires, state)) {
    // Reachable only from a stale client, but it must be refused server-side:
    // the whole point of hiding an option is that it cannot be taken.
    return reject("unavailable_choice", "The room does not know enough for that yet.");
  }

  return commitChoice(story, state, action.choiceIndex, [action.playerId]);
}

/**
 * Shared tail of `choose` and a completed group vote: charge the cost, apply
 * effects, log it, and park the result for everyone to read.
 *
 * `deciderIds` is one player for spotlight scenes and every winning voter for
 * group scenes — which is what makes `effects.stars` reward voting with the
 * majority rather than going to a single arbitrary player.
 */
function commitChoice(
  story: Story,
  state: GameState,
  choiceIndex: number,
  deciderIds: string[],
): ActionResult {
  const scene = currentScene(story, state);
  const choice = scene.choices[choiceIndex];
  const mode = sceneMode(scene);
  const cost = mode === "spotlight" ? effectiveCost(story, state, scene, choice) : 0;
  const payer = spotlightPlayer(state);

  if (cost > payer.stars) {
    return reject(
      "cannot_afford",
      `${payer.name} needs ${cost - payer.stars} more ⭐ for that.`,
    );
  }

  const deltas: Record<string, number> = {};
  const bump = (playerId: string, amount: number) => {
    deltas[playerId] = (deltas[playerId] ?? 0) + amount;
  };

  if (cost > 0) bump(payer.id, -cost);

  const effects = choice.effects ?? {};
  if (effects.stars) for (const id of deciderIds) bump(id, effects.stars);
  if (effects.starsAll) for (const p of state.players) bump(p.id, effects.starsAll);

  const players = state.players.map((p) => ({
    ...p,
    // Clamped: a starsAll penalty must never push a player negative, or the
    // next gate becomes unreachable through no fault of their own.
    stars: Math.max(0, p.stars + (deltas[p.id] ?? 0)),
  }));

  let mishaps = state.mishaps;
  if (effects.removeMishap) mishaps = mishaps.filter((id) => id !== effects.removeMishap);
  const mishapAdded =
    effects.addMishap && !mishaps.includes(effects.addMishap) ? effects.addMishap : null;
  if (mishapAdded) mishaps = [...mishaps, mishapAdded];

  let clues = state.clues;
  const removedClues = asArray(effects.removeClue);
  if (removedClues.length) clues = clues.filter((id) => !removedClues.includes(id));
  // Only genuinely new clues are reported, so re-visiting a scene cannot make
  // the result beat announce a discovery the room already had.
  const cluesFound = asArray(effects.addClue).filter((id) => !clues.includes(id));
  if (cluesFound.length) clues = [...clues, ...cluesFound];

  const vars = effects.set ? { ...state.vars, ...effects.set } : state.vars;

  const ctx = textContext(state);
  const entry: LogEntry = {
    sceneId: state.sceneId,
    deciderIds,
    choiceIndex,
    label: resolveText(choice.label, ctx),
    starsSpent: cost,
    mishapAdded,
    cluesFound,
  };

  return {
    ok: true,
    state: {
      ...state,
      phase: "result",
      players,
      mishaps,
      clues,
      vars,
      pending: {
        sceneId: state.sceneId,
        choiceIndex,
        label: entry.label,
        text: resolveText(choice.result ?? "", ctx),
        deltas,
        gifts: state.gifts,
        mishapAdded,
        cluesFound,
        next: choice.next ?? null,
      },
      log: [...state.log, entry],
    },
  };
}

function applyContinue(story: Story, state: GameState): ActionResult {
  if (state.phase !== "result" || !state.pending) {
    return reject("wrong_phase", "There is no result to move past.");
  }

  const { next } = state.pending;
  if (next === null) {
    const ending = resolveEnding(story, state);
    return {
      ok: true,
      state: { ...state, phase: "ended", endingId: ending.id, pending: null },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      phase: "scene",
      sceneId: next,
      // The spotlight rotates after every scene, group scenes included, so the
      // share of spotlight turns stays even across the run.
      spotlightIndex: (state.spotlightIndex + 1) % state.players.length,
      votes: {},
      gifts: [],
      pending: null,
    },
  };
}
