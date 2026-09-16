/**
 * Star economy report for a story.
 *
 *   npm run balance            # the-pilot, 4 players
 *   npm run balance -- the-pilot 6
 *
 * Walks every combination of choices through a story and reports, per crisis
 * scene, how often the priciest option is within reach. Tuning a story by
 * playing it is slow and only ever samples a few paths; this samples all of them.
 *
 * What to look for:
 *   - "spotlight alone" near 100% means the gate is decoration.
 *   - "spotlight alone" near 0% means the gate is a wall.
 *   - the gap between the two numbers is how often the table has to chip in,
 *     which is the moment the whole mechanic exists to create.
 */
import {
  applyAction,
  createGame,
  effectiveCost,
  sceneView,
  totalStars,
} from "@/engine/engine";
import type { Action, GameState, Story } from "@/engine/types";
import { validateStory } from "@/engine/validate";

const [storyId = "the-pilot", playerCountArg = "4"] = process.argv.slice(2);
const playerCount = Number(playerCountArg);

const raw = await import(`@/stories/${storyId}.json`);
const story: Story = validateStory(raw.default);

const players = Array.from({ length: playerCount }, (_, i) => ({
  id: `p${i + 1}`,
  name: `P${i + 1}`,
}));

function apply(state: GameState, action: Action): GameState {
  const result = applyAction(story, state, action);
  if (!result.ok) throw new Error(`${action.type} rejected: ${result.message}`);
  return result.state;
}

/** Resolves one scene toward `choiceIndex`, pooling Stars if the gate needs it. */
function take(state: GameState, choiceIndex: number): GameState | null {
  const view = sceneView(story, state);
  if (view.mode === "group") {
    return state.players.reduce(
      (acc, p) => apply(acc, { type: "vote", playerId: p.id, choiceIndex }),
      state,
    );
  }

  const { cost } = view.choices[choiceIndex];
  let working = state;
  if (cost > view.spotlight.stars) {
    if (totalStars(state) < cost) return null;
    for (const donor of state.players) {
      if (donor.id === view.spotlight.id) continue;
      const need = cost - working.players[working.spotlightIndex].stars;
      if (need <= 0) break;
      const give = Math.min(need, working.players.find((p) => p.id === donor.id)!.stars);
      if (give > 0) {
        working = apply(working, {
          type: "give",
          fromId: donor.id,
          toId: view.spotlight.id,
          amount: give,
        });
      }
    }
  }
  return apply(working, { type: "choose", playerId: view.spotlight.id, choiceIndex });
}

type CrisisSample = { top: number; spotlight: number; room: number };

const samples = new Map<string, CrisisSample[]>();
const endings = new Map<string, number>();
const finalTotals: number[] = [];
let paths = 0;

function walk(state: GameState) {
  if (state.phase === "ended") {
    paths++;
    endings.set(state.endingId!, (endings.get(state.endingId!) ?? 0) + 1);
    finalTotals.push(totalStars(state));
    return;
  }

  const scene = story.scenes[state.sceneId];
  if (scene.type === "crisis") {
    const top = Math.max(...scene.choices.map((c) => effectiveCost(story, state, scene, c)));
    const list = samples.get(state.sceneId) ?? [];
    list.push({ top, spotlight: sceneView(story, state).spotlight.stars, room: totalStars(state) });
    samples.set(state.sceneId, list);
  }

  for (let i = 0; i < scene.choices.length; i++) {
    const chosen = take(state, i);
    if (chosen) walk(apply(chosen, { type: "continue", playerId: state.players[0].id }));
  }
}

walk(createGame(story, players, 99));

const stat = (xs: number[]) =>
  `min ${Math.min(...xs)}, avg ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)}, max ${Math.max(...xs)}`;
const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(0)}%`;

console.log(`\n${story.title} — ${playerCount} players, ${paths.toLocaleString()} distinct paths\n`);

for (const [sceneId, list] of samples) {
  const solo = list.filter((s) => s.spotlight >= s.top).length;
  const pooled = list.filter((s) => s.room >= s.top).length;
  console.log(`  ${sceneId}  (best option costs ${stat(list.map((s) => s.top))})`);
  console.log(`    spotlight's Stars   ${stat(list.map((s) => s.spotlight))}`);
  console.log(`    room's Stars        ${stat(list.map((s) => s.room))}`);
  console.log(`    affordable solo     ${pct(solo, list.length)}`);
  console.log(`    affordable pooled   ${pct(pooled, list.length)}`);
  console.log(`    needs the table     ${pct(pooled - solo, list.length)}\n`);
}

console.log(`  Stars left at the end: ${stat(finalTotals)}\n`);
console.log("  Endings:");
for (const [id, count] of [...endings].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${id.padEnd(14)} ${pct(count, paths).padStart(4)}`);
}
console.log();
