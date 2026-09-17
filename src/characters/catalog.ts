/**
 * The parts list. This is the placeholder art, and the only file that has to
 * change when real drawings arrive.
 *
 * Every part is a handful of rectangles in the 64×64 sprite space described in
 * `types.ts`, tagged with one of four key shades rather than a colour. The
 * colour arrives at draw time from whichever palette the player picked, which
 * is the doc's palette-swapping trick: six skin tones and eight hair colours
 * out of one drawing each.
 *
 * Nothing here is meant to be pretty. It is meant to be *structurally* what the
 * real thing will be, so that swapping a `shapes` array for an image is the
 * whole job.
 */
import type { HairPart, Palette, Part, Shade } from "./types";

/** Terse rectangle helper, so a part reads as a shape list and not as markup. */
const r = (x: number, y: number, w: number, h: number, shade: Shade = "base") => ({
  x,
  y,
  w,
  h,
  shade,
});

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const p = (
  id: string,
  title: string,
  base: string,
  shadow: string,
  light: string,
  line: string,
): Palette => ({ id, title, base, shadow, light, line });

export const SKIN_TONES: Palette[] = [
  p("porcelain", "Porcelain", "#f3d3bd", "#d9ac91", "#fde8da", "#8a5c45"),
  p("fair", "Fair", "#eec091", "#cf9a6c", "#fadcb9", "#7d5030"),
  p("olive", "Olive", "#d9a066", "#b27a45", "#efc793", "#6d4322"),
  p("tan", "Tan", "#b97a56", "#8e573a", "#d59c78", "#59301c"),
  p("brown", "Brown", "#8d5524", "#6a3c17", "#ab6f36", "#3f2210"),
  p("deep", "Deep", "#5c3317", "#3f200d", "#7a4a26", "#241206"),
];

export const HAIR_COLORS: Palette[] = [
  p("black", "Black", "#2b2b33", "#17171c", "#454552", "#101014"),
  p("brown", "Brown", "#6b4423", "#4a2d15", "#8a5c33", "#2e1c0d"),
  p("chestnut", "Chestnut", "#8b5a2b", "#633d1b", "#ab7742", "#3d2411"),
  p("blond", "Blond", "#d9b26a", "#b18c46", "#f0d59a", "#7a5d27"),
  p("ginger", "Ginger", "#c1572a", "#95401d", "#dd7c4c", "#61280f"),
  p("silver", "Silver", "#c9cdd4", "#9aa0a9", "#e8ebef", "#6d737b"),
  p("teal", "Teal", "#2f7f7a", "#1d5b57", "#4aa39c", "#123a37"),
  p("violet", "Violet", "#7a4fa3", "#573571", "#9c72c4", "#37204a"),
];

export const EYE_COLORS: Palette[] = [
  p("brown", "Brown", "#6b4423", "#472b13", "#ffffff", "#1a1a1a"),
  p("hazel", "Hazel", "#a07340", "#6f4d28", "#ffffff", "#1a1a1a"),
  p("green", "Green", "#4a7c4e", "#2f5432", "#ffffff", "#1a1a1a"),
  p("blue", "Blue", "#3f6fa3", "#284a6f", "#ffffff", "#1a1a1a"),
  p("grey", "Grey", "#6e7780", "#4a5158", "#ffffff", "#1a1a1a"),
];

/**
 * Garment colours come from a hue list rather than hand-picked hex, because a
 * flat-dyed cloth really is one hue at three lightnesses — unlike skin and
 * hair, where the shades are a drawing decision and belong written out.
 */
export const TOP_COLORS: Palette[] = [
  ["ink", "Ink", 230, 12],
  ["red", "Red", 4, 62],
  ["orange", "Orange", 28, 68],
  ["yellow", "Yellow", 46, 70],
  ["green", "Green", 140, 45],
  ["teal", "Teal", 182, 48],
  ["blue", "Blue", 214, 55],
  ["purple", "Purple", 280, 45],
].map(([id, title, hue, sat]) =>
  p(
    id as string,
    title as string,
    `hsl(${hue} ${sat}% 42%)`,
    `hsl(${hue} ${sat}% 30%)`,
    `hsl(${hue} ${Math.max(10, (sat as number) - 15)}% 62%)`,
    `hsl(${hue} ${sat}% 18%)`,
  ),
);

