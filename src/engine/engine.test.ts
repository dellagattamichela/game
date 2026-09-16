import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  effectiveCost,
  resolveEnding,
  sceneView,
} from "./engine";
import { StoryValidationError, validateStory } from "./validate";
import type { Action, GameState, Story } from "./types";

// A deliberately tiny story that exercises every mechanic: a free scene, a
// gated crisis, a mishap surcharge, a group vote, and ordered endings.
const fixture: Story = {
  id: "test",
  title: "Test",
  players: { min: 2, max: 6 },
  startingStars: 3,
  start: "s1",
  mishaps: {
    cursed: { id: "cursed", title: "Cursed", crisisCostDelta: 1 },
    minor: { id: "minor", title: "Minor" },
  },
  scenes: {
    s1: {
      text: "{spotlight} opens the door. {randomPlayer} does not.",
      choices: [
        { label: "Earn one", effects: { stars: 1 }, result: "Nice.", next: "s2" },
        { label: "Everyone earns", effects: { starsAll: 2 }, next: "s2" },
        { label: "Everyone loses", effects: { starsAll: -10 }, next: "s2" },
      ],
    },
    s2: {
      type: "crisis",
      text: "A crisis.",
      choices: [
        { label: "Free and bad", effects: { addMishap: "cursed" }, next: "s3" },
        { label: "Costly and good", cost: 2, next: "s3" },
      ],
    },
    s3: {
      mode: "group",
      text: "Everyone votes.",
      choices: [
        { label: "Left", effects: { stars: 5 }, next: "s4" },
        { label: "Right", next: "s4" },
      ],
    },
    s4: {
      type: "crisis",
      text: "Another crisis.",
      choices: [
        { label: "Free again", next: null },
        { label: "Costly again", cost: 2, next: null },
      ],
    },
  },
  endings: [
    { id: "clean", title: "Clean", requires: { maxMishaps: 0 } },
    { id: "rich", title: "Rich", requires: { minTotalStars: 100 } },
    { id: "messy", title: "Messy" },
  ],
};

const PLAYERS = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bo" },
  { id: "c", name: "Cy" },
];

const start = () => createGame(fixture, PLAYERS, 12345);

/** Applies actions in sequence, failing the test on the first rejection. */
function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((acc, action) => {
    const result = applyAction(fixture, acc, action);
    if (!result.ok) throw new Error(`${action.type} rejected: ${result.message}`);
    return result.state;
  }, state);
}

const starsOf = (state: GameState, id: string) =>
  state.players.find((p) => p.id === id)!.stars;

describe("setup", () => {
  it("gives every player the story's starting Stars", () => {
    expect(start().players.map((p) => p.stars)).toEqual([3, 3, 3]);
  });

  it("opens on the story's start scene with the first player in the spotlight", () => {
    const state = start();
    expect(state.sceneId).toBe("s1");
    expect(state.spotlightIndex).toBe(0);
    expect(state.phase).toBe("scene");
  });
});

describe("purity", () => {
  it("never mutates the state it is given", () => {
    const state = start();
    const snapshot = JSON.parse(JSON.stringify(state));
    applyAction(fixture, state, { type: "choose", playerId: "a", choiceIndex: 0 });
    applyAction(fixture, state, { type: "give", fromId: "b", toId: "a", amount: 1 });
    expect(state).toEqual(snapshot);
  });
});

describe("text placeholders", () => {
  it("substitutes the spotlight player and picks a stable other player", () => {
    const text = sceneView(fixture, start()).text;
    expect(text).toMatch(/^Ada opens the door\./);
    // {randomPlayer} must never resolve to the spotlight player.
    expect(text).not.toBe("Ada opens the door. Ada does not.");
    expect(sceneView(fixture, start()).text).toBe(text);
  });
});

