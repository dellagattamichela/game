/**
 * Where rooms live, and the only place invite codes are handed out.
 *
 * This is the impure half of the rooms layer: it owns the clock, the random
 * bytes, and the map that makes a code *unique* rather than merely random.
 * Everything it decides, it decides by calling the pure functions next door.
 *
 * ## This is a placeholder, and deliberately a small one
 *
 * Rooms are held in a `Map` in the server process. That means they vanish on
 * restart and are invisible to a second instance, so this works for `next dev`
 * and a single long-lived server, and not on serverless. Section 10 of the
 * design doc picks the real answer (Supabase, PartyKit, and friends); the point
 * of `RoomStore` being an interface with one in-memory implementation is that
 * swapping it costs one file, and that `createRoomStore` can be handed a fake
 * clock and fake bytes in tests.
 */
import { applyAction } from "@/engine/engine";
import { newSeed } from "@/engine/rng";
import type { Action } from "@/engine/types";
import { getStory } from "@/stories";
import { CODE_LENGTH, MAX_CODE_LENGTH, generateCode, normalizeCode } from "./code";
import { createRoom, joinRoom, pickStory, setReady, startGame } from "./room";
import {
  DEFAULT_MAX_PLAYERS,
  type Room,
  type RoomActionResult,
  type RoomResult,
} from "./types";

/** A room nobody has touched for this long is gone. Long enough to outlive a session. */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Draws per length before we widen the code by a character.
 *
 * Collisions are a birthday problem, not a coin flip: with 234,256 four-symbol
 * codes, eight consecutive misses means the space is genuinely crowded, and
 * widening is a better answer than drawing forever or failing.
 */
const DRAWS_PER_LENGTH = 8;

export type OpenRoomInput = {
  /** The creator's saved player id. Comes from their cookie, not from the form. */
  hostId: string;
  hostName: string;
  maxPlayers?: number;
};

export type JoinRoomStoreInput = {
  /** The joiner's saved player id. Comes from their cookie, not from the form. */
  playerId: string;
  name: string;
};

export type RoomStore = {
  /** Create a room around its host and mint the invite code that points at it. */
  open(input: OpenRoomInput): RoomResult;
  /** Seat a player in the room a code points at, or give them their seat back. */
  join(code: string, input: JoinRoomStoreInput): RoomResult;
  /** A player marks themselves ready, or takes it back. */
  ready(code: string, playerId: string, ready: boolean): RoomResult;
  /** The host chooses the story. Refuses an id the registry does not know. */
  chooseStory(code: string, playerId: string, storyId: string): RoomResult;
  /** The host starts: the room hands itself to the engine. */
  start(code: string, playerId: string): RoomResult;
  /**
   * Play one engine action against the room's run. The caller is trusted to
   * have put the right `playerId` on the action — see `playAction`, which
   * builds it from the cookie so a client cannot act as someone else.
   */
  act(code: string, action: Action): RoomActionResult;
  /** Look a room up by whatever the player typed. Expired rooms read as missing. */
  find(code: string): Room | undefined;
  /** Write a changed room back. Stamps `updatedAt`, which is what keeps it alive. */
  save(room: Room): Room;
  /** Drop a room early — the host closing the lobby. */
  close(code: string): boolean;
  /** Remove expired rooms. Called before every lookup; exposed for tests. */
  sweep(): number;
  /** Live rooms, newest first. For a future admin view, and for tests. */
  all(): Room[];
};

export type RoomStoreOptions = {
  now?: () => number;
  /** Injectable so a test can force a collision. */
  generate?: (length: number) => string;
  /** The run seed handed to `createGame`. Injectable so a test can pin a run. */
  seed?: () => number;
  ttlMs?: number;
};

