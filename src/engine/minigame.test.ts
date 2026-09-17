import { describe, expect, it } from "vitest";
import { applyAction, createGame, effectiveDifficulty, pendingView, sceneView } from "./engine";
import { validateStory } from "./validate";
import type { Action, GameState, Story } from "./types";

const fixture: Story = {
  id: "skill",
  title: "Skill",
  players: { min: 2, max: 6 },
  startingStars: 2,
  start: "s1",
  clues: { prize: { id: "prize", title: "The prize" }, scrap: { id: "scrap", title: "A scrap" } },
  mishaps: { shaken: { id: "shaken", title: "Shaken", minigameDifficultyDelta: 2 } },
  scenes: {
    s1: {
      text: "A locked drawer.",
      choices: [
        {
          label: "Pick the lock",
          minigame: { type: "timing", difficulty: 2, prompt: "Hold it steady" },
          effects: { addClue: "prize", stars: 1 },
          result: "It opens.",
          failEffects: { addClue: "scrap", addMishap: "shaken" },
          failResult: "The pick snaps.",
          failNext: "s3",
          next: "s2",
        },
        { label: "Leave it", next: "s2" },
      ],
    },
    s2: { text: "Onward.", choices: [{ label: "Go", next: null }, { label: "Wait", next: null }] },
    s3: { text: "The long way.", choices: [{ label: "Go", next: null }, { label: "Wait", next: null }] },
  },
  endings: [
    { id: "won", title: "Won", requires: { hasClue: "prize" } },
    { id: "lost", title: "Lost" },
  ],
};

const PLAYERS = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bo" },
];
const start = () => createGame(fixture, PLAYERS, 3);

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((acc, action) => {
    const result = applyAction(fixture, acc, action);
    if (!result.ok) throw new Error(`${action.type} rejected: ${result.message}`);
    return result.state;
  }, state);
}

const attempt = () => run(start(), { type: "choose", playerId: "a", choiceIndex: 0 });

describe("entering a skill test", () => {
  it("parks the game in the minigame phase instead of resolving the choice", () => {
    const state = attempt();
    expect(state.phase).toBe("minigame");
    expect(state.pending).toBeNull();
    // Nothing has been applied yet: no clue, no Stars, no scene change.
    expect(state.clues).toEqual([]);
    expect(state.sceneId).toBe("s1");
  });

  it("records who is attempting it and at what difficulty", () => {
    expect(attempt().minigame).toMatchObject({
      choiceIndex: 0,
      playerId: "a",
      spec: { type: "timing", difficulty: 2 },
    });
  });

  it("resolves a choice without a minigame immediately, as before", () => {
    const state = run(start(), { type: "choose", playerId: "a", choiceIndex: 1 });
    expect(state.phase).toBe("result");
  });
});

describe("passing", () => {
  const passed = () => run(attempt(), { type: "minigameResult", playerId: "a", passed: true });

  it("applies the success effects and takes the success branch", () => {
    const state = passed();
    expect(state.clues).toEqual(["prize"]);
    expect(state.players[0].stars).toBe(3);
    expect(state.pending).toMatchObject({ next: "s2" });
    // The prose is not in the state any more — it is resolved against whichever
    // language the reader asked for, from the ids the state does keep.
    expect(pendingView(fixture, state)?.text).toBe("It opens.");
  });

  it("reports the attempt on the result beat and in the log", () => {
    const state = passed();
    expect(state.pending?.minigame).toEqual({ type: "timing", passed: true });
    expect(state.log.at(-1)?.minigame).toEqual({ type: "timing", passed: true });
  });

  it("clears the attempt once resolved", () => {
    expect(passed().minigame).toBeNull();
  });
});

