/**
 * Room construction and its rules, as pure functions.
 *
 * Same discipline as `src/engine/engine.ts`: no I/O, no `Date.now()`, no
 * `Math.random()`, no mutation of the input. The clock and the code generator
 * are arguments, which is what lets the tests assert on an exact room object
 * and what will let a server route handler call this inside a transaction.
 */
import { createGame } from "@/engine/engine";
import type { Story } from "@/engine/types";
import { isValidCode } from "./code";
import {
  MAX_NAME_LENGTH,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  type Room,
  type RoomPlayer,
  type RoomRejectionCode,
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

// ---------------------------------------------------------------------------
// The lobby: getting ready, picking a story, and starting
// ---------------------------------------------------------------------------

/** "Bo", "Bo and Cy", "Bo, Cy and Di" — for messages people read. */
function listNames(players: RoomPlayer[]): string {
  const names = players.map((p) => p.name);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Ready up, or take it back. Anyone may do this for themselves, host included. */
export function setReady(
  room: Room,
  playerId: string,
  ready: boolean,
  now: number,
): RoomResult {
  if (!isMember(room, playerId)) {
    return { ok: false, code: "not_a_member", message: "You are not in this room." };
  }
  if (room.status !== "lobby") {
    return { ok: false, code: "already_started", message: "This game has already started." };
  }

  return {
    ok: true,
    room: {
      ...room,
      players: room.players.map((p) => (p.id === playerId ? { ...p, ready } : p)),
      updatedAt: now,
    },
  };
}

/**
 * The host chooses what the room is going to play.
 *
 * Takes the resolved `Story` rather than an id so that this stays pure and the
 * caller owns the registry lookup — and so a story that does not exist is
 * refused one layer out, where the registry lives, instead of being stored and
 * blowing up at `Start`.
 *
 * Readiness is deliberately not reset when the host switches story. People ready
 * up to say "I am here and paying attention", not to approve a particular story,
 * and un-readying the room every time the host browses the list would make the
 * list unbrowsable.
 */
export function pickStory(room: Room, playerId: string, story: Story, now: number): RoomResult {
  if (room.hostId !== playerId) {
    return { ok: false, code: "not_host", message: "Only the host picks the story." };
  }
  if (room.status !== "lobby") {
    return { ok: false, code: "already_started", message: "This game has already started." };
  }

  return { ok: true, room: { ...room, storyId: story.id, updatedAt: now } };
}

/**
 * Why this room cannot start yet, ready to display, or null if it can.
 *
 * The lobby renders this and `startGame` enforces it, so the reason under a
 * greyed-out button is the same sentence the action would have rejected with.
 * The engine does the same thing with `sceneView`: one place computes the rule,
 * and the UI never gets to hold a second opinion.
 */
export function startBlocker(
  room: Room,
  story: Story | undefined,
): { code: RoomRejectionCode; message: string } | null {
  if (room.status !== "lobby") {
    return { code: "already_started", message: "This game has already started." };
  }
  if (!story) {
    return { code: "no_story", message: "Pick a story first." };
  }

  const waitingOn = room.players.filter((p) => !p.ready);
  if (waitingOn.length > 0) {
    return { code: "not_everyone_ready", message: `Waiting for ${listNames(waitingOn)}.` };
  }

  if (room.players.length < story.players.min) {
    return {
      code: "wrong_player_count",
      message: `${story.title} needs at least ${story.players.min} players.`,
    };
  }
  if (room.players.length > story.players.max) {
    return {
      code: "wrong_player_count",
      message: `${story.title} takes at most ${story.players.max} players.`,
    };
  }

  return null;
}

export type StartGameInput = {
  room: Room;
  playerId: string;
  /** The story `room.storyId` resolves to. Undefined when none was picked. */
  story: Story | undefined;
  /** From `newSeed()` at the impure edge: the engine may not roll its own. */
  seed: number;
  now: number;
};

/**
 * Hand the room over to the engine.
 *
 * This is the seam the whole build has been pointing at: everything before it
 * is people arriving, everything after it is `applyAction`. The room keeps the
 * seats and the identities; `room.game` holds the story state, built by the
 * engine's own `createGame` so a room's run is indistinguishable from one the
 * single-browser prototype would have produced.
 */
export function startGame({ room, playerId, story, seed, now }: StartGameInput): RoomResult {
  if (room.hostId !== playerId) {
    return { ok: false, code: "not_host", message: "Only the host can start the game." };
  }

  const blocker = startBlocker(room, story);
  if (blocker) return { ok: false, ...blocker };
  // startBlocker has already refused a missing story; this narrows the type.
  if (!story) throw new Error("unreachable: startBlocker allows no story-less start");

  return {
    ok: true,
    room: {
      ...room,
      status: "playing",
      storyId: story.id,
      game: createGame(
        story,
        room.players.map((p) => ({ id: p.id, name: p.name })),
        seed,
      ),
      updatedAt: now,
    },
  };
}
