import { describe, expect, it } from "vitest";
import { CODE_LENGTH } from "./code";
import { createRoom, hasSeat, normalizeName } from "./room";
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

  it("closes a room on request", () => {
    const store = createRoomStore({ generate: scriptedCodes("MNPQ") });
    store.open({ hostId: "a", hostName: "A" });

    expect(store.close("mn-pq")).toBe(true);
    expect(store.find("MNPQ")).toBeUndefined();
  });
});