/** For parts that are not a colour choice: spectacles, headphone plastic, lips. */
export const INK: Palette = p("ink", "Ink", "#2a2a30", "#17171b", "#f2f2f4", "#111114");

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/** Ears, neck and shoulders are the same under every head, so they are shared. */
const BUST = [
  r(17, 26, 3, 7),
  r(44, 26, 3, 7),
  r(27, 43, 10, 8),
  r(27, 43, 10, 3, "shadow"),
  r(10, 51, 44, 13),
];

/**
 * The doc's "body type" choice. Both types keep the same shoulder envelope so
 * that every top fits every body — the difference is the jaw, which is the part
 * you actually read at portrait size.
 */
export const BODIES: Part[] = [
  {
    id: "square",
    title: "Square jaw",
    shapes: [r(20, 12, 24, 32), r(24, 16, 16, 4, "light"), r(20, 40, 24, 2, "shadow"), ...BUST],
  },
  {
    id: "soft",
    title: "Soft jaw",
    shapes: [
      r(20, 12, 24, 20),
      r(22, 32, 20, 12),
      r(24, 16, 16, 4, "light"),
      r(22, 40, 20, 2, "shadow"),
      ...BUST,
    ],
  },
];

export const HAIRS: HairPart[] = [
  { id: "buzz", title: "Buzz", back: [], shapes: [r(19, 10, 26, 6), r(19, 16, 3, 5), r(42, 16, 3, 5)] },
  {
    id: "fringe",
    title: "Fringe",
    back: [],
    shapes: [r(19, 9, 26, 9), r(22, 10, 8, 3, "light"), r(18, 14, 3, 8), r(43, 14, 3, 8)],
  },
  {
    id: "bob",
    title: "Bob",
    back: [r(16, 12, 32, 26), r(16, 30, 32, 8, "shadow")],
    shapes: [r(18, 9, 28, 9), r(24, 10, 9, 3, "light")],
  },
  {
    id: "long",
    title: "Long",
    back: [r(14, 10, 36, 46), r(14, 40, 36, 16, "shadow")],
    shapes: [r(18, 8, 28, 10), r(23, 9, 10, 3, "light")],
  },
  {
    id: "ponytail",
    title: "Ponytail",
    back: [r(14, 12, 36, 18), r(46, 20, 8, 26), r(46, 36, 8, 10, "shadow")],
    shapes: [r(19, 9, 26, 8), r(24, 10, 8, 3, "light")],
  },
  {
    id: "curly",
    title: "Curly",
    back: [r(16, 12, 32, 16)],
    shapes: [r(17, 7, 30, 11), r(14, 12, 4, 9), r(46, 12, 4, 9), r(21, 8, 7, 3, "light")],
  },
];

export const BROWS: Part[] = [
  { id: "straight", title: "Straight", shapes: [r(24, 24, 7, 2, "line"), r(33, 24, 7, 2, "line")] },
  { id: "raised", title: "Raised", shapes: [r(24, 22, 7, 2, "line"), r(33, 25, 7, 2, "line")] },
  { id: "thick", title: "Thick", shapes: [r(23, 23, 9, 3, "line"), r(32, 23, 9, 3, "line")] },
  { id: "fine", title: "Fine", shapes: [r(25, 24, 5, 1, "line"), r(34, 24, 5, 1, "line")] },
];

