/**
 * Core types for the Pilot Season story engine.
 *
 * Everything here is plain data. The engine is a pure reducer over these types,
 * which means the same code can run in a single browser (stage 1) or inside a
 * server route handler once rooms exist (stage 4). Nothing in this file may
 * import React, Next, or touch the network.
 */

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/**
 * A test against the current run, used by both choices and endings.
 *
 * Every field present must hold — the fields are ANDed together. Where a story
 * needs OR, the field itself expresses it (`anyClue`, `isAny`), which keeps
 * conditions flat and readable in JSON rather than turning them into a tree.
 */
export type Condition = {
  /** Every one of these clues must be held. */
  hasClue?: string | string[];
  /** At least one of these clues must be held. */
  anyClue?: string[];
  /** None of these clues may be held. */
  lacksClue?: string | string[];
  minClues?: number;
  maxClues?: number;

  hasMishap?: string;
  lacksMishap?: string;
  minMishaps?: number;
  maxMishaps?: number;

  /** Run variables that must equal exactly this value. */
  is?: Record<string, string>;
  /** Run variables that must not equal this value (unset counts as not equal). */
  isNot?: Record<string, string>;
  /** Run variables whose value must be one of these. */
  isAny?: Record<string, string[]>;
  /** These variables must have some value. */
  isSet?: string[];
  /** These variables must have no value. */
  isUnset?: string[];

  /** Unspent Stars across the whole room. */
  minTotalStars?: number;
};

// ---------------------------------------------------------------------------
// Story data (authored as JSON, see src/stories/*.json)
// ---------------------------------------------------------------------------

/** Changes a choice applies once it has been paid for. */
export type EffectSpec = {
  /** Stars granted to the player who made the choice. */
  stars?: number;
  /** Stars granted to every player in the room. */
  starsAll?: number;
  /** Id of a mishap to attach to the group for the rest of the run. */
  addMishap?: string;
  /** Id of a mishap to clear. Lets a later scene undo an earlier setback. */
  removeMishap?: string;
  /** Clue(s) the group learns. Already-known clues are ignored. */
  addClue?: string | string[];
  /** Clue(s) the group loses — a retraction, or evidence destroyed. */
  removeClue?: string | string[];
  /** Run variables to set, such as who the room decided to accuse. */
  set?: Record<string, string>;
};

export type Choice = {
  label: string;
  /**
   * Stars the spotlight player spends to pick this. Omitted or 0 means free.
   * Only crisis scenes may carry a cost (enforced in validate.ts).
   */
  cost?: number;
  /**
   * What the run must look like for this choice to exist.
   *
   * Unmet requirements HIDE the choice rather than locking it. You cannot
   * confront someone with evidence you have not found, and showing the option
   * greyed out would tell players the evidence exists. This is deliberately the
   * opposite of a Star gate, which is shown locked with its price: money you can
   * see you lack, but a thought you have not had you cannot.
   */
  requires?: Condition;
  /**
   * Overrides the hiding above: the choice is shown locked with this text as the
   * reason. For the rare gate a story wants players to know they are missing.
   */
  lockedHint?: string;
  /**
   * A skill test that must be passed for this choice to succeed.
   *
   * A choice may carry a cost or a minigame, never both: paying Stars and then
   * failing a puzzle is two punishments for one decision, and validation refuses
   * it. Minigames are also spotlight-only, since there is no sensible way for
   * six people to play one puzzle at once.
   */
  minigame?: MinigameSpec;
  effects?: EffectSpec;
  /** Short beat shown after the choice lands, before the next scene. */
  result?: string;
  /** Next scene id. Omitted or null ends the story and resolves an ending. */
  next?: string | null;
  /** Applied instead of `effects` when the minigame is failed. Default: nothing. */
  failEffects?: EffectSpec;
  /** Where a failed attempt leads. Defaults to `next`, so failing is never a dead end. */
  failNext?: string | null;
  /** Result text for a failed attempt. Defaults to `result`. */
  failResult?: string;
};

/**
 * A skill test the spotlight player has to pass, standing in for something the
 * character is doing: picking a lock, holding a hand steady, remembering a code,
 * scanning a page for the one line that matters.
 *
 * The minigame runs in the browser, but its OUTCOME is an engine action, because
 * once rooms exist the server has to apply the effects. That does mean a client
 * could lie about passing. For a game among friends that is an acceptable trade,
 * and it is the same trade the design doc already makes for turn timers.
 */
export type MinigameType = "timing" | "memory" | "search" | "order";

export type MinigameSpec = {
  type: MinigameType;
  /** 1 (easy) to 5 (hard). Mishaps can push this higher at runtime. */
  difficulty?: number;
  /** Flavour shown above the puzzle, so it reads as part of the story. */
  prompt?: string;
};

export type SceneType = "normal" | "crisis";
export type SceneMode = "spotlight" | "group";

export type Scene = {
  /** "crisis" marks the high-stakes scenes that may gate choices. */
  type?: SceneType;
  /** "spotlight" = one player decides. "group" = everyone votes. */
  mode?: SceneMode;
  /** Art key, unused in stage 1. */
  background?: string;
  text: string;
  choices: Choice[];
};

