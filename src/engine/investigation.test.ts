import { describe, expect, it } from "vitest";
import { applyAction, createGame, resolveEnding, sceneView } from "./engine";
import { validateStory } from "./validate";
import type { Action, GameState, Story } from "./types";

/** A minimal investigation: find things, then name someone. */
const fixture: Story = {
  id: "probe",
  title: "Probe",
  players: { min: 2, max: 6 },
  startingStars: 2,
  start: "s1",
  clues: {
    key: { id: "key", title: "The missing key" },
    cage: { id: "cage", title: "The unlocked cage" },
    page: { id: "page", title: "The torn page" },
  },
  vars: { accused: { values: ["marisol", "brann"] } },
  scenes: {
    s1: {
      text: "Where do you look?",
      choices: [
        { label: "The galley", effects: { addClue: ["key", "cage"] }, next: "s2" },
        { label: "The bridge", effects: { addClue: "page" }, next: "s2" },
        {
          label: "Confront her about the key",
          requires: { hasClue: "key" },
          next: "s2",
        },
        {
          label: "Break down the door",
          requires: { hasClue: "page" },
          lockedHint: "You would need a reason first",
          effects: { removeClue: "page" },
          next: "s2",
        },
      ],
    },
    s2: {
      mode: "group",
      text: "Who was it?",
      choices: [
        { label: "Marisol", effects: { set: { accused: "marisol" } }, next: null },
        { label: "Brann", effects: { set: { accused: "brann" } }, next: null },
        { label: "Say nothing", next: null },
      ],
    },
  },
  endings: [
    { id: "proved", title: "Proved", requires: { is: { accused: "marisol" }, hasClue: "key" } },
    { id: "named", title: "Named", requires: { is: { accused: "marisol" } } },
    { id: "wrong", title: "Wrong", requires: { is: { accused: "brann" } } },
    { id: "silent", title: "Silent" },
  ],
};

const PLAYERS = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bo" },
];
const start = () => createGame(fixture, PLAYERS, 7);

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((acc, action) => {
    const result = applyAction(fixture, acc, action);
    if (!result.ok) throw new Error(`${action.type} rejected: ${result.message}`);
    return result.state;
  }, state);
}

describe("clues", () => {
  it("starts with an empty notebook", () => {
    expect(start().clues).toEqual([]);
  });

  it("collects clues and reports the new ones on the result beat", () => {
    const state = run(start(), { type: "choose", playerId: "a", choiceIndex: 0 });
    expect(state.clues).toEqual(["key", "cage"]);
    expect(state.pending?.cluesFound).toEqual(["key", "cage"]);
    expect(state.log.at(-1)?.cluesFound).toEqual(["key", "cage"]);
  });

  it("does not re-report a clue the room already had", () => {
    const known = { ...start(), clues: ["key"] };
    const state = run(known, { type: "choose", playerId: "a", choiceIndex: 0 });
    expect(state.clues).toEqual(["key", "cage"]);
    // "key" was already known, so only "cage" is a discovery.
    expect(state.pending?.cluesFound).toEqual(["cage"]);
  });

  it("removes clues when a choice destroys evidence", () => {
    const withPage = { ...start(), clues: ["page"] };
    const state = run(withPage, { type: "choose", playerId: "a", choiceIndex: 3 });
    expect(state.clues).toEqual([]);
  });
});

