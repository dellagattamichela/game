import { describe, expect, it } from "vitest";
import { createGame, effectiveCost, resolveEnding, sceneView, totalStars } from "@/engine/engine";
import { mulberry32 } from "@/engine/rng";
import { enumerateRuns, sampleRun } from "@/engine/simulate";
import { validateStory } from "@/engine/validate";
import type { GameState, Story } from "@/engine/types";
import { STORIES, requireStory } from ".";

const PLAYERS = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Bo" },
  { id: "p3", name: "Cy" },
  { id: "p4", name: "Di" },
];

type CrisisSample = { sceneId: string; top: number; solo: boolean; pooled: boolean };

/** Records, for every crisis reached, whether its priciest option was in reach. */
function crisisWatcher(story: Story) {
  const samples: CrisisSample[] = [];
  const onScene = (state: GameState) => {
    const scene = story.scenes[state.sceneId];
    if (scene.type !== "crisis") return;
    const top = Math.max(...scene.choices.map((c) => effectiveCost(story, state, scene, c)));
    samples.push({
      sceneId: state.sceneId,
      top,
      solo: sceneView(story, state).spotlight.stars >= top,
      pooled: totalStars(state) >= top,
    });
  };
  return { samples, onScene };
}

describe("shipped stories", () => {
  it("all validate", () => {
    expect(STORIES.length).toBeGreaterThan(1);
    for (const story of STORIES) expect(() => validateStory(story)).not.toThrow();
  });

  it("both stories are registered", () => {
    expect(requireStory("the-pilot").title).toBe("The Pilot");
    expect(requireStory("stranded").title).toBe("Stranded");
  });
});

describe("the-pilot", () => {
  const story = requireStory("the-pilot");
  const watcher = crisisWatcher(story);
  const runs = enumerateRuns(story, PLAYERS, Number.POSITIVE_INFINITY, watcher.onScene);

  it("every path reaches an ending", () => {
    expect(runs.length).toBeGreaterThan(1000);
    for (const run of runs) expect(run.endingId).toBeTruthy();
  });

  it("every ending is reachable", () => {
    const reached = new Set(runs.map((r) => r.endingId));
    for (const ending of story.endings) {
      expect(reached, `ending "${ending.id}" is unreachable`).toContain(ending.id);
    }
  });

  it("every mishap is reachable", () => {
    const seen = new Set(runs.flatMap((r) => r.mishaps));
    for (const id of Object.keys(story.mishaps ?? {})) {
      expect(seen, `mishap "${id}" is unreachable`).toContain(id);
    }
  });

  it("the gates are neither decoration nor a wall", () => {
    const solo = watcher.samples.filter((s) => s.solo).length / watcher.samples.length;
    expect(solo).toBeGreaterThan(0.15);
    expect(solo).toBeLessThan(0.7);
  });

  it("mishap surcharges raise the cost of later crises", () => {
    const later = watcher.samples.filter((s) => s.sceneId === "s10");
    expect([...new Set(later.map((s) => s.top))].sort()).toEqual([4, 5, 6]);
  });
});

describe("stranded", () => {
  const story = requireStory("stranded");
  const watcher = crisisWatcher(story);
  // Forty million paths, so sample. Fixed seed, so a failure is reproducible.
  const rand = mulberry32(20260916);
  const runs = Array.from({ length: 8000 }, () => sampleRun(story, PLAYERS, rand, watcher.onScene));

  it("matches the shape promised in docs/stranded-scenario-map.md", () => {
    expect(Object.keys(story.scenes)).toHaveLength(20);
    expect(Object.keys(story.clues ?? {})).toHaveLength(12);
    expect(story.endings).toHaveLength(10);
    expect(story.vars?.accused.values).toHaveLength(5);
  });

  it("every ending is reachable", () => {
    const reached = new Set(runs.map((r) => r.endingId));
    for (const ending of story.endings) {
      expect(reached, `ending "${ending.id}" is unreachable`).toContain(ending.id);
    }
  });

  it("every clue is findable", () => {
    const found = new Set(runs.flatMap((r) => r.clues));
    for (const id of Object.keys(story.clues ?? {})) {
      expect(found, `clue "${id}" can never be found`).toContain(id);
    }
  });

  it("no run can collect every clue, so a group always misses something", () => {
    const most = Math.max(...runs.map((r) => r.clues.length));
    expect(most).toBeLessThan(Object.keys(story.clues ?? {}).length);
  });

  it("every suspect can be accused, and the room can decline to accuse", () => {
    const accused = new Set(runs.map((r) => r.vars.accused ?? "(none)"));
    for (const suspect of story.vars!.accused.values) expect(accused).toContain(suspect);
    expect(accused).toContain("(none)");
  });

  it("all three gates are real decisions", () => {
    for (const sceneId of ["s9", "s11", "s17"]) {
      const at = watcher.samples.filter((s) => s.sceneId === sceneId);
      const solo = at.filter((s) => s.solo).length / at.length;
      expect(solo, `${sceneId} solo affordability`).toBeGreaterThan(0.2);
      expect(solo, `${sceneId} solo affordability`).toBeLessThan(0.8);
    }
  });
});

/**
 * Pins the ending table in docs/stranded-scenario-map.md §8. These assertions
 * are the document: if someone reorders the endings or edits a condition, the
 * row that changed is named here.
 */
describe("stranded ending matrix", () => {
  const story = requireStory("stranded");
  const STRONG = ["torn_page", "cold_store_empty"];
  const WEAK = ["marisol_alibi_broken"];

  const outcome = (clues: string[], vars: Record<string, string>) =>
    resolveEnding(story, { ...createGame(story, PLAYERS, 1), clues, vars }).id;

  it("names and proves and rescues", () => {
    expect(outcome(STRONG, { accused: "marisol", found_captain: "yes" })).toBe("perfect");
  });

  it("separates the rescue from the proof", () => {
    expect(outcome(WEAK, { accused: "marisol", found_captain: "yes" })).toBe("rescued_and_named");
    expect(outcome(STRONG, { accused: "marisol" })).toBe("airtight_too_late");
    expect(outcome([], { accused: "marisol" })).toBe("she_walks");
  });

  it("lets the captain supply the answer when the room got it wrong", () => {
    expect(outcome(STRONG, { accused: "brann", found_captain: "yes" })).toBe("captain_explains");
    expect(outcome([], { found_captain: "yes" })).toBe("found_never_knew");
  });

  it("gives each wrong accusation its own consequence", () => {
    expect(outcome([], { accused: "brann" })).toBe("ruined_brann");
    expect(outcome([], { accused: "okonjo" })).toBe("ruined_okonjo");
    expect(outcome([], { accused: "teddy" })).toBe("ruined_bystander");
    expect(outcome([], { accused: "hal" })).toBe("ruined_bystander");
  });

  it("falls through to adrift when nothing was concluded", () => {
    expect(outcome(["scuffed_deck"], {})).toBe("adrift");
  });

  it("requires corroboration, not just the page, for the best ending", () => {
    // torn_page alone is the weak tier: it names her, it does not place her.
    expect(outcome(["torn_page"], { accused: "marisol", found_captain: "yes" })).toBe(
      "rescued_and_named",
    );
  });
});
