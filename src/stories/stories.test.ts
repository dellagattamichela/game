import { describe, expect, it } from "vitest";
import { applyAction, createGame, effectiveCost, sceneView, totalStars } from "@/engine/engine";
import { validateStory } from "@/engine/validate";
import type { Action, GameState, Story } from "@/engine/types";
import { STORIES, requireStory } from ".";
import thePilot from "./the-pilot.json";

const PLAYERS = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Bo" },
  { id: "p3", name: "Cy" },
  { id: "p4", name: "Di" },
];

function apply(story: Story, state: GameState, action: Action): GameState {
  const result = applyAction(story, state, action);
  if (!result.ok) throw new Error(`${action.type} rejected: ${result.message}`);
  return result.state;
}

/**
 * Drives one scene toward `choiceIndex`, whatever its mode, and stops on the
 * result beat. Group scenes are resolved by a unanimous vote, which keeps the
 * path enumeration below tractable.
 *
 * Returns null when the choice is gated beyond what the whole room could pay,
 * so the caller can tell "unaffordable" apart from "rejected for another reason".
 */
function take(story: Story, state: GameState, choiceIndex: number): GameState | null {
  const view = sceneView(story, state);
  if (view.mode === "group") {
    return state.players.reduce(
      (acc, p) => apply(story, acc, { type: "vote", playerId: p.id, choiceIndex }),
      state,
    );
  }

  const cost = view.choices[choiceIndex].cost;
  const spotlight = view.spotlight;
  let working = state;

  // Pool Stars from the rest of the room, exactly as players would at a gate.
  if (cost > spotlight.stars) {
    if (totalStars(state) < cost) return null;
    for (const donor of state.players) {
      if (donor.id === spotlight.id) continue;
      const need = cost - working.players[working.spotlightIndex].stars;
      if (need <= 0) break;
      const give = Math.min(need, working.players.find((p) => p.id === donor.id)!.stars);
      if (give > 0) {
        working = apply(story, working, { type: "give", fromId: donor.id, toId: spotlight.id, amount: give });
      }
    }
  }

  return apply(story, working, { type: "choose", playerId: spotlight.id, choiceIndex });
}

type PathOutcome = {
  endingId: string;
  mishaps: string[];
  /** Per crisis scene: what the priciest option cost and whether it was reachable. */
  crises: { sceneId: string; topCost: number; spotlightCouldPay: boolean; roomCouldPay: boolean }[];
};

/** Walks every combination of choices through the story. */
function enumeratePaths(story: Story, limit = 200_000): PathOutcome[] {
  const outcomes: PathOutcome[] = [];

  const walk = (state: GameState, crises: PathOutcome["crises"]) => {
    if (outcomes.length >= limit) return;
    if (state.phase === "ended") {
      outcomes.push({ endingId: state.endingId!, mishaps: state.mishaps, crises });
      return;
    }

    const view = sceneView(story, state);
    const scene = story.scenes[state.sceneId];
    const nextCrises = view.isCrisis
      ? [
          ...crises,
          {
            sceneId: state.sceneId,
            topCost: Math.max(...scene.choices.map((c) => effectiveCost(story, state, scene, c))),
            spotlightCouldPay:
              view.spotlight.stars >=
              Math.max(...scene.choices.map((c) => effectiveCost(story, state, scene, c))),
            roomCouldPay:
              totalStars(state) >=
              Math.max(...scene.choices.map((c) => effectiveCost(story, state, scene, c))),
          },
        ]
      : crises;

    for (let i = 0; i < scene.choices.length; i++) {
      const chosen = take(story, state, i);
      if (!chosen) continue; // unaffordable even with the whole room pooling
      walk(apply(story, chosen, { type: "continue", playerId: state.players[0].id }), nextCrises);
    }
  };

  walk(createGame(story, PLAYERS, 99), []);
  return outcomes;
}

describe("shipped stories", () => {
  it("all validate", () => {
    expect(STORIES.length).toBeGreaterThan(0);
    for (const story of STORIES) expect(() => validateStory(story)).not.toThrow();
  });

  it("the-pilot is registered and matches its file", () => {
    expect(requireStory("the-pilot").title).toBe("The Pilot");
    expect(thePilot.id).toBe("the-pilot");
  });
});

describe("the-pilot playability", () => {
  const story = requireStory("the-pilot");
  const paths = enumeratePaths(story);

  it("every path reaches an ending", () => {
    expect(paths.length).toBeGreaterThan(1000);
    for (const p of paths) expect(p.endingId).toBeTruthy();
  });

  it("every ending in the file is reachable", () => {
    const reached = new Set(paths.map((p) => p.endingId));
    for (const ending of story.endings) {
      expect(reached, `ending "${ending.id}" is unreachable`).toContain(ending.id);
    }
  });

  it("every mishap in the file is reachable", () => {
    const seen = new Set(paths.flatMap((p) => p.mishaps));
    for (const id of Object.keys(story.mishaps ?? {})) {
      expect(seen, `mishap "${id}" is unreachable`).toContain(id);
    }
  });

  it("the priciest crisis option is sometimes out of reach, so the gate has teeth", () => {
    const crises = paths.flatMap((p) => p.crises);
    const soloAffordable = crises.filter((c) => c.spotlightCouldPay).length / crises.length;
    // Neither always affordable (the gate is decoration) nor never (it is a wall).
    // Measured at 33% for both crises with a 4-player room; see `npm run balance`.
    expect(soloAffordable).toBeGreaterThan(0.15);
    expect(soloAffordable).toBeLessThan(0.7);
  });

  it("pooling the room's Stars opens gates the spotlight alone cannot", () => {
    const crises = paths.flatMap((p) => p.crises);
    const needsHelp = crises.filter((c) => !c.spotlightCouldPay && c.roomCouldPay).length;
    // The "who's going to save us?" moment has to be the common case, not a rarity.
    expect(needsHelp / crises.length).toBeGreaterThan(0.4);
  });

  it("mishap surcharges raise later crisis costs", () => {
    const secondCrisis = paths.flatMap((p) => p.crises.filter((c) => c.sceneId === "s10"));
    const costs = new Set(secondCrisis.map((c) => c.topCost));
    // Base 4, plus 1 per surcharge mishap collected earlier.
    expect([...costs].sort()).toEqual([4, 5, 6]);
  });
});
