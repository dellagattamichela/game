import { describe, expect, it } from "vitest";
import { cluesMentioned, matchesCondition, varsMentioned } from "./conditions";
import type { Condition, GameState } from "./types";

const base: GameState = {
  storyId: "t",
  phase: "scene",
  sceneId: "s1",
  players: [
    { id: "a", name: "Ada", stars: 3 },
    { id: "b", name: "Bo", stars: 2 },
  ],
  spotlightIndex: 0,
  mishaps: ["late"],
  clues: ["key", "cage"],
  vars: { accused: "marisol" },
  votes: {},
  gifts: [],
  minigame: null,
  pending: null,
  endingId: null,
  log: [],
  seed: 1,
};

const holds = (c: Condition) => matchesCondition(c, base);

describe("matchesCondition", () => {
  it("an absent or empty condition always matches", () => {
    expect(matchesCondition(undefined, base)).toBe(true);
    expect(holds({})).toBe(true);
  });

  it("hasClue requires every listed clue", () => {
    expect(holds({ hasClue: "key" })).toBe(true);
    expect(holds({ hasClue: ["key", "cage"] })).toBe(true);
    expect(holds({ hasClue: ["key", "page"] })).toBe(false);
  });

  it("anyClue requires at least one", () => {
    expect(holds({ anyClue: ["page", "cage"] })).toBe(true);
    expect(holds({ anyClue: ["page", "crate"] })).toBe(false);
  });

  it("lacksClue requires none of them", () => {
    expect(holds({ lacksClue: "page" })).toBe(true);
    expect(holds({ lacksClue: ["page", "key"] })).toBe(false);
  });

  it("counts clues", () => {
    expect(holds({ minClues: 2 })).toBe(true);
    expect(holds({ minClues: 3 })).toBe(false);
    expect(holds({ maxClues: 2 })).toBe(true);
    expect(holds({ maxClues: 1 })).toBe(false);
  });

  it("reads run variables by exact value", () => {
    expect(holds({ is: { accused: "marisol" } })).toBe(true);
    expect(holds({ is: { accused: "brann" } })).toBe(false);
  });

  it("treats an unset variable as not equal, so isNot holds for it", () => {
    expect(holds({ isNot: { accused: "brann" } })).toBe(true);
    expect(holds({ isNot: { rescued: "yes" } })).toBe(true);
    expect(holds({ isNot: { accused: "marisol" } })).toBe(false);
  });

  it("isAny matches a set of values, and fails when unset", () => {
    expect(holds({ isAny: { accused: ["marisol", "hal"] } })).toBe(true);
    expect(holds({ isAny: { accused: ["teddy", "hal"] } })).toBe(false);
    expect(holds({ isAny: { rescued: ["yes"] } })).toBe(false);
  });

  it("isSet and isUnset test presence", () => {
    expect(holds({ isSet: ["accused"] })).toBe(true);
    expect(holds({ isSet: ["rescued"] })).toBe(false);
    expect(holds({ isUnset: ["rescued"] })).toBe(true);
    expect(holds({ isUnset: ["accused"] })).toBe(false);
  });

  it("ANDs every field that is present", () => {
    expect(holds({ hasClue: "key", is: { accused: "marisol" }, minClues: 2 })).toBe(true);
    expect(holds({ hasClue: "key", is: { accused: "brann" } })).toBe(false);
  });

  it("reads mishaps and the room's Star total", () => {
    expect(holds({ hasMishap: "late", maxMishaps: 1 })).toBe(true);
    expect(holds({ lacksMishap: "late" })).toBe(false);
    expect(holds({ minTotalStars: 5 })).toBe(true);
    expect(holds({ minTotalStars: 6 })).toBe(false);
  });
});

describe("introspection helpers", () => {
  it("lists every clue a condition mentions", () => {
    expect(
      cluesMentioned({ hasClue: "a", lacksClue: ["b"], anyClue: ["c", "d"] }).sort(),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("lists every variable a condition reads, with expected values", () => {
    expect(
      varsMentioned({ is: { x: "1" }, isAny: { y: ["2", "3"] }, isUnset: ["z"] }),
    ).toEqual([
      ["x", ["1"]],
      ["y", ["2", "3"]],
      ["z", []],
    ]);
  });
});
