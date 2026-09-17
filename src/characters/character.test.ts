import { describe, expect, it } from "vitest";
import {
  ACCESSORIES,
  BODIES,
  EYES,
  HAIRS,
  HAIR_COLORS,
  SKIN_TONES,
  TOPS,
  TOP_COLORS,
} from "./catalog";
import {
  CHOICES,
  DEFAULT_CHARACTER,
  GROUPS,
  cycle,
  fieldsInGroup,
  normalizeCharacter,
  randomCharacter,
} from "./character";
import { CHARACTER_FIELDS, LAYER_ORDER, SPRITE_SIZE } from "./types";
import type { Character, CharacterField, Part } from "./types";
import { hashString } from "@/engine/rng";

const ALL_PARTS: Part[] = [...BODIES, ...HAIRS, ...EYES, ...TOPS, ...ACCESSORIES];

describe("the catalog", () => {
  it("gives every layer something to pick", () => {
    for (const field of CHARACTER_FIELDS) {
      expect(CHOICES[field].options.length, field).toBeGreaterThan(1);
    }
  });

  it("has unique ids within every layer, so a saved choice is unambiguous", () => {
    for (const field of CHARACTER_FIELDS) {
      const ids = CHOICES[field].options.map((o) => o.id);
      expect(new Set(ids).size, field).toBe(ids.length);
    }
  });

  it("keeps every shape inside the sprite, so nothing is drawn off the edge", () => {
    for (const part of ALL_PARTS) {
      const shapes = [...part.shapes, ...((part as { back?: Part["shapes"] }).back ?? [])];
      for (const shape of shapes) {
        expect(shape.x, part.id).toBeGreaterThanOrEqual(0);
        expect(shape.y, part.id).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.w, part.id).toBeLessThanOrEqual(SPRITE_SIZE);
        expect(shape.y + shape.h, part.id).toBeLessThanOrEqual(SPRITE_SIZE);
        expect(shape.w * shape.h, part.id).toBeGreaterThan(0);
      }
    }
  });

  it("gives every palette all four key shades", () => {
    for (const palette of [...SKIN_TONES, ...HAIR_COLORS, ...TOP_COLORS]) {
      for (const shade of ["base", "shadow", "light", "line"] as const) {
        expect(palette[shade], `${palette.id}.${shade}`).toBeTruthy();
      }
    }
  });

  it("files every field under a tab the creator shows", () => {
    const filed = GROUPS.flatMap(fieldsInGroup);
    expect([...filed].sort()).toEqual([...CHARACTER_FIELDS].sort());
  });

  it("draws hair into both layers the design doc asks for", () => {
    expect(LAYER_ORDER).toContain("hairBack");
    expect(LAYER_ORDER).toContain("hairFront");
    // Short styles have no back hair; long ones do. Both are legal.
    expect(HAIRS.find((h) => h.id === "buzz")?.back).toEqual([]);
    expect(HAIRS.find((h) => h.id === "long")?.back.length).toBeGreaterThan(0);
  });
});

describe("normalizeCharacter", () => {
  it("passes a valid character through unchanged", () => {
    const character = randomCharacter(123);
    expect(normalizeCharacter(character)).toEqual(character);
  });

  it("falls back per layer when the catalog no longer has that part", () => {
    const stale = { ...DEFAULT_CHARACTER, hair: "mullet-from-2019", skin: SKIN_TONES[3].id };

    const fixed = normalizeCharacter(stale);

    expect(fixed.hair).toBe(DEFAULT_CHARACTER.hair);
    // The layers that still made sense are left alone.
    expect(fixed.skin).toBe(SKIN_TONES[3].id);
  });

  it("turns junk into a drawable character rather than throwing", () => {
    for (const junk of [null, undefined, 42, "hello", [], { body: { nested: true } }]) {
      expect(normalizeCharacter(junk)).toEqual(DEFAULT_CHARACTER);
    }
  });

  it("treats an unknown accessory as wearing nothing", () => {
    expect(normalizeCharacter({ ...DEFAULT_CHARACTER, accessory: "jetpack" }).accessory).toBeNull();
  });

  it("keeps a real accessory", () => {
    const worn = { ...DEFAULT_CHARACTER, accessory: ACCESSORIES[0].id };
    expect(normalizeCharacter(worn).accessory).toBe(ACCESSORIES[0].id);
  });
});

describe("randomCharacter", () => {
  it("is a pure function of its seed", () => {
    expect(randomCharacter(7)).toEqual(randomCharacter(7));
    // Every client derives the same face from the same seed, which is what
    // lets a player look like themselves on somebody else's screen.
    expect(randomCharacter(7)).not.toEqual(randomCharacter(8));
  });

  it("always produces something the renderer can draw", () => {
    for (let seed = 0; seed < 200; seed++) {
      const character = randomCharacter(seed);
      expect(normalizeCharacter(character)).toEqual(character);
    }
  });

  it("spreads across the catalog rather than favouring one part", () => {
    const hairs = new Set<string>();
    const tops = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      hairs.add(randomCharacter(seed).hair);
      tops.add(randomCharacter(seed).top);
    }
    expect(hairs.size).toBe(HAIRS.length);
    expect(tops.size).toBe(TOPS.length);
  });

  it("leaves most people without an accessory", () => {
    const worn = Array.from({ length: 300 }, (_, s) => randomCharacter(s).accessory).filter(Boolean);
    expect(worn.length).toBeGreaterThan(30);
    expect(worn.length).toBeLessThan(200);
  });

  it("gives two players different faces from their ids", () => {
    const a = randomCharacter(hashString("player-a"));
    const b = randomCharacter(hashString("player-b"));
    expect(a).not.toEqual(b);
  });
});

describe("cycle", () => {
  it("steps forward and wraps at the end", () => {
    let character: Character = { ...DEFAULT_CHARACTER, body: BODIES[BODIES.length - 1].id };
    character = cycle(character, "body", 1);
    expect(character.body).toBe(BODIES[0].id);
  });

  it("steps backward and wraps at the start", () => {
    const character = cycle({ ...DEFAULT_CHARACTER, body: BODIES[0].id }, "body", -1);
    expect(character.body).toBe(BODIES[BODIES.length - 1].id);
  });

  it("cycles an optional layer through wearing nothing", () => {
    let character: Character = { ...DEFAULT_CHARACTER, accessory: null };
    const seen: (string | null)[] = [null];
    for (let i = 0; i < ACCESSORIES.length; i++) {
      character = cycle(character, "accessory", 1);
      seen.push(character.accessory);
    }
    expect(seen).toEqual([null, ...ACCESSORIES.map((a) => a.id)]);
    // One more step comes back around to nothing.
    expect(cycle(character, "accessory", 1).accessory).toBeNull();
  });

  it("changes one layer and leaves the rest alone", () => {
    const before = randomCharacter(99);
    const after = cycle(before, "mouth", 1);

    const changed = (Object.keys(before) as CharacterField[]).filter((f) => before[f] !== after[f]);
    expect(changed).toEqual(["mouth"]);
    // And the input is untouched.
    expect(before).toEqual(randomCharacter(99));
  });
});
