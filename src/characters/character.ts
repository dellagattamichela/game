/**
 * Character rules, as pure functions.
 *
 * Same discipline as the engine and the rooms layer: no I/O, no `Math.random()`
 * — `randomCharacter` takes a seed — and nothing here mutates its input. That
 * matters more than it looks: a character travels from a browser through a
 * Server Action into a room that every other browser reads, so "the same data
 * always draws the same sprite" has to hold on machines that never met.
 */
import { hashString, pickIndex } from "@/engine/rng";
import {
  ACCESSORIES,
  BODIES,
  BROWS,
  EYES,
  EYE_COLORS,
  HAIRS,
  HAIR_COLORS,
  MOUTHS,
  SKIN_TONES,
  TOPS,
  TOP_COLORS,
} from "./catalog";
import type { Character, CharacterField, Palette, Part } from "./types";

/** Everything a player can pick, in the order the creator lays it out. */
export const CHOICES: Record<
  CharacterField,
  { title: string; group: Group; options: readonly { id: string; title: string }[]; optional?: boolean }
> = {
  body: { title: "Build", group: "Body", options: BODIES },
  skin: { title: "Skin", group: "Body", options: SKIN_TONES },
  hair: { title: "Hair", group: "Hair", options: HAIRS },
  hairColor: { title: "Hair colour", group: "Hair", options: HAIR_COLORS },
  brows: { title: "Eyebrows", group: "Face", options: BROWS },
  eyes: { title: "Eyes", group: "Face", options: EYES },
  eyeColor: { title: "Eye colour", group: "Face", options: EYE_COLORS },
  mouth: { title: "Mouth", group: "Face", options: MOUTHS },
  top: { title: "Top", group: "Outfit", options: TOPS },
  topColor: { title: "Top colour", group: "Outfit", options: TOP_COLORS },
  // The only field where "none" is a real answer, which is why it is nullable
  // rather than having a "none" part in the catalog: nothing to draw is not a
  // thing to draw.
  accessory: { title: "Accessory", group: "Extras", options: ACCESSORIES, optional: true },
};

/** The creator's side tabs, per the design doc's creator screen. */
export const GROUPS = ["Body", "Face", "Hair", "Outfit", "Extras"] as const;
export type Group = (typeof GROUPS)[number];

export function fieldsInGroup(group: Group): CharacterField[] {
  return (Object.keys(CHOICES) as CharacterField[]).filter((f) => CHOICES[f].group === group);
}

/** The first option of every layer. Plain, and a fine thing to edit from. */
export const DEFAULT_CHARACTER: Character = {
  body: BODIES[0].id,
  skin: SKIN_TONES[0].id,
  hair: HAIRS[0].id,
  hairColor: HAIR_COLORS[0].id,
  eyes: EYES[0].id,
  eyeColor: EYE_COLORS[0].id,
  brows: BROWS[0].id,
  mouth: MOUTHS[0].id,
  top: TOPS[0].id,
  topColor: TOP_COLORS[0].id,
  accessory: null,
};

const find = <T extends { id: string }>(list: readonly T[], id: string | null | undefined) =>
  list.find((item) => item.id === id);

/**
 * Coerce anything into a drawable character.
 *
 * A saved character outlives the catalog that made it: a part can be renamed,
 * dropped, or replaced by better art under a new id. When that happens the old
 * choice falls back to the default for that layer rather than rendering a hole
 * or throwing — a player's hair reverting is a small disappointment, and a
 * lobby that cannot draw one of its players is a broken room.
 */
export function normalizeCharacter(input: unknown): Character {
  const raw = (input ?? {}) as Partial<Record<CharacterField, unknown>>;
  const pick = (field: CharacterField, list: readonly { id: string }[]) =>
    find(list, typeof raw[field] === "string" ? (raw[field] as string) : undefined)?.id ??
    DEFAULT_CHARACTER[field];

  return {
    body: pick("body", BODIES),
    skin: pick("skin", SKIN_TONES),
    hair: pick("hair", HAIRS),
    hairColor: pick("hairColor", HAIR_COLORS),
    eyes: pick("eyes", EYES),
    eyeColor: pick("eyeColor", EYE_COLORS),
    brows: pick("brows", BROWS),
    mouth: pick("mouth", MOUTHS),
    top: pick("top", TOPS),
    topColor: pick("topColor", TOP_COLORS),
    // Unknown accessory ids become "none", which is a legal state anyway.
    accessory: find(ACCESSORIES, raw.accessory as string | undefined)?.id ?? null,
  } as Character;
}

/**
 * A character from a seed. Used by the creator's Randomize button and, more
 * importantly, to give every player a face the moment they sit down — a lobby
 * of identical silhouettes waiting to be filled in is a worse first impression
 * than a lobby of strangers.
 */
export function randomCharacter(seed: number): Character {
  const at = <T extends { id: string }>(list: readonly T[], key: string) =>
    list[pickIndex(seed, key, list.length)].id;

  return {
    body: at(BODIES, "body"),
    skin: at(SKIN_TONES, "skin"),
    hair: at(HAIRS, "hair"),
    hairColor: at(HAIR_COLORS, "hairColor"),
    eyes: at(EYES, "eyes"),
    eyeColor: at(EYE_COLORS, "eyeColor"),
    brows: at(BROWS, "brows"),
    mouth: at(MOUTHS, "mouth"),
    top: at(TOPS, "top"),
    topColor: at(TOP_COLORS, "topColor"),
    // Roughly a third of people wear something, so a room is not all glasses.
    accessory:
      pickIndex(seed, "hasAccessory", 3) === 0 ? at(ACCESSORIES, "accessory") : null,
  };
}

/**
 * Step one layer forward or back. This is the doc's pair of arrow buttons next
 * to the preview, and it is the fastest way to see what a layer can do without
 * reading a grid of labels.
 */
export function cycle(character: Character, field: CharacterField, step: number): Character {
  const { options, optional } = CHOICES[field];
  // An optional layer cycles through "nothing" as if it were one more option.
  const ids: (string | null)[] = optional ? [null, ...options.map((o) => o.id)] : options.map((o) => o.id);
  const at = ids.indexOf(character[field] ?? null);
  const next = ids[(((at + step) % ids.length) + ids.length) % ids.length];

  return { ...character, [field]: next };
}

/** The palettes, exposed so the sprite renderer and the swatch grid agree. */
export const PALETTES: Record<"skin" | "hair" | "eye" | "top", readonly Palette[]> = {
  skin: SKIN_TONES,
  hair: HAIR_COLORS,
  eye: EYE_COLORS,
  top: TOP_COLORS,
};

/** Look a part up for drawing. Callers have already normalised, so this hits. */
export function partFor(field: CharacterField, id: string | null): Part | undefined {
  if (id === null) return undefined;
  return CHOICES[field].options.find((o) => o.id === id) as Part | undefined;
}

/**
 * The face of someone in the story's cast.
 *
 * Derived from their id so a given character looks the same in every run and
 * on every screen, with whatever the writer pinned laid over the top. That way
 * introducing a man who says two sentences costs one line of JSON, and pinning
 * the two things that matter about him costs two more.
 */
export function castCharacter(castId: string, look: Record<string, string> = {}): Character {
  return normalizeCharacter({ ...randomCharacter(hashString(castId)), ...look });
}