/** `light` is the white of the eye, `base` the iris, `line` the lashes. */
export const EYES: Part[] = [
  {
    id: "round",
    title: "Round",
    shapes: [
      r(24, 27, 7, 1, "line"),
      r(24, 28, 7, 4, "light"),
      r(26, 29, 3, 3),
      r(33, 27, 7, 1, "line"),
      r(33, 28, 7, 4, "light"),
      r(35, 29, 3, 3),
    ],
  },
  {
    id: "sleepy",
    title: "Sleepy",
    shapes: [
      r(24, 29, 7, 1, "line"),
      r(24, 30, 7, 2, "light"),
      r(26, 30, 3, 2),
      r(33, 29, 7, 1, "line"),
      r(33, 30, 7, 2, "light"),
      r(35, 30, 3, 2),
    ],
  },
  {
    id: "sparkly",
    title: "Sparkly",
    shapes: [
      r(24, 27, 7, 1, "line"),
      r(24, 28, 7, 5, "light"),
      r(26, 29, 4, 4),
      r(26, 29, 1, 1, "light"),
      r(33, 27, 7, 1, "line"),
      r(33, 28, 7, 5, "light"),
      r(35, 29, 4, 4),
      r(35, 29, 1, 1, "light"),
    ],
  },
  {
    id: "narrow",
    title: "Narrow",
    shapes: [
      r(24, 27, 7, 2, "line"),
      r(24, 29, 7, 3, "light"),
      r(26, 30, 3, 2),
      r(33, 27, 7, 2, "line"),
      r(33, 29, 7, 3, "light"),
      r(35, 30, 3, 2),
    ],
  },
];

/** Drawn in `INK`, so `light` is teeth and `line` is the mouth itself. */
export const MOUTHS: Part[] = [
  { id: "smile", title: "Smile", shapes: [r(28, 38, 8, 1, "line"), r(27, 37, 1, 1, "line"), r(36, 37, 1, 1, "line")] },
  { id: "grin", title: "Grin", shapes: [r(27, 37, 10, 3, "line"), r(28, 38, 8, 1, "light")] },
  { id: "flat", title: "Flat", shapes: [r(28, 38, 8, 1, "line")] },
  { id: "open", title: "Open", shapes: [r(29, 37, 6, 4, "line"), r(30, 38, 4, 1, "light")] },
];

export const TOPS: Part[] = [
  { id: "tee", title: "T-shirt", shapes: [r(10, 52, 44, 12), r(26, 52, 12, 3, "shadow")] },
  {
    id: "hoodie",
    title: "Hoodie",
    shapes: [r(8, 51, 48, 13), r(18, 48, 28, 5, "shadow"), r(30, 56, 1, 6, "light"), r(33, 56, 1, 6, "light")],
  },
  {
    id: "blazer",
    title: "Blazer",
    shapes: [r(10, 52, 44, 12), r(28, 52, 8, 12, "light"), r(24, 52, 4, 12, "shadow"), r(36, 52, 4, 12, "shadow")],
  },
  {
    id: "turtleneck",
    title: "Turtleneck",
    shapes: [r(10, 52, 44, 12), r(26, 45, 12, 8), r(26, 45, 12, 2, "shadow")],
  },
  {
    id: "apron",
    title: "Apron",
    shapes: [r(10, 52, 44, 12, "shadow"), r(24, 50, 16, 14), r(26, 48, 2, 4), r(36, 48, 2, 4)],
  },
];

/**
 * Accessories are the one layer that does not have an obvious palette, so each
 * says which it borrows: a cap is dyed like the shirt, spectacles are not dyed
 * at all.
 */
export const ACCESSORIES: Part[] = [
  {
    id: "glasses",
    title: "Glasses",
    uses: "ink",
    shapes: [
      r(23, 27, 9, 1, "line"),
      r(23, 32, 9, 1, "line"),
      r(23, 27, 1, 6, "line"),
      r(31, 27, 1, 6, "line"),
      r(32, 27, 9, 1, "line"),
      r(32, 32, 9, 1, "line"),
      r(32, 27, 1, 6, "line"),
      r(40, 27, 1, 6, "line"),
      r(31, 29, 2, 1, "line"),
    ],
  },
  { id: "cap", title: "Cap", uses: "top", shapes: [r(17, 6, 30, 7), r(14, 13, 36, 3, "shadow")] },
  {
    id: "headphones",
    title: "Headphones",
    uses: "ink",
    shapes: [r(18, 5, 28, 3, "line"), r(14, 16, 5, 11, "line"), r(45, 16, 5, 11, "line"), r(15, 18, 3, 3, "light")],
  },
  { id: "earrings", title: "Earrings", uses: "ink", shapes: [r(17, 33, 3, 3, "light"), r(44, 33, 3, 3, "light")] },
  { id: "headband", title: "Headband", uses: "top", shapes: [r(17, 13, 30, 3), r(17, 15, 30, 1, "shadow")] },
];
