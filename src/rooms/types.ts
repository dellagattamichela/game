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
import type { GameState } from "@/engine/types";

/** 2 is the smallest group a story is written for; 6 is where waiting starts to hurt. */
export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 6;
export const DEFAULT_MAX_PLAYERS = 4;

/** Long enough for a nickname, short enough to fit under a 64px portrait. */
export const MAX_NAME_LENGTH = 16;

export type RoomStatus = "lobby" | "playing" | "ended";

export type RoomPlayer = {
  /**
   * Stable across reconnects. The design doc's rejoin rule depends on this
   * being a saved id rather than a connection id, so a dropped player comes
   * back to their own seat instead of a new one.
   */
  id: string;
  name: string;
  /** Host powers: picking the story, starting, removing players. */
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
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
};

export type RoomRejectionCode =
  | "invalid_name"
  | "invalid_max_players"
  | "invalid_code"
  /** Every candidate code we drew was already taken. Effectively "we are full of rooms". */
  | "code_unavailable";

/**
 * Mirrors the engine's `ActionResult`: a typed rejection rather than a throw,
 * so a route handler can map it to a status and the UI can phrase it.
 */
export type RoomResult =
  | { ok: true; room: Room }
  | { ok: false; code: RoomRejectionCode; message: string };
