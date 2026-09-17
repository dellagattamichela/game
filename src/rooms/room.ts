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

/**
 * Whether a name is already spoken for, ignoring case and ignoring one seat.
 *
 * `exceptId` is how a rejoining player keeps their own name: without it,
 * everyone would collide with themselves the moment they reconnected.
 */
function nameTaken(room: Room, name: string, exceptId?: string): boolean {
  const wanted = name.toLowerCase();
  return room.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === wanted);
}

export type JoinRoomInput = {
  room: Room;
  player: { id: string; name: string };
  now: number;
};

/**
 * Put a player in the room, or put them back in the seat they already had.
 *
 * The two cases are one function on purpose: from a player's side, "join" and
 * "my wifi dropped and I came back" are the same action, and the client cannot
 * reliably tell them apart — it just sends the id its browser has been carrying
 * since the first time it saw the game. Which one it turns out to be is decided
 * here, by whether that id is already sitting at the table.
 *
 * So the membership check comes first, before the room is checked for space or
 * for whether the story has started. A full room that has begun playing must
 * still let its own players back in, and checking capacity first would lock
 * them out of their own game.
 */
export function joinRoom({ room, player, now }: JoinRoomInput): RoomResult {
  const name = normalizeName(player.name);
  if (name.length === 0) {
    return { ok: false, code: "invalid_name", message: "Pick a name so the room knows who you are." };
  }

  const seat = room.players.find((p) => p.id === player.id);

  if (seat) {
    // Coming back. The name is refreshed because a player may have changed it
    // on the way in, which means it can collide like any other name.
    if (nameTaken(room, name, player.id)) {
      return { ok: false, code: "name_taken", message: `Someone here is already called ${name}.` };
    }
    return {
      ok: true,
      room: {
        ...room,
        players: room.players.map((p) =>
          p.id === player.id ? { ...p, name, connected: true } : p,
        ),
        updatedAt: now,
      },
    };
  }

  if (room.status !== "lobby") {
    return {
      ok: false,
      code: "already_started",
      message:
        room.status === "ended"
          ? "This game has already finished."
          : "This game has already started.",
    };
  }

  if (room.players.length >= room.maxPlayers) {
    return {
      ok: false,
      code: "room_full",
      message: `This room is full, ${room.players.length} of ${room.maxPlayers} players.`,
    };
  }

  if (nameTaken(room, name)) {
    return { ok: false, code: "name_taken", message: `Someone here is already called ${name}.` };
  }

  const joined: RoomPlayer = {
    id: player.id,
    name,
    isHost: false,
    // Unlike the host, a joiner has a character to build and a story to read
    // about first, so they start not ready and say so themselves.
    ready: false,
    connected: true,
    joinedAt: now,
  };

  return {
    ok: true,
    room: { ...room, players: [...room.players, joined], updatedAt: now },
  };
}

/** True if this player already holds a seat — the lobby renders on this. */
export function isMember(room: Room, playerId: string | null): boolean {
  return playerId !== null && room.players.some((p) => p.id === playerId);
}
