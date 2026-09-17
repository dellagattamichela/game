/**
 * Draws a character.
 *
 * Stacks the layers back to front and recolours each one through the palette
 * the player picked — the doc's palette swap, done at render time rather than
 * by shipping one drawing per colourway. When the real art arrives, the `rect`
 * below becomes an `image` and the layer list, the order and the palettes all
 * stay exactly as they are.
 *
 * No "use client": it is plain markup with no state, so it renders on the
 * server inside a lobby or a game table and costs the client bundle nothing.
 */
import { INK } from "@/characters/catalog";
import { PALETTES, partFor } from "@/characters/character";
import { LAYER_ORDER, SPRITE_SIZE } from "@/characters/types";
import type { Character, LayerId, Palette, PaletteSlot, Shape } from "@/characters/types";

/**
 * The closed-eye frame, drawn over the open eyes and hidden for all but a
 * fraction of its cycle. A lid is a line where the lashes were, so it reuses
 * the eye part's own lash rectangles rather than needing a second drawing.
 */
function Blink({ character, seed }: { character: Character; seed: number }) {
  const eye = paletteBy("eye", character.eyeColor);
  const shapes = partFor("eyes", character.eyes)?.shapes ?? [];
  // The lash row of each eye, pulled down over the white.
  const lids = shapes.filter((shape) => shape.shade === "line");

  return (
    <g className="ps-blink" style={{ animationDelay: `${(seed % 47) / 10}s` }}>
      {lids.map((lid, i) => (
        <rect key={i} x={lid.x} y={lid.y} width={lid.w} height={lid.h + 3} fill={eye.line} />
      ))}
    </g>
  );
}

const paletteBy = (slot: Exclude<PaletteSlot, "ink">, id: string): Palette =>
  PALETTES[slot].find((p) => p.id === id) ?? PALETTES[slot][0];

/** Which shapes each layer contributes, and what colours them. */
function layers(character: Character): { id: LayerId; shapes: Shape[]; palette: Palette }[] {
  const skin = paletteBy("skin", character.skin);
  const hair = paletteBy("hair", character.hairColor);
  const eye = paletteBy("eye", character.eyeColor);
  const top = paletteBy("top", character.topColor);

  const hairStyle = partFor("hair", character.hair);
  const accessory = partFor("accessory", character.accessory);
  const accessoryPalette =
    accessory?.uses === "top" ? top : accessory?.uses === "hair" ? hair : INK;

  const byLayer: Record<LayerId, { shapes: Shape[]; palette: Palette }> = {
    // A long style's back hair is part of the same pick, drawn behind the head.
    hairBack: { shapes: (hairStyle as { back?: Shape[] })?.back ?? [], palette: hair },
    body: { shapes: partFor("body", character.body)?.shapes ?? [], palette: skin },
    top: { shapes: partFor("top", character.top)?.shapes ?? [], palette: top },
    eyes: { shapes: partFor("eyes", character.eyes)?.shapes ?? [], palette: eye },
    // Eyebrows take the hair colour, which is the other half of why one hair
    // drawing covers eight colours: the face follows it for free.
    brows: { shapes: partFor("brows", character.brows)?.shapes ?? [], palette: hair },
    mouth: { shapes: partFor("mouth", character.mouth)?.shapes ?? [], palette: INK },
    hairFront: { shapes: hairStyle?.shapes ?? [], palette: hair },
    accessory: { shapes: accessory?.shapes ?? [], palette: accessoryPalette },
  };

  return LAYER_ORDER.map((id) => ({ id, ...byLayer[id] }));
}

export function CharacterSprite({
  character,
  size = 64,
  dimmed = false,
  label,
  backdrop = "#1c1c22",
  blinkSeed,
}: {
  character: Character;
  size?: number;
  dimmed?: boolean;
  label?: string;
  /** Null draws the sprite on nothing, for a preview that sits on the page. */
  backdrop?: string | null;
  /**
   * Turns the idle blink on, and staggers it. Omitted means a still sprite —
   * which is what the creator's preview wants while someone is choosing eyes.
   */
  blinkSeed?: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      width={size}
      height={size}
      role="img"
      aria-label={label ?? "character"}
      // Crisp now, and the rule the real sprites will need at 4×–6×.
      style={{ imageRendering: "pixelated", opacity: dimmed ? 0.45 : 1 }}
      shapeRendering="crispEdges"
    >
      {backdrop ? <rect x="0" y="0" width={SPRITE_SIZE} height={SPRITE_SIZE} fill={backdrop} /> : null}
      {blinkSeed === undefined ? null : <Blink character={character} seed={blinkSeed} />}
      {layers(character).map((layer) =>
        layer.shapes.map((shape, i) => (
          <rect
            key={`${layer.id}:${i}`}
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            fill={layer.palette[shape.shade]}
          />
        )),
      )}
    </svg>
  );
}
