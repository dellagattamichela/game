import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  MAX_CODE_LENGTH,
  generateCode,
  isBannedCode,
  isValidCode,
  normalizeCode,
  type RandomBytes,
} from "./code";

/** A byte source that hands back a fixed sequence, cycling if it runs out. */
const bytesFrom = (sequence: number[]): RandomBytes => {
  let i = 0;
  return (count) =>
    Uint8Array.from({ length: count }, () => sequence[i++ % sequence.length]);
};

describe("the alphabet", () => {
  it("excludes vowels, so codes cannot spell words", () => {
    for (const vowel of "AEIOU") expect(CODE_ALPHABET).not.toContain(vowel);
  });

  it("excludes every character that looks like another one", () => {
    for (const confusable of "01258BILSZO") expect(CODE_ALPHABET).not.toContain(confusable);
  });

  it("has no duplicates, which would skew the distribution", () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });
});

describe("generateCode", () => {
  it("returns a code of the requested length from the alphabet", () => {
    const code = generateCode();
    expect(code).toHaveLength(CODE_LENGTH);
    expect(isValidCode(code)).toBe(true);
  });

  it("maps bytes to the alphabet in order", () => {
    // Bytes 0..3 land on the first four symbols.
    expect(generateCode(4, bytesFrom([0, 1, 2, 3]))).toBe(CODE_ALPHABET.slice(0, 4));
  });

  it("discards the biased tail rather than folding it back over the alphabet", () => {
    // 242 is the first byte at or above the rejection limit (256 - 256 % 22),
    // so it is skipped entirely; without rejection it would wrap to index 0.
    const code = generateCode(2, bytesFrom([242, 5, 6]));
    expect(code).toBe(CODE_ALPHABET[5] + CODE_ALPHABET[6]);
  });

  it("is uniform enough across the alphabet", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      for (const char of generateCode()) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    // Every symbol shows up, and none of them runs away with the draw.
    expect(counts.size).toBe(CODE_ALPHABET.length);
    const expected = (4000 * CODE_LENGTH) / CODE_ALPHABET.length;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.7);
      expect(count).toBeLessThan(expected * 1.3);
    }
  });

  it("never returns the same code twice in a realistic run", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateCode());
    // 500 draws from 234k codes: a collision here would mean the source is broken.
    expect(seen.size).toBe(500);
  });

  it("redraws a code that reads as a word", () => {
    const indexOf = (char: string) => CODE_ALPHABET.indexOf(char);
    // A draw asks for four spare bytes beyond the four it needs, so each
    // attempt eats eight: the first spells FCK?, the second is clean.
    const spare = [0, 0, 0, 0];
    const source = bytesFrom([
      ...["F", "C", "K", "D"].map(indexOf),
      ...spare,
      ...["M", "N", "P", "Q"].map(indexOf),
      ...spare,
    ]);
    expect(generateCode(4, source)).toBe("MNPQ");
  });

  it("fails loudly on a byte source that cannot produce a clean code", () => {
    const stuck = bytesFrom(["F", "C", "K", "D"].map((c) => CODE_ALPHABET.indexOf(c)));
    expect(() => generateCode(4, stuck)).toThrow(/acceptable invite code/);
  });

  it("refuses a length outside the range the store can widen into", () => {
    expect(() => generateCode(0)).toThrow(/Code length/);
    expect(() => generateCode(MAX_CODE_LENGTH + 1)).toThrow(/Code length/);
  });
});

describe("isBannedCode", () => {
  it("catches the skeletons it knows", () => {
    expect(isBannedCode("FCK3")).toBe(true);
    expect(isBannedCode("7CZZ")).toBe(true);
    expect(isBannedCode("MNPQ")).toBe(false);
  });
});

describe("normalizeCode", () => {
  it("accepts a code however a player types it", () => {
    for (const typed of ["kblt", "KB LT", "kb-lt", " KBLT. ", "k.b.l.t"]) {
      expect(normalizeCode(typed)).toBe("KBLT");
    }
  });

  it("does not guess at characters the alphabet excludes", () => {
    // A typed "0" is an error, not a hint: no symbol in the alphabet is its
    // obvious partner, and guessing would send the player to another room.
    expect(normalizeCode("K0LT")).toBe("K0LT");
    expect(isValidCode(normalizeCode("K0LT"))).toBe(false);
  });
});

describe("isValidCode", () => {
  it("accepts codes of any length the store can mint", () => {
    expect(isValidCode("MNPQ")).toBe(true);
    expect(isValidCode("MNPQ347")).toBe(true);
  });

  it("rejects the wrong length, the wrong case, and foreign characters", () => {
    expect(isValidCode("MNP")).toBe(false);
    expect(isValidCode("M".repeat(MAX_CODE_LENGTH + 1))).toBe(false);
    expect(isValidCode("mnpq")).toBe(false);
    expect(isValidCode("MNP0")).toBe(false);
  });
});
