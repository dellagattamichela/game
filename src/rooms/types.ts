/**
 * Room types: stage 3 of the build plan.
 *
 * A room is the container a group joins before a story starts, and the thing an
 * invite code points at. It is plain data for the same reason the engine's
 * state is: whatever ends up holding it — an in-process Map today, a real
 * backend at stage 4 — has to be able to serialise it and hand it to every
 * client unchanged.
 *
 * The shape follows section 10 of the design doc, minus the fields whose
 * feature does not exist yet: `character` arrives with the creator (stage 2),
 * and `game` stays null until multiplayer turns (stage 4).
 */
import type { Character } from "@/characters/types";
import type { GameState, RejectionCode } from "@/engine/types";

/** 2 is the smallest group a story is written for; 6 is where waiting starts to hurt. */
export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 6;
export const DEFAULT_MAX_PLAYERS = 4;

/** Long enough for a nickname, short enough to fit under a 64px portrait. */
export const MAX_NAME_LENGTH = 16;

/** Turn timer settings the host can pick, in seconds. 0 is off. */
export const TURN_TIMERS = [0, 60, 90] as const;
export type TurnTimer = (typeof TURN_TIMERS)[number];

/** Off by default: a timer is a thing a host turns on, not a thing sprung on a room. */
export const DEFAULT_TURN_TIMER: TurnTimer = 0;

/**
 * A player who has not been heard from for this long is shown as away.
 *
 * Comfortably longer than the poll interval, so one slow request does not grey
 * somebody out mid-scene.
 */
export const PRESENCE_TIMEOUT_MS = 12_000;

export type RoomStatus = "lobby" | "playing" | "ended";

export type RoomPlayer = {
  /**
   * Stable across reconnects. The design doc's rejoin rule depends on this
   * being a saved id rather than a connection id, so a dropped player comes
   * back to their own seat instead of a new one.
   */
  id: string;
  name: string;
  /**
   * Never null: everyone gets a face the moment they sit down, derived from
   * their player id, and the creator personalises it. A lobby of blank
   * silhouettes waiting to be filled in is a worse first impression than a
   * lobby of strangers.
   */
  character: Character;
  /** Host powers: picking the story, starting, removing players. */
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  /** Epoch ms of this player's last poll. Drives `connected` and host handover. */
  lastSeen: number;
};

export type Room = {
  /** The invite code. Uppercase, from `CODE_ALPHABET`, unique while the room lives. */
  code: string;
  hostId: string;
  maxPlayers: number;
  status: RoomStatus;
  /** Null until the host picks one in the lobby. */
  storyId: string | null;
  players: RoomPlayer[];
  /** Epoch ms. Set at the impure boundary — nothing in this layer calls Date.now(). */
  createdAt: number;
  /** Bumped on every change; the store expires rooms on it, not on createdAt. */
  updatedAt: number;
  /** Filled by `createGame` when the host starts. Stage 4. */
  game: GameState | null;
  /** Seconds a decision may take before the safe option is picked. 0 is off. */
  turnTimer: TurnTimer;
  /**
   * Epoch ms the current decision runs out, or null when nothing is on the
   * clock. Held on the room rather than derived, so every client counts down
   * to the same instant instead of to its own idea of when the scene began.
   */
  turnEndsAt: number | null;
};

export type RoomRejectionCode =
  | "invalid_name"
  | "invalid_max_players"
  | "invalid_code"
  /** Every candidate code we drew was already taken. Effectively "we are full of rooms". */
  | "code_unavailable"
  /** No live room answers to that code — a typo, or a room that has expired. */
  | "room_not_found"
  | "room_full"
  /** The story is under way. Does not apply to someone reclaiming their own seat. */
  | "already_started"
  /**
   * Someone in the room already goes by that name. Rejected rather than
   * silently suffixed, because scene text resolves `{spotlight}` to a name and
   * two Sams make the story itself ambiguous.
   */
  | "name_taken"
  /** The player is not sitting in this room, so has nothing to change in it. */
  | "not_a_member"
  /** Picking the story and starting belong to the host alone. */
  | "not_host"
  | "unknown_story"
  /** Asked to start before a story was picked. */
  | "no_story"
  | "not_everyone_ready"
  /** The room holds more or fewer people than the chosen story is written for. */
  | "wrong_player_count"
  /** Asked to play a scene in a room that is still in the lobby, or already over. */
  | "not_playing"
  | "invalid_timer";

/**
 * Mirrors the engine's `ActionResult`: a typed rejection rather than a throw,
 * so a route handler can map it to a status and the UI can phrase it.
 */
export type RoomResult =
  | { ok: true; room: Room }
  | { ok: false; code: RoomRejectionCode; message: string };

/**
 * The result of playing a scene, which can be refused by either layer: by the
 * room ("no room answers to that code") or by the engine ("only the spotlight
 * player picks this scene").
 *
 * The engine's own code is passed through rather than flattened into one
 * `game_rejected`, because the difference between `cannot_afford` and
 * `not_spotlight` is exactly what a client wants to react to.
 */
export type RoomActionResult =
  | { ok: true; room: Room }
  | { ok: false; code: RoomRejectionCode | RejectionCode; message: string };
