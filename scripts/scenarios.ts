/**
 * Scenario coverage report for a story.
 *
 *   npm run scenarios                    # the-pilot, 4 players
 *   npm run scenarios -- stranded 5
 *
 * Answers the questions you cannot answer by reading a story file:
 *   - can every ending actually be reached, or is one of them dead?
 *   - is every clue findable, and how often is it found?
 *   - how many clues does a run finish with?
 *   - is each crisis gate a real decision, decoration, or a wall?
 *
 * Small stories are walked exhaustively. Stranded has on the order of forty
 * million distinct paths, so past a cap this samples random playthroughs from a
 * fixed seed instead: reproducible, and enough to catch the failure that
 * matters, which is an outcome nothing can ever reach.
 *
 * One caveat when reading the percentages below: sampling picks uniformly among
 * the options a table *could* take, which is not how a table actually plays.
 * These numbers describe the shape of the possibility space, not the odds of a
 * real group getting a given ending.
 */
import { effectiveCost, sceneView, totalStars } from "@/engine/engine";
import { mulberry32 } from "@/engine/rng";
import { enumerateRuns, estimatePaths, sampleRun } from "@/engine/simulate";
import { validateStory } from "@/engine/validate";
import type { GameState, Story } from "@/engine/types";

const EXHAUSTIVE_CAP = 300_000;
const SAMPLES = 60_000;

const [storyId = "the-pilot", playerCountArg = "4", passRateArg = "0.7"] = process.argv.slice(2);
const playerCount = Number(playerCountArg);
/** How often the simulated player passes a skill test. */
const passRate = Number(passRateArg);

const raw = await import(`@/stories/${storyId}.json`);
const story: Story = validateStory(raw.default);

const players = Array.from({ length: playerCount }, (_, i) => ({
  id: `p${i + 1}`,
  name: `P${i + 1}`,
}));

type CrisisSample = { top: number; spotlight: number; room: number };
const crises = new Map<string, CrisisSample[]>();

const onScene = (state: GameState) => {
  const scene = story.scenes[state.sceneId];
  if (scene.type !== "crisis") return;
  const top = Math.max(...scene.choices.map((c) => effectiveCost(story, state, scene, c)));
  const list = crises.get(state.sceneId) ?? [];
  list.push({ top, spotlight: sceneView(story, state).spotlight.stars, room: totalStars(state) });
  crises.set(state.sceneId, list);
};

const exhaustive = estimatePaths(story, EXHAUSTIVE_CAP) <= EXHAUSTIVE_CAP;
const finished: GameState[] = exhaustive
  ? enumerateRuns(story, players, Number.POSITIVE_INFINITY, onScene)
  : (() => {
      const rand = mulberry32(20260916);
      return Array.from({ length: SAMPLES }, () =>
        sampleRun(story, players, rand, onScene, passRate),
      );
    })();

const runs = finished.length;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const tally = <T>(items: T[], key: (item: T) => string[]) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const k of key(item)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
};

const pct = (n: number) => `${((n / runs) * 100).toFixed(1)}%`;
const stat = (xs: number[]) =>
  `min ${Math.min(...xs)}, avg ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)}, max ${Math.max(...xs)}`;
const bar = (n: number) => "█".repeat(Math.round((n / runs) * 40)).padEnd(40, "·");

const attempts = Object.values(story.scenes).flatMap((sc) => sc.choices.filter((c) => c.minigame));
console.log(`\n${story.title} — ${playerCount} players`);
if (attempts.length > 0) {
  console.log(`${attempts.length} skill tests, simulated at a ${(passRate * 100).toFixed(0)}% pass rate`);
}
console.log(
  exhaustive
    ? `${runs.toLocaleString()} distinct paths, walked exhaustively\n`
    : `${runs.toLocaleString()} random runs sampled from a fixed seed\n`,
);

if (crises.size > 0) {
  console.log("CRISIS GATES");
  for (const [sceneId, list] of crises) {
    const solo = list.filter((s) => s.spotlight >= s.top).length / list.length;
    const pooled = list.filter((s) => s.room >= s.top).length / list.length;
    console.log(`  ${sceneId}  best option costs ${stat(list.map((s) => s.top))}`);
    console.log(
      `        spotlight holds ${stat(list.map((s) => s.spotlight))} · room holds ${stat(list.map((s) => s.room))}`,
    );
    console.log(
      `        affordable alone ${(solo * 100).toFixed(0)}%` +
        ` · pooled ${(pooled * 100).toFixed(0)}%` +
        ` · needs the table ${((pooled - solo) * 100).toFixed(0)}%`,
    );
  }
  console.log();
}

const clueIds = Object.keys(story.clues ?? {});
if (clueIds.length > 0) {
  const found = tally(finished, (s) => s.clues);
  console.log(
    `CLUES FOUND  (per run: ${stat(finished.map((s) => s.clues.length))} of ${clueIds.length})`,
  );
  for (const [id, n] of clueIds
    .map((id) => [id, found.get(id) ?? 0] as const)
    .sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bar(n)} ${pct(n).padStart(6)}  ${id}${n === 0 ? "  ← NEVER FOUND" : ""}`);
  }
  console.log();
}

for (const key of Object.keys(story.vars ?? {})) {
  const values = tally(finished, (s) => (s.vars[key] ? [s.vars[key]] : []));
  console.log(`VARIABLE  ${key}`);
  for (const [value, n] of [...values].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bar(n)} ${pct(n).padStart(6)}  ${value}`);
  }
  const unset = runs - [...values.values()].reduce((a, b) => a + b, 0);
  if (unset > 0) console.log(`  ${bar(unset)} ${pct(unset).padStart(6)}  (unset)`);
  console.log();
}

console.log("ENDINGS");
const reached = tally(finished, (s) => [s.endingId!]);
let dead = 0;
for (const ending of story.endings) {
  const n = reached.get(ending.id) ?? 0;
  if (n === 0) dead++;
  console.log(`  ${bar(n)} ${pct(n).padStart(6)}  ${ending.id}${n === 0 ? "  ← UNREACHABLE" : ""}`);
}
console.log();

if (dead > 0) {
  console.log(`${dead} ending(s) never reached. Fix the story or the conditions.\n`);
  process.exit(1);
}