describe("clue-gated choices", () => {
  it("hides an option the room has no reason to think of", () => {
    const view = sceneView(fixture, start());
    expect(view.choices[2]).toMatchObject({ available: false, hidden: true });
    // The visible options are the two searches plus the hinted one.
    expect(view.choices.filter((c) => !c.hidden).map((c) => c.index)).toEqual([0, 1, 3]);
  });

  it("reveals it once the clue is held", () => {
    const withKey = { ...start(), clues: ["key"] };
    expect(sceneView(fixture, withKey).choices[2]).toMatchObject({
      available: true,
      hidden: false,
      locked: false,
    });
  });

  it("shows a hinted option as locked instead of hiding it", () => {
    expect(sceneView(fixture, start()).choices[3]).toMatchObject({
      available: false,
      hidden: false,
      locked: true,
      lockedReason: "You would need a reason first",
    });
  });

  it("refuses an unavailable choice even if a client asks for it", () => {
    expect(applyAction(fixture, start(), { type: "choose", playerId: "a", choiceIndex: 2 })).toMatchObject({
      ok: false,
      code: "unavailable_choice",
    });
  });

  it("refuses a group vote for an unavailable option", () => {
    const gatedGroup: Story = {
      ...fixture,
      scenes: {
        ...fixture.scenes,
        s2: {
          ...fixture.scenes.s2,
          choices: [
            { ...fixture.scenes.s2.choices[0], requires: { hasClue: "page" } },
            fixture.scenes.s2.choices[1],
            fixture.scenes.s2.choices[2],
          ],
        },
      },
    };
    const atVote = run(start(), { type: "choose", playerId: "a", choiceIndex: 1 });
    // Arrive at s2 without "page": the Marisol option is not offered.
    const noPage = { ...atVote, phase: "scene" as const, sceneId: "s2", clues: [], pending: null };
    expect(applyAction(gatedGroup, noPage, { type: "vote", playerId: "a", choiceIndex: 0 })).toMatchObject({
      ok: false,
      code: "unavailable_choice",
    });
  });

  it("still charges Star gates as locked-but-visible, unlike clue gates", () => {
    // A Star gate says what it costs; a clue gate does not admit it exists.
    const priced: Story = {
      ...fixture,
      scenes: {
        ...fixture.scenes,
        s1: {
          ...fixture.scenes.s1,
          type: "crisis",
          choices: [
            { label: "Expensive", cost: 9, next: "s2" },
            ...fixture.scenes.s1.choices.slice(1),
          ],
        },
      },
    };
    expect(sceneView(priced, createGame(priced, PLAYERS, 7)).choices[0]).toMatchObject({
      available: true,
      hidden: false,
      locked: true,
      shortfall: 7,
      lockedReason: "needs 7 more ⭐",
    });
  });
});

describe("run variables", () => {
  it("records what the room decided", () => {
    const state = run(
      start(),
      { type: "choose", playerId: "a", choiceIndex: 1 },
      { type: "continue", playerId: "a" },
      { type: "vote", playerId: "a", choiceIndex: 0 },
      { type: "vote", playerId: "b", choiceIndex: 0 },
    );
    expect(state.vars).toEqual({ accused: "marisol" });
  });

  it("leaves variables unset when no choice assigned them", () => {
    expect(start().vars).toEqual({});
  });
});

describe("endings from clues and variables", () => {
  const ended = (clues: string[], vars: Record<string, string>) =>
    resolveEnding(fixture, { ...start(), clues, vars }).id;

  it("separates naming the culprit from proving it", () => {
    expect(ended(["key"], { accused: "marisol" })).toBe("proved");
    expect(ended([], { accused: "marisol" })).toBe("named");
  });

  it("gives a distinct ending for the wrong person, and for silence", () => {
    expect(ended(["key"], { accused: "brann" })).toBe("wrong");
    expect(ended(["key"], {})).toBe("silent");
  });
});

describe("validation of investigation stories", () => {
  const clone = () => JSON.parse(JSON.stringify(fixture)) as Story;

  it("accepts the fixture", () => {
    expect(validateStory(clone()).id).toBe("probe");
  });

  it("rejects an unknown clue in effects", () => {
    const bad = clone();
    bad.scenes.s1.choices[0].effects = { addClue: "ghost" };
    expect(() => validateStory(bad)).toThrow(/unknown clue "ghost"/);
  });

  it("rejects an unknown clue in a condition", () => {
    const bad = clone();
    bad.scenes.s1.choices[2].requires = { hasClue: "ghost" };
    expect(() => validateStory(bad)).toThrow(/unknown clue "ghost"/);
  });

  it("rejects an undeclared variable", () => {
    const bad = clone();
    bad.endings[0].requires = { is: { suspected: "marisol" } };
    expect(() => validateStory(bad)).toThrow(/undeclared variable "suspected"/);
  });

  it("rejects a value the variable never declares", () => {
    const bad = clone();
    bad.endings[0].requires = { is: { accused: "hal" } };
    expect(() => validateStory(bad)).toThrow(/not a declared value/);
  });

  it("rejects a clue nothing in the story ever grants", () => {
    const bad = clone();
    bad.clues!.ghost = { id: "ghost", title: "Never found" };
    expect(() => validateStory(bad)).toThrow(/never found anywhere/);
  });

  it("rejects a variable value no choice ever sets", () => {
    const bad = clone();
    bad.vars!.accused.values.push("hal");
    expect(() => validateStory(bad)).toThrow(/no choice ever sets/);
  });
});
