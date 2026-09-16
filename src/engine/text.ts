/**
 * Placeholder substitution for scene and result text.
 *
 * Supported placeholders (see design doc §8):
 *   {spotlight}     the player making the choice this scene
 *   {randomPlayer}  someone other than the spotlight, stable for a given scene
 *   {everyone}      a comma list of all player names
 *
 * Unknown placeholders are left untouched rather than blanked, so a typo in a
 * story file shows up as "{sptolight}" on screen instead of silently vanishing.
 */
import { pickIndex } from "./rng";
import type { PlayerState } from "./types";

export type TextContext = {
  players: PlayerState[];
  spotlightIndex: number;
  sceneId: string;
  seed: number;
};

/**
 * Chooses the {randomPlayer} for a scene. Excludes the spotlight player, since
 * "{spotlight} blames {randomPlayer}" reads badly when they are the same person.
 * Falls back to the spotlight only in a one-player room.
 */
export function randomPlayerFor(ctx: TextContext): PlayerState {
  const others = ctx.players.filter((_, i) => i !== ctx.spotlightIndex);
  if (others.length === 0) return ctx.players[ctx.spotlightIndex];
  return others[pickIndex(ctx.seed, `randomPlayer:${ctx.sceneId}`, others.length)];
}

export function formatNames(players: PlayerState[]): string {
  const names = players.map((p) => p.name);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function resolveText(template: string, ctx: TextContext): string {
  if (!template.includes("{")) return template;

  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    switch (token) {
      case "spotlight":
        return ctx.players[ctx.spotlightIndex]?.name ?? match;
      case "randomPlayer":
        return randomPlayerFor(ctx).name;
      case "everyone":
        return formatNames(ctx.players);
      default:
        return match;
    }
  });
}