describe("spotlight scenes", () => {
  it("rejects a choice from anyone but the spotlight player", () => {
    const result = applyAction(fixture, start(), {
      type: "choose",
      playerId: "b",
      choiceIndex: 0,
    });
    expect(result).toMatchObject({ ok: false, code: "not_spotlight" });
  });

  it("awards effects.stars to the player who chose", () => {
    const state = run(start(), { type: "choose", playerId: "a", choiceIndex: 0 });
    expect(starsOf(state, "a")).toBe(4);
    expect(starsOf(state, "b")).toBe(3);
  });

  it("awards starsAll to everyone", () => {
    const state = run(start(), { type: "choose", playerId: "a", choiceIndex: 1 });
    expect(state.players.map((p) => p.stars)).toEqual([5, 5, 5]);
  });

  it("clamps Stars at zero so a penalty cannot lock players out of later gates", () => {
    const state = run(start(), { type: "choose", playerId: "a", choiceIndex: 2 });
    expect(state.players.map((p) => p.stars)).toEqual([0, 0, 0]);
  });

  it("rotates the spotlight after the scene resolves, not before", () => {
    let state = run(start(), { type: "choose", playerId: "a", choiceIndex: 0 });
    // Still Ada's scene while the result is on screen.
    expect(state.spotlightIndex).toBe(0);
    state = run(state, { type: "continue", playerId: "a" });
    expect(state.spotlightIndex).toBe(1);
    expect(state.sceneId).toBe("s2");
  });
});

describe("gated choices", () => {
  const atCrisis = () =>
    run(start(), { type: "choose", playerId: "a", choiceIndex: 0 }, { type: "continue", playerId: "a" });

  it("locks a choice the spotlight player cannot afford and reports the shortfall", () => {
    // Drain Bo (the new spotlight) to 1 Star, below the cost of 2.
    const poor = run(atCrisis(), { type: "give", fromId: "b", toId: "c", amount: 2 });
    const view = sceneView(fixture, poor);
    expect(view.choices[1]).toMatchObject({ locked: true, cost: 2, shortfall: 1 });
    expect(applyAction(fixture, poor, { type: "choose", playerId: "b", choiceIndex: 1 })).toMatchObject({
      ok: false,
      code: "cannot_afford",
    });
  });

  it("lets a teammate's gift unlock the choice mid-scene", () => {
    const poor = run(atCrisis(), { type: "give", fromId: "b", toId: "c", amount: 2 });
    const helped = run(poor, { type: "give", fromId: "c", toId: "b", amount: 1 });
    expect(sceneView(fixture, helped).choices[1].locked).toBe(false);

    const chosen = run(helped, { type: "choose", playerId: "b", choiceIndex: 1 });
    expect(starsOf(chosen, "b")).toBe(0);
    expect(chosen.pending?.gifts).toHaveLength(2);
  });

  it("spends the Stars rather than merely checking a threshold", () => {
    const state = run(atCrisis(), { type: "choose", playerId: "b", choiceIndex: 1 });
    expect(starsOf(state, "b")).toBe(1);
    expect(state.pending?.deltas.b).toBe(-2);
  });

  it("charges nothing for the free option", () => {
    const state = run(atCrisis(), { type: "choose", playerId: "b", choiceIndex: 0 });
    expect(starsOf(state, "b")).toBe(3);
  });
});

describe("gifts", () => {
  it("moves Stars immediately and rejects gifts the giver cannot cover", () => {
    const state = run(start(), { type: "give", fromId: "b", toId: "a", amount: 3 });
    expect(starsOf(state, "b")).toBe(0);
    expect(starsOf(state, "a")).toBe(6);
    expect(applyAction(fixture, state, { type: "give", fromId: "b", toId: "a", amount: 1 })).toMatchObject({
      ok: false,
      code: "invalid_gift",
    });
  });

  it("rejects self-gifts and non-positive amounts", () => {
    const state = start();
    expect(applyAction(fixture, state, { type: "give", fromId: "a", toId: "a", amount: 1 })).toMatchObject({ ok: false, code: "invalid_gift" });
    expect(applyAction(fixture, state, { type: "give", fromId: "a", toId: "b", amount: 0 })).toMatchObject({ ok: false, code: "invalid_gift" });
    expect(applyAction(fixture, state, { type: "give", fromId: "a", toId: "b", amount: 1.5 })).toMatchObject({ ok: false, code: "invalid_gift" });
  });

  it("clears gifts when the scene advances", () => {
    let state = run(start(), { type: "give", fromId: "b", toId: "a", amount: 1 });
    expect(state.gifts).toHaveLength(1);
    state = run(state, { type: "choose", playerId: "a", choiceIndex: 0 }, { type: "continue", playerId: "a" });
    expect(state.gifts).toEqual([]);
  });
});