/** A lasting setback the group collects by failing a crisis. */
export type Mishap = {
  id: string;
  title: string;
  description?: string;
  /**
   * Added to every *paid* choice in later crisis scenes. This is the doc's
   * "the goose now hates you: the next crisis costs 1 more Star". Free choices
   * stay free, otherwise a mishap could lock a group out of the story entirely.
   */
  crisisCostDelta?: number;
  /** Added to the difficulty of every later minigame. The same idea as above. */
  minigameDifficultyDelta?: number;
};

/** Something the group has learned. Shown to players as their notebook. */
export type Clue = {
  id: string;
  title: string;
  description?: string;
};

/**
 * A run variable a story can set and later read, such as who was accused.
 * Declaring the allowed values means a typo in `set` or `is` fails validation
 * instead of silently never matching an ending.
 */
export type VarSpec = {
  title?: string;
  values: string[];
};

export type Ending = {
  id: string;
  title: string;
  text?: string;
  /** Omitted means "always matches" — use it for the final fallback ending. */
  requires?: Condition;
};

export type Story = {
  id: string;
  title: string;
  hook?: string;
  players: { min: number; max: number };
  startingStars: number;
  /** Scene id the story opens on. */
  start: string;
  scenes: Record<string, Scene>;
  mishaps?: Record<string, Mishap>;
  clues?: Record<string, Clue>;
  vars?: Record<string, VarSpec>;
  /** Evaluated top to bottom; the first match wins, so order matters. */
  endings: Ending[];
};

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export type PlayerState = {
  id: string;
  name: string;
  stars: number;
};

/** One resolved scene, kept for the recap screen and for awards. */
export type LogEntry = {
  sceneId: string;
  /** Who decided. For group scenes this is the whole room. */
  deciderIds: string[];
  choiceIndex: number;
  label: string;
  starsSpent: number;
  mishapAdded: string | null;
  cluesFound: string[];
  /** Present when the choice was a skill test, with whether it was passed. */
  minigame: { type: MinigameType; passed: boolean } | null;
};

/** A star transfer from one player to another, within the current scene. */
export type Gift = {
  fromId: string;
  toId: string;
  amount: number;
};

/**
 * What just happened, shown during the "result" phase. Held in state rather
 * than derived so that every client renders the identical beat, including
 * players who join mid-result once rooms exist.
 */
export type PendingResult = {
  sceneId: string;
  choiceIndex: number;
  label: string;
  /** Result text with placeholders already substituted. */
  text: string;
  /** Net star change per player for this scene: cost paid plus effects earned. */
  deltas: Record<string, number>;
  /** Gifts made during the scene, kept so the result beat can credit them. */
  gifts: Gift[];
  mishapAdded: string | null;
  /** Clues newly learned, so the result beat can call them out. */
  cluesFound: string[];
  /** Present when the choice was a skill test, with whether it was passed. */
  minigame: { type: MinigameType; passed: boolean } | null;
  next: string | null;
};

export type Phase = "scene" | "minigame" | "result" | "ended";

export type GameState = {
  storyId: string;
  phase: Phase;
  sceneId: string;
  players: PlayerState[];
  /** Index into players[]. The spotlight rotates after every scene. */
  spotlightIndex: number;
  /** Ids of active mishaps, in the order they were collected. */
  mishaps: string[];
  /** Ids of clues found, in the order they were found. The group's notebook. */
  clues: string[];
  /** Single-valued run state, such as `accused`. */
  vars: Record<string, string>;
  /** Group scenes only: playerId -> choiceIndex. Cleared between scenes. */
  votes: Record<string, number>;
  /** Gifts made during the current scene. Cleared between scenes. */
  gifts: Gift[];
  /**
   * Set while phase is "minigame": which choice is being attempted, by whom,
   * and the spec with mishap surcharges already folded in, so every client
   * renders the same puzzle at the same difficulty.
   */
  minigame: {
    choiceIndex: number;
    playerId: string;
    spec: MinigameSpec & { difficulty: number };
  } | null;
  pending: PendingResult | null;
  endingId: string | null;
  log: LogEntry[];
  /** Seeded so that {randomPlayer} resolves identically on every client. */
  seed: number;
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action =
  /** Spotlight scenes: the spotlight player commits to a choice. */
  | { type: "choose"; playerId: string; choiceIndex: number }
  /** Group scenes: one player casts or changes their vote. */
  | { type: "vote"; playerId: string; choiceIndex: number }
  /** Any scene: hand Stars to another player so they can afford a gate. */
  | { type: "give"; fromId: string; toId: string; amount: number }
  /** Report the outcome of a skill test. Only the player attempting it may send this. */
  | { type: "minigameResult"; playerId: string; passed: boolean }
  /** Dismiss the result beat and move to the next scene. */
  | { type: "continue"; playerId: string };

/**
 * Every mutation returns either a new state or a reason it was rejected.
 * Rejections carry a code so the UI can phrase them and the server can log
 * them without string matching.
 */
export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; code: RejectionCode; message: string };

export type RejectionCode =
  | "wrong_phase"
  | "not_spotlight"
  | "unknown_player"
  | "unknown_choice"
  | "unavailable_choice"
  | "not_your_minigame"
  | "cannot_afford"
  | "invalid_gift"
  | "already_ended";
