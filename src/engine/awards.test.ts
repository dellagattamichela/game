import { describe, expect, it } from "vitest";
import { awards, highlights } from "./awards";
import type { GameState, LogEntry } from "./types";

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  sceneId: "s1",
  deciderIds: ["a"],
  choiceIndex: 0,
  starsSpent: 0,
  mishapAdded: null,
  cluesFound: [],
  minigame: null,
  gifts: [],
  ...over,
});

const state = (log: LogEntry[], stars: Record<string, number> = {}): GameState =>
  ({
    storyId: "test",
    phase: "ended",
    sceneId: "s1",
    players: [
      { id: "a", name: "Ada", stars: stars.a ?? 0 },
      { id: "b", name: "Bo", stars: stars.b ?? 0 },
      { id: "c", name: "Cy", stars: stars.c ?? 0 },
    ],
    spotlightIndex: 0,
    mishaps: [],
    clues: [],
    vars: {},
    votes: {},
    gifts: [],
    minigame: null,
    pending: null,
    endingId: "over",
    log,
    seed: 1,
  }) as GameState;

const byId = (list: ReturnType<typeof awards>, id: string) => list.find((a) => a.id === id);

describe("awards", () => {
  it("gives nothing away for a run where nothing happened", () => {
    expect(awards(state([entry(), entry()]))).toEqual([
      // Someone still made every call, which is the one thing always true.
      { id: "driver", detail: { unit: "scenes", count: 2 }, playerIds: ["a"] },
    ]);
  });

  it("credits Stars to whoever gave them, not whoever got them", () => {
    const log = [
      entry({ gifts: [{ fromId: "b", toId: "a", amount: 2 }] }),
      entry({ gifts: [{ fromId: "c", toId: "a", amount: 1 }] }),
    ];

    expect(byId(awards(state(log)), "generous")).toEqual({
      id: "generous",
      detail: { unit: "stars", count: 2 },
      playerIds: ["b"],
    });
  });

  it("charges the spend to the player who paid", () => {
    const log = [entry({ deciderIds: ["b"], starsSpent: 5 }), entry({ deciderIds: ["a"], starsSpent: 1 })];
    expect(byId(awards(state(log)), "spender")).toMatchObject({ detail: { unit: "stars", count: 5 }, playerIds: ["b"] });
  });

  it("blames a mishap on everyone who voted for it", () => {
    const log = [entry({ deciderIds: ["a", "c"], mishapAdded: "cursed" })];
    expect(byId(awards(state(log)), "chaos")).toMatchObject({
      detail: { unit: "mishap", count: 1 },
      playerIds: ["a", "c"],
    });
  });

  it("counts clues rather than the scenes that held them", () => {
    const log = [entry({ deciderIds: ["c"], cluesFound: ["x", "y", "z"] })];
    expect(byId(awards(state(log)), "detective")).toMatchObject({
      detail: { unit: "clues", count: 3 },
      playerIds: ["c"],
    });
  });

  it("separates steady hands from fumbles", () => {
    const log = [
      entry({ deciderIds: ["a"], minigame: { type: "timing", passed: true } }),
      entry({ deciderIds: ["a"], minigame: { type: "memory", passed: true } }),
      entry({ deciderIds: ["b"], minigame: { type: "order", passed: false } }),
    ];
    const list = awards(state(log));

    expect(byId(list, "steady")).toMatchObject({ detail: { unit: "passed", count: 2 }, playerIds: ["a"] });
    expect(byId(list, "fumbler")).toMatchObject({ detail: { unit: "failed", count: 1 }, playerIds: ["b"] });
  });

  it("shares an award rather than breaking a tie", () => {
    const log = [
      entry({ gifts: [{ fromId: "a", toId: "c", amount: 2 }] }),
      entry({ gifts: [{ fromId: "b", toId: "c", amount: 2 }] }),
    ];
    expect(byId(awards(state(log)), "generous")?.playerIds).toEqual(["a", "b"]);
  });

  it("reads the leftover Stars off the players, not the log", () => {
    expect(byId(awards(state([entry()], { a: 1, b: 7, c: 3 })), "hoarder")).toMatchObject({
      detail: { unit: "stars", count: 7 },
      playerIds: ["b"],
    });
  });

  it("skips an award nobody earned", () => {
    const list = awards(state([entry()]));
    expect(byId(list, "generous")).toBeUndefined();
    expect(byId(list, "chaos")).toBeUndefined();
    expect(byId(list, "hoarder")).toBeUndefined();
  });

  it("is a pure function of the state", () => {
    const s = state([entry({ starsSpent: 2 })], { a: 3 });
    expect(awards(s)).toEqual(awards(s));
  });
});

describe("highlights", () => {
  it("keeps the scenes where something happened", () => {
    const log = [
      entry({ sceneId: "nothing" }),
      entry({ sceneId: "paid", starsSpent: 2 }),
      entry({ sceneId: "also-nothing" }),
      entry({ sceneId: "clue", cluesFound: ["x"] }),
    ];

    expect(highlights(state(log)).map((e) => e.sceneId)).toEqual(["paid", "clue"]);
  });

  it("falls back to the last scenes when nothing stood out", () => {
    const log = [entry({ sceneId: "one" }), entry({ sceneId: "two" }), entry({ sceneId: "three" })];
    expect(highlights(state(log), 2).map((e) => e.sceneId)).toEqual(["two", "three"]);
  });

  it("keeps the recap short on a long run", () => {
    const log = Array.from({ length: 40 }, (_, i) => entry({ sceneId: `s${i}`, starsSpent: 1 }));
    expect(highlights(state(log))).toHaveLength(6);
    // The end of the run, not the start: what happened last is what is fresh.
    expect(highlights(state(log)).at(-1)?.sceneId).toBe("s39");
  });

  it("is never empty for a run that played at all", () => {
    expect(highlights(state([entry()]))).toHaveLength(1);
  });
});
