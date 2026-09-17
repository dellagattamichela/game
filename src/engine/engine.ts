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
import type { MessageKey, Params } from "@/i18n";
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
  MinigameSpec,
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
    minigame: null,
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

/**
 * How hard a skill test is right now, after mishap surcharges. The mirror of
 * effectiveCost: a group that has collected setbacks finds everything harder.
 * Clamped to 1..5 so a pile of mishaps cannot make a puzzle unwinnable.
 */
export function effectiveDifficulty(
  story: Story,
  state: GameState,
  spec: MinigameSpec,
): number {
  const surcharge = state.mishaps.reduce(
    (sum, id) => sum + (story.mishaps?.[id]?.minigameDifficultyDelta ?? 0),
    0,
  );
  return Math.max(1, Math.min(5, (spec.difficulty ?? 2) + surcharge));
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

/**
 * Who the dialog box shows as talking.
 *
 * Worked out here rather than in the UI for the same reason as everything else
 * in `sceneView`: one place decides, and every screen in the room agrees.
 */
export type SpeakerView =
  | { kind: "cast"; id: string; name: string; look: Record<string, string> }
  | { kind: "spotlight"; player: PlayerState }
  | { kind: "everyone"; players: PlayerState[] };

export type SceneView = {
  sceneId: string;
  text: string;
  speaker: SpeakerView;
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

  const cast = scene.speaker ? story.cast?.[scene.speaker] : undefined;
  const speaker: SpeakerView = cast
    ? { kind: "cast", id: scene.speaker!, name: cast.name, look: cast.look ?? {} }
    : mode === "group"
      ? { kind: "everyone", players: state.players }
      : { kind: "spotlight", player: spotlight };

  return {
    sceneId: state.sceneId,
    text: resolveText(scene.text, ctx),
    speaker,
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

/**
 * The option a turn timer picks when nobody decides in time.
 *
 * "Safe" means cheapest first, and among equals the earliest — stories are
 * written with the free option as the unambitious one, so a timeout costs the
 * room its best outcome rather than its Stars. Hidden options are not
 * candidates: a choice the room cannot see must not be made on its behalf.
 *
 * Returns -1 only if the scene has nothing takeable at all, which validation
 * makes unreachable but a timeout must not crash on.
 */
export function safeChoiceIndex(story: Story, state: GameState): number {
  const view = sceneView(story, state);
  const takeable = view.choices.filter((choice) => !choice.hidden && choice.available);
  if (takeable.length === 0) return -1;

  return takeable.reduce((best, choice) => (choice.cost < best.cost ? choice : best)).index;
}

/**
 * The context a line was written for.
 *
 * A log entry is read long after its scene: the spotlight has moved on, so
 * `{spotlight}` has to resolve to whoever actually decided rather than to
 * whoever is deciding now. The deciders are in the entry, which is why they
 * are kept there.
 */
function contextFor(state: GameState, entry: LogEntry): TextContext {
  const index = state.players.findIndex((p) => p.id === entry.deciderIds[0]);
  return {
    players: state.players,
    spotlightIndex: index < 0 ? state.spotlightIndex : index,
    sceneId: entry.sceneId,
    seed: state.seed,
  };
}

/** What a logged choice was called, in the story you hand in. */
export function entryLabel(story: Story, state: GameState, entry: LogEntry): string {
  const choice = story.scenes[entry.sceneId]?.choices[entry.choiceIndex];
  return choice ? resolveText(choice.label, contextFor(state, entry)) : "";
}

/**
 * The result beat, in words.
 *
 * Resolved at render rather than stored, so the state a room saves is
 * language-free and two players can read the same moment in two languages.
 * The spotlight has not rotated yet during a result, so the current context is
 * the right one.
 */
export function pendingView(
  story: Story,
  state: GameState,
): { label: string; text: string } | null {
  const pending = state.pending;
  if (!pending) return null;

  const choice = story.scenes[pending.sceneId]?.choices[pending.choiceIndex];
  if (!choice) return null;

  const ctx: TextContext = {
    players: state.players,
    spotlightIndex: state.spotlightIndex,
    sceneId: pending.sceneId,
    seed: state.seed,
  };
  const passed = pending.minigame?.passed ?? true;
  const body = (passed ? choice.result : (choice.failResult ?? choice.result)) ?? "";

  return { label: resolveText(choice.label, ctx), text: resolveText(body, ctx) };
}

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

const reject = (
  code: RejectionCode,
  key: MessageKey,
  message: string,
  params?: Params,
): ActionResult => ({ ok: false, code, message, key, params });

export function applyAction(story: Story, state: GameState, action: Action): ActionResult {
  if (state.phase === "ended") {
    return reject("already_ended", "reject.storyOver", "The story is over.");
  }

  switch (action.type) {
    case "give":
      return applyGive(state, action);
    case "vote":
      return applyVote(story, state, action);
    case "choose":
      return applyChoose(story, state, action);
    case "minigameResult":
      return applyMinigameResult(story, state, action);
    case "continue":
      return applyContinue(story, state);
  }
}

function applyGive(
  state: GameState,
  action: Extract<Action, { type: "give" }>,
): ActionResult {
  if (state.phase !== "scene") {
    return reject("wrong_phase", "reject.giveOutsideScene", "Stars can only be given while a scene is open.");
  }

  const from = state.players.find((p) => p.id === action.fromId);
  const to = state.players.find((p) => p.id === action.toId);
  if (!from || !to) return reject("unknown_player", "reject.unknownPlayer", "That player is not in this room.");
  if (from.id === to.id) return reject("invalid_gift", "reject.giveToSelf", "You cannot give Stars to yourself.");
  if (!Number.isInteger(action.amount) || action.amount <= 0) {
    return reject("invalid_gift", "reject.giveAmount", "Give a whole number of Stars, at least 1.");
  }
  if (from.stars < action.amount) {
    return reject("invalid_gift", "reject.giveTooMany", `${from.name} only has ${from.stars} ⭐.`, {
      name: from.name,
      stars: from.stars,
    });
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
  if (state.phase !== "scene") return reject("wrong_phase", "reject.nothingToVoteOn", "There is nothing to vote on.");
  if (sceneMode(scene) !== "group") {
    return reject("wrong_phase", "reject.spotlightsCall", "This scene is the spotlight player's call.");
  }
  if (!state.players.some((p) => p.id === action.playerId)) {
    return reject("unknown_player", "reject.unknownPlayer", "That player is not in this room.");
  }
  const target = scene.choices[action.choiceIndex];
  if (!target) return reject("unknown_choice", "reject.unknownChoice", "That option does not exist.");
  if (!matchesCondition(target.requires, state)) {
    return reject("unavailable_choice", "reject.unavailableChoice", "The room does not know enough for that yet.");
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
  if (state.phase !== "scene") return reject("wrong_phase", "reject.nothingToChoose", "There is nothing to choose.");
  if (sceneMode(scene) !== "spotlight") {
    return reject("wrong_phase", "reject.groupVote", "This scene is a group vote.");
  }
  if (action.playerId !== spotlightPlayer(state).id) {
    return reject("not_spotlight", "reject.notSpotlight", "Only the spotlight player picks this scene.");
  }
  const choice = scene.choices[action.choiceIndex];
  if (!choice) return reject("unknown_choice", "reject.unknownChoice", "That option does not exist.");
  if (!matchesCondition(choice.requires, state)) {
    // Reachable only from a stale client, but it must be refused server-side:
    // the whole point of hiding an option is that it cannot be taken.
    return reject("unavailable_choice", "reject.unavailableChoice", "The room does not know enough for that yet.");
  }

  const scene2 = currentScene(story, state);
  const cost = effectiveCost(story, state, scene2, choice);
  const payer = spotlightPlayer(state);
  if (cost > payer.stars) {
    return reject(
      "cannot_afford",
      "reject.cannotAfford",
      `${payer.name} needs ${cost - payer.stars} more ⭐ for that.`,
      { name: payer.name, short: cost - payer.stars },
    );
  }

  if (choice.minigame) {
    // Nothing is charged or applied yet. Stars cannot move during the minigame
    // phase (gifts require an open scene), so resolving the cost later is
    // equivalent and keeps every outcome in one place.
    return {
      ok: true,
      state: {
        ...state,
        phase: "minigame",
        minigame: {
          choiceIndex: action.choiceIndex,
          playerId: action.playerId,
          spec: {
            ...choice.minigame,
            difficulty: effectiveDifficulty(story, state, choice.minigame),
          },
        },
      },
    };
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
  /** False only when a skill test was attempted and failed. */
  passed = true,
): ActionResult {
  const scene = currentScene(story, state);
  const choice = scene.choices[choiceIndex];
  const mode = sceneMode(scene);
  const cost = mode === "spotlight" ? effectiveCost(story, state, scene, choice) : 0;
  const payer = spotlightPlayer(state);

  if (cost > payer.stars) {
    return reject(
      "cannot_afford",
      "reject.cannotAfford",
      `${payer.name} needs ${cost - payer.stars} more ⭐ for that.`,
      { name: payer.name, short: cost - payer.stars },
    );
  }

  const deltas: Record<string, number> = {};
  const bump = (playerId: string, amount: number) => {
    deltas[playerId] = (deltas[playerId] ?? 0) + amount;
  };

  if (cost > 0) bump(payer.id, -cost);

  // A failed attempt applies failEffects (nothing, by default) and still moves
  // the story on: a skill test costs you the prize, never the run.
  const effects = (passed ? choice.effects : choice.failEffects) ?? {};
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

  const attempt = choice.minigame ? { type: choice.minigame.type, passed } : null;
  const entry: LogEntry = {
    sceneId: state.sceneId,
    deciderIds,
    choiceIndex,
    starsSpent: cost,
    mishapAdded,
    cluesFound,
    minigame: attempt,
    gifts: state.gifts,
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
      minigame: null,
      pending: {
        sceneId: state.sceneId,
        choiceIndex,
        deltas,
        gifts: state.gifts,
        mishapAdded,
        cluesFound,
        minigame: attempt,
        next: passed ? (choice.next ?? null) : (choice.failNext ?? choice.next ?? null),
      },
      log: [...state.log, entry],
    },
  };
}

function applyMinigameResult(
  story: Story,
  state: GameState,
  action: Extract<Action, { type: "minigameResult" }>,
): ActionResult {
  if (state.phase !== "minigame" || !state.minigame) {
    return reject("wrong_phase", "reject.noAttempt", "Nobody is attempting anything right now.");
  }
  if (action.playerId !== state.minigame.playerId) {
    return reject("not_your_minigame", "reject.notYourAttempt", "That attempt belongs to another player.");
  }

  return commitChoice(story, state, state.minigame.choiceIndex, [action.playerId], action.passed);
}

function applyContinue(story: Story, state: GameState): ActionResult {
  if (state.phase !== "result" || !state.pending) {
    return reject("wrong_phase", "reject.noResult", "There is no result to move past.");
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
