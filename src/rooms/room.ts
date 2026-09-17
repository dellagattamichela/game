/**
 * Room construction and its rules, as pure functions.
 *
 * Same discipline as `src/engine/engine.ts`: no I/O, no `Date.now()`, no
 * `Math.random()`, no mutation of the input. The clock and the code generator
 * are arguments, which is what lets the tests assert on an exact room object
 * and what will let a server route handler call this inside a transaction.
 */
import { isValidCode } from "./code";
import {
  MAX_NAME_LENGTH,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  type Room,
  type RoomPlayer,
  type RoomResult,
} from "./types";

/**
 * Tidy a display name: trim the ends, collapse runs of whitespace, clip to the
 * length a portrait label can hold. Returns "" for a name that was only
 * whitespace, which the caller rejects.
 */
export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}

export type CreateRoomInput = {
  /** An already-allocated, already-unique code. The store owns uniqueness. */
  code: string;
  host: { id: string; name: string };
  /** Defaults are applied by the caller; this validates whatever it is handed. */
  maxPlayers: number;
  /** Epoch ms from the caller's clock. */
  now: number;
};

/**
 * Build a new room around its creator.
 *
 * The creator becomes player one and the host in the same step, because a room
 * with no host is a state the rest of the system would have to handle and
 * never usefully exists: the code is generated *for* someone.
 */
export function createRoom({ code, host, maxPlayers, now }: CreateRoomInput): RoomResult {
  if (!isValidCode(code)) {
    return { ok: false, code: "invalid_code", message: `"${code}" is not a valid invite code.` };
  }

  const name = normalizeName(host.name);
  if (name.length === 0) {
    return { ok: false, code: "invalid_name", message: "Pick a name so the room knows who you are." };
  }

  if (
    !Number.isInteger(maxPlayers) ||
    maxPlayers < MIN_ROOM_PLAYERS ||
    maxPlayers > MAX_ROOM_PLAYERS
  ) {
    return {
      ok: false,
      code: "invalid_max_players",
      message: `A room holds ${MIN_ROOM_PLAYERS} to ${MAX_ROOM_PLAYERS} players.`,
    };
  }

  const hostPlayer: RoomPlayer = {
    id: host.id,
    name,
    isHost: true,
    // The host is ready by definition: they are looking at the lobby already.
    ready: true,
    connected: true,
    joinedAt: now,
  };

  const room: Room = {
    code,
    hostId: host.id,
    maxPlayers,
    status: "lobby",
    storyId: null,
    players: [hostPlayer],
    createdAt: now,
    updatedAt: now,
    game: null,
  };

  return { ok: true, room };
}

/** True while the room can still take someone. Used by the store and the lobby. */
export function hasSeat(room: Room): boolean {
  return room.status === "lobby" && room.players.length < room.maxPlayers;
}
