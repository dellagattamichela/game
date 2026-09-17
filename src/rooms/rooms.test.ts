import { describe, expect, it } from "vitest";
import { CODE_LENGTH } from "./code";
import { createRoom, hasSeat, isMember, joinRoom, normalizeName } from "./room";
import { createRoomStore } from "./store";
import { DEFAULT_MAX_PLAYERS, MAX_NAME_LENGTH } from "./types";

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

  it("closes a room on request", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "a", hostName: "A" });

    expect(store.close("mn-pq")).toBe(true);
    expect(store.find("MNPQ")).toBeUndefined();
  });
});