describe("failing", () => {
  const failed = () => run(attempt(), { type: "minigameResult", playerId: "a", passed: false });

  it("applies failEffects instead of effects", () => {
    const state = failed();
    expect(state.clues).toEqual(["scrap"]);
    expect(state.mishaps).toEqual(["shaken"]);
    // The success reward is not granted.
    expect(state.players[0].stars).toBe(2);
  });

  it("uses the failure text and the failure branch", () => {
    const state = failed();
    expect(state.pending).toMatchObject({ next: "s3" });
    expect(pendingView(fixture, state)?.text).toBe("The pick snaps.");
  });

  it("still moves the story on, so a failed test is never a dead end", () => {
    const state = run(failed(), { type: "continue", playerId: "a" });
    expect(state.phase).toBe("scene");
    expect(state.sceneId).toBe("s3");
  });

  it("falls back to the success branch when the story gives no failNext", () => {
    const noFailNext: Story = {
      ...fixture,
      scenes: {
        ...fixture.scenes,
        s1: {
          ...fixture.scenes.s1,
          choices: [
            { ...fixture.scenes.s1.choices[0], failNext: undefined, failEffects: undefined },
            fixture.scenes.s1.choices[1],
          ],
        },
      },
    };
    const state = applyAction(noFailNext, createGame(noFailNext, PLAYERS, 3), {
      type: "choose",
      playerId: "a",
      choiceIndex: 0,
    });
    if (!state.ok) throw new Error(state.message);
    const done = applyAction(noFailNext, state.state, {
      type: "minigameResult",
      playerId: "a",
      passed: false,
    });
    if (!done.ok) throw new Error(done.message);
    expect(done.state.pending?.next).toBe("s2");
    expect(done.state.clues).toEqual([]);
  });
});

describe("guards", () => {
  it("refuses a result from anyone but the player attempting it", () => {
    expect(applyAction(fixture, attempt(), { type: "minigameResult", playerId: "b", passed: true })).toMatchObject({
      ok: false,
      code: "not_your_minigame",
    });
  });

  it("refuses a result when no attempt is open", () => {
    expect(applyAction(fixture, start(), { type: "minigameResult", playerId: "a", passed: true })).toMatchObject({
      ok: false,
      code: "wrong_phase",
    });
  });

  it("refuses choices and gifts while an attempt is open", () => {
    const state = attempt();
    expect(applyAction(fixture, state, { type: "choose", playerId: "a", choiceIndex: 1 })).toMatchObject({ ok: false, code: "wrong_phase" });
    expect(applyAction(fixture, state, { type: "give", fromId: "b", toId: "a", amount: 1 })).toMatchObject({ ok: false, code: "wrong_phase" });
    expect(applyAction(fixture, state, { type: "continue", playerId: "a" })).toMatchObject({ ok: false, code: "wrong_phase" });
  });
});

describe("difficulty", () => {
  it("rises with mishaps that make everything harder", () => {
    const spec = { type: "timing" as const, difficulty: 2 };
    expect(effectiveDifficulty(fixture, start(), spec)).toBe(2);
    expect(effectiveDifficulty(fixture, { ...start(), mishaps: ["shaken"] }, spec)).toBe(4);
  });

  it("is clamped to 5, so setbacks cannot make a puzzle unwinnable", () => {
    const piled = { ...start(), mishaps: ["shaken", "shaken", "shaken"] };
    expect(effectiveDifficulty(fixture, piled, { type: "timing", difficulty: 4 })).toBe(5);
  });

  it("defaults to 2 when a story does not say", () => {
    expect(effectiveDifficulty(fixture, start(), { type: "memory" })).toBe(2);
  });
});

describe("validation", () => {
  const clone = () => JSON.parse(JSON.stringify(fixture)) as Story;

  it("accepts the fixture", () => {
    expect(validateStory(clone()).id).toBe("skill");
  });

  it("rejects a choice that is both paid for and attempted", () => {
    const bad = clone();
    bad.scenes.s1.type = "crisis";
    bad.scenes.s1.choices[0].cost = 2;
    expect(() => validateStory(bad)).toThrow(/both a cost and a minigame/);
  });

  it("rejects a minigame in a group scene", () => {
    const bad = clone();
    bad.scenes.s1.mode = "group";
    expect(() => validateStory(bad)).toThrow(/group scenes cannot run/);
  });

  it("rejects failure handling with nothing to fail", () => {
    const bad = clone();
    bad.scenes.s1.choices[1].failResult = "Never happens";
    expect(() => validateStory(bad)).toThrow(/no minigame to fail/);
  });

  it("rejects a dangling failNext", () => {
    const bad = clone();
    bad.scenes.s1.choices[0].failNext = "nowhere";
    expect(() => validateStory(bad)).toThrow(/failNext points at missing scene/);
  });

  it("counts a clue granted only on failure as findable", () => {
    // "scrap" is awarded by failEffects alone and must not read as unreachable.
    expect(() => validateStory(clone())).not.toThrow();
  });
});

describe("scene rendering", () => {
  it("leaves a minigame choice pickable like any other", () => {
    expect(sceneView(fixture, start()).choices[0]).toMatchObject({
      available: true,
      hidden: false,
      locked: false,
    });
  });
});