describe("mishaps", () => {
  const withMishap = () =>
    run(
      start(),
      { type: "choose", playerId: "a", choiceIndex: 0 },
      { type: "continue", playerId: "a" },
      // Bo takes the free, bad option at the crisis: picks up "cursed".
      { type: "choose", playerId: "b", choiceIndex: 0 },
      { type: "continue", playerId: "b" },
    );

  it("attaches the mishap and records it in the log", () => {
    const state = withMishap();
    expect(state.mishaps).toEqual(["cursed"]);
    expect(state.log.at(-1)?.mishapAdded).toBe("cursed");
  });

  it("raises the price of later crisis gates", () => {
    const state = withMishap();
    const crisis = fixture.scenes.s4;
    expect(effectiveCost(fixture, state, crisis, crisis.choices[1])).toBe(3);
  });

  it("leaves free choices free no matter how many mishaps are active", () => {
    const state = { ...withMishap(), mishaps: ["cursed", "cursed", "cursed"] };
    const crisis = fixture.scenes.s4;
    expect(effectiveCost(fixture, state, crisis, crisis.choices[0])).toBe(0);
  });

  it("does not add the same mishap twice", () => {
    // The spotlight has rotated twice by now, so Cy is the one deciding.
    const state = { ...withMishap(), sceneId: "s2", phase: "scene" as const, pending: null };
    expect(state.players[state.spotlightIndex].id).toBe("c");
    const again = run(state, { type: "choose", playerId: "c", choiceIndex: 0 });
    expect(again.mishaps).toEqual(["cursed"]);
  });
});

