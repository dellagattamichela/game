/**
 * What a character is made of.
 *
 * Stage 2 of the build plan, built as the design doc §4 describes it: stacked
 * layers, each drawn once and recoloured by palette swapping, saved as a short
 * list of choices rather than as an image.
 *
 * The art here is placeholder — flat rectangles in sprite space — but the
 * *structure* is the real one. When the drawings arrive, a part stops carrying
 * `shapes` and starts carrying an image, and nothing outside `catalog.ts` and
 * the sprite renderer has to change.
 */

/**
 * The sprite grid. 64, not the doc's suggested 32: the doc says to follow the
 * reference art if it differs, and `docs/reference/admin.png` is a portrait
 * bust at roughly 64 logical pixels. Every coordinate below is in this space,
 * so real 64×64 art lines up with the placeholders without moving anything.
 */
export const SPRITE_SIZE = 64;

/**
 * Stacked back to front. Matches the doc's table minus "outfit bottom", which
 * the doc itself rules out: only the torso and head are ever visible.
 *
 * Skin is not a layer here even though the doc lists one — the doc describes it
 * as a colour swap, and that is what it is: the palette the body is drawn in.
 */
export const LAYER_ORDER = [
  "hairBack",
  "body",
  "top",
  "eyes",
  "brows",
  "mouth",
  "hairFront",
  "accessory",
] as const;

export type LayerId = (typeof LAYER_ORDER)[number];

/**
 * The four "key" shades every part is drawn in, per the doc's palette-swapping
 * note. One drawing in four shades becomes as many colourways as there are
 * palettes, which is why the catalog has six skin tones and eight hair colours
 * without six or eight drawings of anything.
 */
export type Shade = "base" | "shadow" | "light" | "line";

/** One rectangle of placeholder art, in sprite space. */
export type Shape = { x: number; y: number; w: number; h: number; shade: Shade };

export type Palette = Record<Shade, string> & { id: string; title: string };

/** Which palette a part is drawn in. Most layers have an obvious one. */
export type PaletteSlot = "skin" | "hair" | "eye" | "top" | "ink";

export type Part = {
  /**
   * Stable id, used in saved characters.
   *
   * The doc's example saves indices (`"hair": 7`). Ids instead, because an
   * index is a promise never to reorder or insert a part, and every saved
   * character in existence breaks the first time someone does.
   */
  id: string;
  title: string;
  shapes: Shape[];
  /** Overrides the layer's usual palette. Only accessories need it. */
  uses?: PaletteSlot;
};

/**
 * A hair style is one choice that draws into two layers — the doc's "hair
 * (back)" is only used by long styles, so it belongs to the style rather than
 * being a separate thing to pick.
 */
export type HairPart = Part & { back: Shape[] };

/**
 * A character, as saved and sent. Small enough to sit in a room payload and go
 * out to every player, which is the whole point: nobody ever uploads an image.
 */
export type Character = {
  body: string;
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  eyeColor: string;
  brows: string;
  mouth: string;
  top: string;
  topColor: string;
  /** Null is a real choice here, not a missing value. */
  accessory: string | null;
};

/** The parts of a character a player picks, in the order the creator shows them. */
export const CHARACTER_FIELDS = [
  "body",
  "skin",
  "hair",
  "hairColor",
  "brows",
  "eyes",
  "eyeColor",
  "mouth",
  "top",
  "topColor",
  "accessory",
] as const;

export type CharacterField = (typeof CHARACTER_FIELDS)[number];
