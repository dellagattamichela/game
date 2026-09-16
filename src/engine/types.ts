/**
 * Core types for the Pilot Season story engine.
 *
 * Everything here is plain data. The engine is a pure reducer over these types,
 * which means the same code can run in a single browser (stage 1) or inside a
 * server route handler once rooms exist (stage 4). Nothing in this file may
 * import React, Next, or touch the network.
 */

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
};

export type Choice = {
  label: string;
  /**
   * Stars the spotlight player spends to pick this. Omitted or 0 means free.
   * Only crisis scenes may carry a cost (enforced in validate.ts).
   */
  cost?: number;
  effects?: EffectSpec;
  /** Short beat shown after the choice lands, before the next scene. */
  result?: string;
  /** Next scene id. Omitted or null ends the story and resolves an ending. */
  next?: string | null;
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
};

export type EndingRequirement = {
  minMishaps?: number;
  maxMishaps?: number;
  /** Requires this specific mishap to be active. */
  hasMishap?: string;
  /** Requires this specific mishap to be absent. */
  lacksMishap?: string;
  /** Total unspent Stars across the whole room. */
  minTotalStars?: number;
};

export type Ending = {
  id: string;
  title: string;
  text?: string;
  /** Omitted means "always matches" — use it for the final fallback ending. */
  requires?: EndingRequirement;
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
  next: string | null;
};

export type Phase = "scene" | "result" | "ended";

export type GameState = {
  storyId: string;
  phase: Phase;
  sceneId: string;
  players: PlayerState[];
  /** Index into players[]. The spotlight rotates after every scene. */
  spotlightIndex: number;
  /** Ids of active mishaps, in the order they were collected. */
  mishaps: string[];
  /** Group scenes only: playerId -> choiceIndex. Cleared between scenes. */
  votes: Record<string, number>;
  /** Gifts made during the current scene. Cleared between scenes. */
  gifts: Gift[];
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
  | "cannot_afford"
  | "invalid_gift"
  | "already_ended";