describe("group scenes", () => {
  const atVote = () =>
    run(
      start(),
      { type: "choose", playerId: "a", choiceIndex: 0 },
      { type: "continue", playerId: "a" },
      { type: "choose", playerId: "b", choiceIndex: 0 },
      { type: "continue", playerId: "b" },
    );

  it("waits for every player before resolving", () => {
    const state = run(atVote(), { type: "vote", playerId: "a", choiceIndex: 0 });
    expect(state.phase).toBe("scene");
    expect(sceneView(fixture, state).awaitingVotes.map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("resolves on the majority and pays effects only to the winning voters", () => {
    const state = run(
      atVote(),
      { type: "vote", playerId: "a", choiceIndex: 0 },
      { type: "vote", playerId: "b", choiceIndex: 0 },
      { type: "vote", playerId: "c", choiceIndex: 1 },
    );
    expect(state.phase).toBe("result");
    expect(state.pending?.choiceIndex).toBe(0);
    expect(state.pending?.deltas).toEqual({ a: 5, b: 5 });
  });

  it("breaks a tie with the spotlight player's vote", () => {
    // Two players only, so 1-1 is a genuine tie. Cy is in the spotlight at s3.
    const twoPlayer = createGame(fixture, [PLAYERS[0], PLAYERS[2]], 1);
    const state = run(
      twoPlayer,
      { type: "choose", playerId: "a", choiceIndex: 0 },
      { type: "continue", playerId: "a" },
      { type: "choose", playerId: "c", choiceIndex: 0 },
      { type: "continue", playerId: "c" },
      { type: "vote", playerId: "c", choiceIndex: 1 },
      { type: "vote", playerId: "a", choiceIndex: 0 },
    );
    expect(state.spotlightIndex).toBe(0);
    expect(state.players[0].id).toBe("a");
    expect(state.pending?.choiceIndex).toBe(0);
  });

  it("rejects a spotlight-style choice during a group vote", () => {
    expect(applyAction(fixture, atVote(), { type: "choose", playerId: "c", choiceIndex: 0 })).toMatchObject({ ok: false, code: "wrong_phase" });
  });

  it("lets a player change their vote before the last one lands", () => {
    const state = run(
      atVote(),
      { type: "vote", playerId: "a", choiceIndex: 0 },
      { type: "vote", playerId: "a", choiceIndex: 1 },
      { type: "vote", playerId: "b", choiceIndex: 1 },
      { type: "vote", playerId: "c", choiceIndex: 1 },
    );
    expect(state.pending?.choiceIndex).toBe(1);
  });
});

describe("endings", () => {
  it("returns the first ending whose requirements hold", () => {
    const state = start();
    expect(resolveEnding(fixture, state).id).toBe("clean");
    expect(resolveEnding(fixture, { ...state, mishaps: ["cursed"] }).id).toBe("messy");
    expect(
      resolveEnding(fixture, {
        ...state,
        mishaps: ["cursed"],
        players: state.players.map((p) => ({ ...p, stars: 50 })),
      }).id,
    ).toBe("rich");
  });

  it("ends the run when a choice has no next scene", () => {
    let state = { ...start(), sceneId: "s4", spotlightIndex: 0 };
    state = run(state, { type: "choose", playerId: "a", choiceIndex: 0 });
    expect(state.pending?.next).toBeNull();
    state = run(state, { type: "continue", playerId: "a" });
    expect(state.phase).toBe("ended");
    expect(state.endingId).toBe("clean");
  });

  it("refuses any further action once ended", () => {
    let state = { ...start(), sceneId: "s4", spotlightIndex: 0 };
    state = run(state, { type: "choose", playerId: "a", choiceIndex: 0 }, { type: "continue", playerId: "a" });
    expect(applyAction(fixture, state, { type: "give", fromId: "a", toId: "b", amount: 1 })).toMatchObject({ ok: false, code: "already_ended" });
  });
});

describe("phase guards", () => {
  it("refuses to continue when no result is showing, and to choose during one", () => {
    const state = start();
    expect(applyAction(fixture, state, { type: "continue", playerId: "a" })).toMatchObject({ ok: false, code: "wrong_phase" });

    const inResult = run(state, { type: "choose", playerId: "a", choiceIndex: 0 });
    expect(applyAction(fixture, inResult, { type: "choose", playerId: "a", choiceIndex: 1 })).toMatchObject({ ok: false, code: "wrong_phase" });
    expect(applyAction(fixture, inResult, { type: "give", fromId: "a", toId: "b", amount: 1 })).toMatchObject({ ok: false, code: "wrong_phase" });
  });

  it("rejects unknown players and out-of-range choices", () => {
    const state = start();
    expect(applyAction(fixture, state, { type: "choose", playerId: "a", choiceIndex: 99 })).toMatchObject({ ok: false, code: "unknown_choice" });
    expect(applyAction(fixture, state, { type: "give", fromId: "zz", toId: "a", amount: 1 })).toMatchObject({ ok: false, code: "unknown_player" });
  });
});

describe("validation", () => {
  const clone = () => JSON.parse(JSON.stringify(fixture)) as Story;

  it("accepts the fixture story", () => {
    expect(validateStory(clone()).id).toBe("test");
  });

  it("rejects a cost outside a crisis scene", () => {
    const bad = clone();
    bad.scenes.s1.choices[0].cost = 2;
    expect(() => validateStory(bad)).toThrow(/not type "crisis"/);
  });

  it("rejects a cost inside a group scene", () => {
    const bad = clone();
    bad.scenes.s3.type = "crisis";
    bad.scenes.s3.choices[0].cost = 2;
    expect(() => validateStory(bad)).toThrow(/group scenes do not support/);
  });

  it("rejects a dangling next target", () => {
    const bad = clone();
    bad.scenes.s1.choices[0].next = "nowhere";
    expect(() => validateStory(bad)).toThrow(/missing scene "nowhere"/);
  });

  it("rejects an unknown mishap reference", () => {
    const bad = clone();
    bad.scenes.s2.choices[0].effects = { addMishap: "ghost" };
    expect(() => validateStory(bad)).toThrow(/unknown mishap "ghost"/);
  });

  it("rejects an unreachable scene", () => {
    const bad = clone();
    bad.scenes.orphan = { text: "Nobody comes here.", choices: [{ label: "A" }, { label: "B" }] };
    expect(() => validateStory(bad)).toThrow(/unreachable/);
  });

  it("requires an unconditional ending, listed last", () => {
    const noFallback = clone();
    noFallback.endings = [{ id: "only", title: "Only", requires: { maxMishaps: 0 } }];
    expect(() => validateStory(noFallback)).toThrow(/no fallback ending/);

    const misordered = clone();
    misordered.endings = [{ id: "any", title: "Any" }, { id: "clean", title: "Clean", requires: { maxMishaps: 0 } }];
    expect(() => validateStory(misordered)).toThrow(/must be listed last/);
  });

  it("reports the offending field for a shape error", () => {
    const bad = clone() as unknown as Record<string, unknown>;
    delete bad.startingStars;
    expect(() => validateStory(bad)).toThrow(StoryValidationError);
    expect(() => validateStory(bad)).toThrow(/startingStars/);
  });
});