export function createRoomStore(options: RoomStoreOptions = {}): RoomStore {
  const now = options.now ?? Date.now;
  const generate = options.generate ?? ((length: number) => generateCode(length));
  const seed = options.seed ?? newSeed;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  const rooms = new Map<string, Room>();

  function sweep(): number {
    const cutoff = now() - ttlMs;
    let removed = 0;
    for (const [code, room] of rooms) {
      if (room.updatedAt <= cutoff) {
        rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }

  /**
   * A code no live room is using, widening by a character if the short ones
   * keep colliding. Returns null only when even `MAX_CODE_LENGTH` is crowded,
   * which for an in-memory store means something has gone very wrong.
   */
  function allocateCode(): string | null {
    for (let length = CODE_LENGTH; length <= MAX_CODE_LENGTH; length++) {
      for (let draw = 0; draw < DRAWS_PER_LENGTH; draw++) {
        const code = generate(length);
        if (!rooms.has(code)) return code;
      }
    }
    return null;
  }

  function find(code: string): Room | undefined {
    sweep();
    return rooms.get(normalizeCode(code));
  }

  /**
   * A mistyped code and an expired room are the same answer on purpose: there
   * is nothing useful to tell apart, and "that code was real once" is not
   * information a stranger needs.
   */
  function notFound(): RoomResult {
    return { ok: false, code: "room_not_found", message: "No room answers to that code." };
  }

  /** Store the result of a pure mutation, or pass its rejection straight back. */
  function commit(result: RoomResult): RoomResult {
    if (result.ok) rooms.set(result.room.code, result.room);
    return result;
  }

  return {
    open({ hostId, hostName, maxPlayers = DEFAULT_MAX_PLAYERS }) {
      // Expired rooms still hold their codes hostage until they are swept, so
      // sweeping first both frees codes and keeps the map from growing forever.
      sweep();

      const code = allocateCode();
      if (code === null) {
        return {
          ok: false,
          code: "code_unavailable",
          message: "Could not find a free invite code. Try again in a moment.",
        };
      }

      const result = createRoom({
        code,
        host: { id: hostId, name: hostName },
        maxPlayers,
        now: now(),
      });
      // A rejected room must not consume the code it was going to use.
      if (!result.ok) return result;

      rooms.set(code, result.room);
      return result;
    },

    join(code, { playerId, name }) {
      const room = find(code);
      if (!room) return notFound();

      return commit(joinRoom({ room, player: { id: playerId, name }, now: now() }));
    },

    ready(code, playerId, ready) {
      const room = find(code);
      if (!room) return notFound();
      return commit(setReady(room, playerId, ready, now()));
    },

    chooseStory(code, playerId, storyId) {
      const room = find(code);
      if (!room) return notFound();

      const story = getStory(storyId);
      if (!story) {
        return { ok: false, code: "unknown_story", message: `No story called "${storyId}".` };
      }

      return commit(pickStory(room, playerId, story, now()));
    },

    start(code, playerId) {
      const room = find(code);
      if (!room) return notFound();

      // A null storyId resolves to undefined, which startGame refuses with the
      // same message the lobby has been showing under the disabled button.
      const story = room.storyId ? getStory(room.storyId) : undefined;

      return commit(startGame({ room, playerId, story, seed: seed(), now: now() }));
    },

    act(code, action) {
      const room = find(code);
      if (!room) return notFound();

      if (room.status !== "playing" || !room.game) {
        return {
          ok: false,
          code: "not_playing",
          message:
            room.status === "lobby"
              ? "This game has not started yet."
              : "This game is over.",
        };
      }

      const story = room.storyId ? getStory(room.storyId) : undefined;
      if (!story) {
        return { ok: false, code: "unknown_story", message: `No story called "${room.storyId}".` };
      }

      const result = applyAction(story, room.game, action);
      if (!result.ok) return result;

      // The engine decides the story is over; the room decides it is over too,
      // so a finished run stops accepting lobby actions as well as scene ones.
      const played: Room = {
        ...room,
        game: result.state,
        status: result.state.phase === "ended" ? "ended" : room.status,
        updatedAt: now(),
      };
      rooms.set(played.code, played);
      return { ok: true, room: played };
    },

    find,

    save(room) {
      const saved = { ...room, updatedAt: now() };
      rooms.set(saved.code, saved);
      return saved;
    },

    close(code) {
      return rooms.delete(normalizeCode(code));
    },

    sweep,

    all() {
      sweep();
      return [...rooms.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
  };
}

/**
 * The process-wide store.
 *
 * Hung off `globalThis` because `next dev` re-evaluates modules on every edit,
 * and a module-level `Map` would take everyone's room with it each time a file
 * is saved.
 */
const globalStore = globalThis as typeof globalThis & { __pilotSeasonRooms?: RoomStore };

export const rooms: RoomStore = (globalStore.__pilotSeasonRooms ??= createRoomStore());
