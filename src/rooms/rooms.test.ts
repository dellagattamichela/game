import { describe, expect, it } from "vitest";
import { CODE_LENGTH } from "./code";
import {
  createRoom,
  hasSeat,
  isMember,
  joinRoom,
  normalizeName,
  pickStory,
  setReady,
  startBlocker,
  startGame,
} from "./room";
import { createRoomStore } from "./store";
import { DEFAULT_MAX_PLAYERS, MAX_NAME_LENGTH, type Room } from "./types";
import { requireStory } from "@/stories";
import type { Story } from "@/engine/types";

const HOST = { id: "host-1", name: "Michela" };

/** A clock the test moves by hand, so expiry is a fact rather than a wait. */
function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** Hands out codes in the order given, so collisions can be staged. */
function scriptedCodes(...codes: string[]) {
  let i = 0;
  return () => codes[Math.min(i++, codes.length - 1)];
}

describe("createRoom", () => {
  it("makes the creator player one and the host", () => {
    const result = createRoom({ code: "MNPQ", host: HOST, maxPlayers: 4, now: 1000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room).toEqual({
      code: "MNPQ",
      hostId: "host-1",
      maxPlayers: 4,
      status: "lobby",
      storyId: null,
      players: [
        {
          id: "host-1",
          name: "Michela",
          isHost: true,
          ready: true,
          connected: true,
          joinedAt: 1000,
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
      game: null,
    });
  });

  it("opens in the lobby with no story, because the host picks it there", () => {
    const result = createRoom({ code: "MNPQ", host: HOST, maxPlayers: 2, now: 1 });
    expect(result.ok && result.room.status).toBe("lobby");
    expect(result.ok && result.room.storyId).toBeNull();
  });

  it("tidies the name instead of refusing it", () => {
    const result = createRoom({
      code: "MNPQ",
      host: { id: "h", name: "  Mi   chela  " },
      maxPlayers: 4,
      now: 1,
    });
    expect(result.ok && result.room.players[0].name).toBe("Mi chela");
  });

  it("refuses a blank name", () => {
    const result = createRoom({ code: "MNPQ", host: { id: "h", name: "   " }, maxPlayers: 4, now: 1 });
    expect(result).toMatchObject({ ok: false, code: "invalid_name" });
  });

  it("refuses a player count the stories are not written for", () => {
    for (const maxPlayers of [1, 7, 4.5, Number.NaN]) {
      expect(createRoom({ code: "MNPQ", host: HOST, maxPlayers, now: 1 })).toMatchObject({
        ok: false,
        code: "invalid_max_players",
      });
    }
  });

  it("refuses a code it did not mint", () => {
    expect(createRoom({ code: "mnpq", host: HOST, maxPlayers: 4, now: 1 })).toMatchObject({
      ok: false,
      code: "invalid_code",
    });
  });
});

describe("normalizeName", () => {
  it("clips a name to what a portrait label can hold", () => {
    expect(normalizeName("x".repeat(40))).toHaveLength(MAX_NAME_LENGTH);
  });
});

describe("hasSeat", () => {
  it("is false once the room is full or the story has started", () => {
    const result = createRoom({ code: "MNPQ", host: HOST, maxPlayers: 2, now: 1 });
    if (!result.ok) throw new Error("fixture failed");
    const room = result.room;

    expect(hasSeat(room)).toBe(true);
    expect(hasSeat({ ...room, players: [...room.players, { ...room.players[0], id: "b" }] })).toBe(
      false,
    );
    expect(hasSeat({ ...room, status: "playing" })).toBe(false);
  });
});

describe("joinRoom", () => {
  /** A room with the host already in it, which is the only kind that exists. */
  function lobby(maxPlayers = 4) {
    const result = createRoom({ code: "MNPQ", host: HOST, maxPlayers, now: 1000 });
    if (!result.ok) throw new Error("fixture failed");
    return result.room;
  }

  it("seats a newcomer behind the host", () => {
    const result = joinRoom({ room: lobby(), player: { id: "p2", name: "Bo" }, now: 2000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room.players).toHaveLength(2);
    expect(result.room.players[1]).toEqual({
      id: "p2",
      name: "Bo",
      isHost: false,
      ready: false,
      connected: true,
      joinedAt: 2000,
    });
  });

  it("leaves the room it was given alone", () => {
    const room = lobby();
    joinRoom({ room, player: { id: "p2", name: "Bo" }, now: 2000 });
    expect(room.players).toHaveLength(1);
  });

  it("gives a returning player their own seat back rather than a second one", () => {
    const room = lobby();
    const joined = joinRoom({ room, player: { id: "p2", name: "Bo" }, now: 2000 });
    if (!joined.ok) throw new Error("fixture failed");
    const dropped = {
      ...joined.room,
      players: joined.room.players.map((p) => (p.id === "p2" ? { ...p, connected: false } : p)),
    };

    const back = joinRoom({ room: dropped, player: { id: "p2", name: "Bo" }, now: 3000 });

    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.room.players).toHaveLength(2);
    expect(back.room.players[1]).toMatchObject({ id: "p2", connected: true, joinedAt: 2000 });
  });

  it("lets a player back into a game that has already started", () => {
    const room = lobby();
    const joined = joinRoom({ room, player: { id: "p2", name: "Bo" }, now: 2000 });
    if (!joined.ok) throw new Error("fixture failed");

    const playing = { ...joined.room, status: "playing" as const };
    expect(joinRoom({ room: playing, player: { id: "p2", name: "Bo" }, now: 3000 })).toMatchObject({
      ok: true,
    });
  });

  it("lets a player back into a room that is full, because they are part of why", () => {
    const room = lobby(2);
    const joined = joinRoom({ room, player: { id: "p2", name: "Bo" }, now: 2000 });
    if (!joined.ok) throw new Error("fixture failed");

    expect(
      joinRoom({ room: joined.room, player: { id: "p2", name: "Bo" }, now: 3000 }),
    ).toMatchObject({ ok: true });
  });

  it("keeps the host's powers across a reconnect", () => {
    const room = lobby();
    const back = joinRoom({ room, player: { id: HOST.id, name: HOST.name }, now: 2000 });
    expect(back.ok && back.room.players[0].isHost).toBe(true);
    expect(back.ok && back.room.hostId).toBe(HOST.id);
  });

  it("takes a new name from a returning player", () => {
    const room = lobby();
    const back = joinRoom({ room, player: { id: HOST.id, name: "Michi" }, now: 2000 });
    expect(back.ok && back.room.players[0].name).toBe("Michi");
  });

  it("turns away a stranger once the room is full", () => {
    const room = lobby(2);
    const joined = joinRoom({ room, player: { id: "p2", name: "Bo" }, now: 2000 });
    if (!joined.ok) throw new Error("fixture failed");

    expect(joinRoom({ room: joined.room, player: { id: "p3", name: "Cy" }, now: 3000 })).toMatchObject(
      { ok: false, code: "room_full", message: "This room is full, 2 of 2 players." },
    );
  });

  it("turns away a stranger once the story has started, and says which it is", () => {
    const room = lobby();
    const player = { id: "p2", name: "Bo" };

    expect(
      joinRoom({ room: { ...room, status: "playing" }, player, now: 2000 }),
    ).toMatchObject({ ok: false, code: "already_started", message: /already started/ });
    expect(joinRoom({ room: { ...room, status: "ended" }, player, now: 2000 })).toMatchObject({
      ok: false,
      code: "already_started",
      message: /already finished/,
    });
  });

  it("refuses a name the room is already using, whatever the case", () => {
    const room = lobby();
    expect(joinRoom({ room, player: { id: "p2", name: "michela" }, now: 2000 })).toMatchObject({
      ok: false,
      code: "name_taken",
    });
  });

  it("refuses a blank name", () => {
    expect(joinRoom({ room: lobby(), player: { id: "p2", name: " " }, now: 2000 })).toMatchObject({
      ok: false,
      code: "invalid_name",
    });
  });
});

describe("isMember", () => {
  it("is false for a player with no cookie", () => {
    const result = createRoom({ code: "MNPQ", host: HOST, maxPlayers: 4, now: 1 });
    if (!result.ok) throw new Error("fixture failed");
    expect(isMember(result.room, HOST.id)).toBe(true);
    expect(isMember(result.room, "someone-else")).toBe(false);
    expect(isMember(result.room, null)).toBe(false);
  });
});


// ---------------------------------------------------------------------------
// The lobby: ready, story, start
// ---------------------------------------------------------------------------

/** Small enough to reason about, and independent of what the real stories say. */
const STORY: Story = {
  id: "test",
  title: "Test Story",
  players: { min: 2, max: 3 },
  startingStars: 3,
  start: "s1",
  scenes: { s1: { text: "{spotlight} begins.", choices: [{ label: "Go" }] } },
  endings: [{ id: "over", title: "Over" }],
};

/** A room with `count` players, all seated and all ready unless told otherwise. */
function seated(count: number, ready = true): Room {
  const created = createRoom({ code: "MNPQ", host: HOST, maxPlayers: 6, now: 1000 });
  if (!created.ok) throw new Error("fixture failed");

  let room = created.room;
  for (let i = 2; i <= count; i++) {
    const joined = joinRoom({ room, player: { id: `p${i}`, name: `P${i}` }, now: 1000 + i });
    if (!joined.ok) throw new Error("fixture failed");
    room = joined.room;
  }

  return { ...room, players: room.players.map((p) => ({ ...p, ready })) };
}

describe("setReady", () => {
  it("flips one player's flag and leaves the rest alone", () => {
    const room = seated(3, false);
    const result = setReady(room, "p2", true, 5000);

    expect(result.ok && result.room.players.map((p) => p.ready)).toEqual([false, true, false]);
    expect(result.ok && result.room.updatedAt).toBe(5000);
    // The input room is untouched.
    expect(room.players[1].ready).toBe(false);
  });

  it("lets the host un-ready themselves, which blocks their own Start", () => {
    const room = seated(2);
    const result = setReady(room, HOST.id, false, 5000);

    expect(result.ok && result.room.players[0].ready).toBe(false);
    expect(result.ok && startBlocker(result.room, STORY)).toMatchObject({
      code: "not_everyone_ready",
    });
  });

  it("refuses someone who is not in the room", () => {
    expect(setReady(seated(2), "stranger", true, 5000)).toMatchObject({
      ok: false,
      code: "not_a_member",
    });
  });

  it("refuses once the story is under way", () => {
    const room = { ...seated(2), status: "playing" as const };
    expect(setReady(room, "p2", false, 5000)).toMatchObject({
      ok: false,
      code: "already_started",
    });
  });
});

describe("pickStory", () => {
  it("records the host's choice", () => {
    const result = pickStory(seated(2), HOST.id, STORY, 5000);
    expect(result.ok && result.room.storyId).toBe("test");
  });

  it("leaves readiness alone, so the host can browse the list", () => {
    const result = pickStory(seated(3), HOST.id, STORY, 5000);
    expect(result.ok && result.room.players.every((p) => p.ready)).toBe(true);
  });

  it("refuses anyone but the host", () => {
    expect(pickStory(seated(2), "p2", STORY, 5000)).toMatchObject({
      ok: false,
      code: "not_host",
    });
  });
});

describe("startBlocker", () => {
  it("is null when the room is ready to go", () => {
    expect(startBlocker({ ...seated(2), storyId: "test" }, STORY)).toBeNull();
  });

  it("asks for a story first", () => {
    expect(startBlocker(seated(2), undefined)).toMatchObject({ code: "no_story" });
  });

  it("names who the room is waiting for", () => {
    const room = seated(3);
    const unready = (...ids: string[]) => ({
      ...room,
      players: room.players.map((p) => (ids.includes(p.id) ? { ...p, ready: false } : p)),
    });

    expect(startBlocker(unready("p2"), STORY)?.message).toBe("Waiting for P2.");
    expect(startBlocker(unready("p2", "p3"), STORY)?.message).toBe("Waiting for P2 and P3.");
    expect(startBlocker(unready(HOST.id, "p2", "p3"), STORY)?.message).toBe(
      "Waiting for Michela, P2 and P3.",
    );
  });

  it("refuses a room the story is not written for", () => {
    expect(startBlocker(seated(1), STORY)).toMatchObject({
      code: "wrong_player_count",
      message: "Test Story needs at least 2 players.",
    });
    expect(startBlocker(seated(4), STORY)).toMatchObject({
      code: "wrong_player_count",
      message: "Test Story takes at most 3 players.",
    });
  });

  it("says the game is already under way once it is", () => {
    expect(startBlocker({ ...seated(2), status: "playing" }, STORY)).toMatchObject({
      code: "already_started",
    });
  });
});

describe("startGame", () => {
  const ready = () => ({ ...seated(2), storyId: "test" });

  it("hands the room to the engine", () => {
    const room = ready();
    const result = startGame({ room, playerId: HOST.id, story: STORY, seed: 42, now: 5000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room.status).toBe("playing");
    expect(result.room.game).toMatchObject({
      storyId: "test",
      phase: "scene",
      sceneId: "s1",
      spotlightIndex: 0,
      seed: 42,
    });
    // Seats become players, in seat order, with the story's opening Stars.
    expect(result.room.game?.players).toEqual([
      { id: HOST.id, name: "Michela", stars: 3 },
      { id: "p2", name: "P2", stars: 3 },
    ]);
  });

  it("does not touch the room it was given", () => {
    const room = ready();
    startGame({ room, playerId: HOST.id, story: STORY, seed: 42, now: 5000 });
    expect(room.status).toBe("lobby");
    expect(room.game).toBeNull();
  });

  it("refuses anyone but the host", () => {
    expect(
      startGame({ room: ready(), playerId: "p2", story: STORY, seed: 42, now: 5000 }),
    ).toMatchObject({ ok: false, code: "not_host" });
  });

  it("refuses for the same reasons the lobby shows under the button", () => {
    const room = seated(2, false);
    const result = startGame({ room, playerId: HOST.id, story: STORY, seed: 42, now: 5000 });

    expect(result).toMatchObject({ ok: false, code: "not_everyone_ready" });
    expect(result.ok === false && result.message).toBe(startBlocker(room, STORY)?.message);
  });
});

describe("the store", () => {
  it("mints a code for a new room and finds the room by it", () => {
    const store = createRoomStore();
    const result = store.open({ hostId: "h", hostName: "Michela" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room.code).toHaveLength(CODE_LENGTH);
    expect(store.find(result.room.code)).toBe(result.room);
  });

  it("defaults to a four-player room", () => {
    const store = createRoomStore();
    const result = store.open({ hostId: "h", hostName: "Michela" });
    expect(result.ok && result.room.maxPlayers).toBe(DEFAULT_MAX_PLAYERS);
  });

  it("finds a room however the code was typed", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "h", hostName: "Michela" });

    for (const typed of ["MNPQ", "mnpq", " mn-pq ", "m n p q"]) {
      expect(store.find(typed)?.code).toBe("MNPQ");
    }
  });

  it("never hands the same code to two live rooms", () => {
    // The generator is stuck on one code until the third draw.
    const store = createRoomStore({ generate: scriptedCodes("MNPQ", "MNPQ", "RTVW") });

    const first = store.open({ hostId: "a", hostName: "A" });
    const second = store.open({ hostId: "b", hostName: "B" });

    expect(first.ok && first.room.code).toBe("MNPQ");
    expect(second.ok && second.room.code).toBe("RTVW");
  });

  it("widens the code when the short ones keep colliding", () => {
    // Every four-symbol draw returns the taken code, so allocation moves to five.
    const generate = (length: number) => (length === CODE_LENGTH ? "MNPQ" : "MNPQR");
    const store = createRoomStore({ generate });

    store.open({ hostId: "a", hostName: "A" });
    const second = store.open({ hostId: "b", hostName: "B" });

    expect(second.ok && second.room.code).toBe("MNPQR");
  });

  it("reports a rejection rather than throwing when every code is taken", () => {
    const store = createRoomStore({ generate: () => "MNPQ" });
    store.open({ hostId: "a", hostName: "A" });

    expect(store.open({ hostId: "b", hostName: "B" })).toMatchObject({
      ok: false,
      code: "code_unavailable",
    });
  });

  it("does not burn a code on a room it refuses to create", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });

    expect(store.open({ hostId: "h", hostName: "  " })).toMatchObject({ ok: false });
    // Nothing was stored, so MNPQ is still free for the next room that asks.
    expect(store.find("MNPQ")).toBeUndefined();
    expect(store.all()).toHaveLength(0);
    expect(store.open({ hostId: "h", hostName: "Michela" })).toMatchObject({
      ok: true,
      room: { code: "MNPQ" },
    });
  });

  it("forgets a room nobody has touched, and frees its code", () => {
    const clock = fakeClock();
    const store = createRoomStore({
      now: clock.now,
      ttlMs: 1000,
      generate: scriptedCodes("MNPQ", "MNPQ"),
    });

    store.open({ hostId: "a", hostName: "A" });
    clock.advance(1001);

    expect(store.find("MNPQ")).toBeUndefined();
    expect(store.open({ hostId: "b", hostName: "B" })).toMatchObject({
      ok: true,
      room: { code: "MNPQ", hostId: "b" },
    });
  });

  it("keeps a room alive as long as it is being used", () => {
    const clock = fakeClock();
    const store = createRoomStore({ now: clock.now, ttlMs: 1000 });

    const opened = store.open({ hostId: "a", hostName: "A" });
    if (!opened.ok) throw new Error("fixture failed");

    clock.advance(900);
    store.save(opened.room);
    clock.advance(900);

    expect(store.find(opened.room.code)).toBeDefined();
  });

  it("seats a joiner however the code was typed", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "h", hostName: "Michela" });

    const joined = store.join(" mn-pq ", { playerId: "p2", name: "Bo" });

    expect(joined.ok).toBe(true);
    expect(store.find("MNPQ")?.players.map((p) => p.name)).toEqual(["Michela", "Bo"]);
  });

  it("says no room rather than leaking whether a code was ever real", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "h", hostName: "Michela" });
    store.close("MNPQ");

    for (const code of ["MNPQ", "RTVW", "not-a-code"]) {
      expect(store.join(code, { playerId: "p2", name: "Bo" })).toMatchObject({
        ok: false,
        code: "room_not_found",
      });
    }
  });

  it("does not seat anyone when the join is refused", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "h", hostName: "Michela" });

    expect(store.join("MNPQ", { playerId: "p2", name: "Michela" })).toMatchObject({
      ok: false,
      code: "name_taken",
    });
    expect(store.find("MNPQ")?.players).toHaveLength(1);
  });

  it("keeps a room alive because people are joining it", () => {
    const clock = fakeClock();
    const store = createRoomStore({ now: clock.now, ttlMs: 1000, generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "h", hostName: "Michela" });

    clock.advance(900);
    store.join("MNPQ", { playerId: "p2", name: "Bo" });
    clock.advance(900);

    expect(store.find("MNPQ")).toBeDefined();
  });


  it("carries a room from an empty lobby to a running game", () => {
    const story = requireStory("the-pilot");
    const store = createRoomStore({ generate: scriptedCodes("MNPQ"), seed: () => 7 });

    store.open({ hostId: "h", hostName: "Michela" });
    store.join("MNPQ", { playerId: "p2", name: "Bo" });
    expect(store.ready("MNPQ", "p2", true)).toMatchObject({ ok: true });
    expect(store.chooseStory("MNPQ", "h", "the-pilot")).toMatchObject({ ok: true });

    const started = store.start("MNPQ", "h");

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.room.status).toBe("playing");
    expect(started.room.game).toMatchObject({ storyId: "the-pilot", sceneId: story.start, seed: 7 });
    // And the room the next request reads is the started one.
    expect(store.find("MNPQ")?.game?.seed).toBe(7);
  });

  it("refuses a story the registry does not know, and keeps the old choice", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "h", hostName: "Michela" });
    store.chooseStory("MNPQ", "h", "the-pilot");

    expect(store.chooseStory("MNPQ", "h", "the-sleepover")).toMatchObject({
      ok: false,
      code: "unknown_story",
    });
    expect(store.find("MNPQ")?.storyId).toBe("the-pilot");
  });

  it("will not start a room that is not ready, and leaves it in the lobby", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "h", hostName: "Michela" });
    store.join("MNPQ", { playerId: "p2", name: "Bo" });
    store.chooseStory("MNPQ", "h", "the-pilot");

    expect(store.start("MNPQ", "h")).toMatchObject({ ok: false, code: "not_everyone_ready" });
    expect(store.find("MNPQ")?.status).toBe("lobby");
    expect(store.find("MNPQ")?.game).toBeNull();
  });

  it("answers room_not_found for every lobby action on a dead code", () => {
    const store = createRoomStore();

    expect(store.ready("MNPQ", "h", true)).toMatchObject({ code: "room_not_found" });
    expect(store.chooseStory("MNPQ", "h", "the-pilot")).toMatchObject({ code: "room_not_found" });
    expect(store.start("MNPQ", "h")).toMatchObject({ code: "room_not_found" });
  });


  /** A started two-player run of The Pilot, ready to be played. */
  function playing() {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ"), seed: () => 7 });
    store.open({ hostId: "h", hostName: "Michela" });
    store.join("MNPQ", { playerId: "p2", name: "Bo" });
    store.ready("MNPQ", "p2", true);
    store.chooseStory("MNPQ", "h", "the-pilot");
    const started = store.start("MNPQ", "h");
    if (!started.ok) throw new Error("fixture failed");
    return { store, room: started.room };
  }

  it("plays an engine action against the room's run", () => {
    const { store } = playing();

    const result = store.act("MNPQ", { type: "choose", playerId: "h", choiceIndex: 0 });

    expect(result.ok).toBe(true);
    expect(store.find("MNPQ")?.game?.phase).toBe("result");
    expect(store.find("MNPQ")?.game?.log).toHaveLength(1);
  });

  it("passes the engine's own refusal through, code and all", () => {
    const { store } = playing();

    // Bo is not in the spotlight on scene one.
    const result = store.act("MNPQ", { type: "choose", playerId: "p2", choiceIndex: 0 });

    expect(result).toMatchObject({ ok: false, code: "not_spotlight" });
    // And nothing moved.
    expect(store.find("MNPQ")?.game?.phase).toBe("scene");
  });

  it("refuses to play a room that has not started", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "h", hostName: "Michela" });

    expect(store.act("MNPQ", { type: "choose", playerId: "h", choiceIndex: 0 })).toMatchObject({
      ok: false,
      code: "not_playing",
    });
  });

  it("closes the room when the engine says the story is over", () => {
    const { store } = playing();
    const story = requireStory("the-pilot");

    // Walk the run to its ending: pick, continue, pick, continue…
    for (let step = 0; step < 200; step++) {
      const game = store.find("MNPQ")?.game;
      if (!game || game.phase === "ended") break;

      if (game.phase === "result") {
        store.act("MNPQ", { type: "continue", playerId: "h" });
        continue;
      }
      // The Pilot mixes spotlight scenes with group votes and has no skill
      // tests, so choice 0 always lands — as a pick or as a unanimous vote.
      if (story.scenes[game.sceneId].mode === "group") {
        for (const player of game.players) {
          store.act("MNPQ", { type: "vote", playerId: player.id, choiceIndex: 0 });
        }
        continue;
      }
      const spotlight = game.players[game.spotlightIndex].id;
      store.act("MNPQ", { type: "choose", playerId: spotlight, choiceIndex: 0 });
    }

    const room = store.find("MNPQ");
    expect(room?.game?.phase).toBe("ended");
    expect(room?.game?.endingId).toBeTruthy();
    expect(room?.status).toBe("ended");
  });

  it("stops taking lobby actions once the run is over", () => {
    const { store } = playing();
    const room = store.find("MNPQ");
    if (!room?.game) throw new Error("fixture failed");
    // Force the finished state rather than replaying the whole story.
    store.save({ ...room, status: "ended", game: { ...room.game, phase: "ended" } });

    expect(store.ready("MNPQ", "p2", false)).toMatchObject({ code: "already_started" });
    expect(store.act("MNPQ", { type: "continue", playerId: "h" })).toMatchObject({
      code: "not_playing",
    });
  });

  it("answers room_not_found when the code is dead", () => {
    const store = createRoomStore();
    expect(store.act("MNPQ", { type: "continue", playerId: "h" })).toMatchObject({
      code: "room_not_found",
    });
  });

  it("closes a room on request", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "a", hostName: "A" });

    expect(store.close("mn-pq")).toBe(true);
    expect(store.find("MNPQ")).toBeUndefined();
  });
});
