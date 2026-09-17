/**
 * Invite codes.
 *
 * A code is the only thing that stands between a private game and a stranger,
 * and it is also the thing one person reads aloud while four others type it in.
 * Those two pressures pull in opposite directions, so the choices here are
 * deliberate:
 *
 *   - **Unambiguous alphabet.** No vowels, and no character that looks like
 *     another one in a sans-serif font (no `B`/`8`, `S`/`5`, `L`/`1`, `Z`/`2`,
 *     and no `O`/`0` or `I`/`1` since the vowels already went). What is left is
 *     22 symbols that survive being read off a laptop screen across a room.
 *   - **No accidental words.** Dropping the vowels also means a random code
 *     almost never spells anything, which matters for a code people screenshot
 *     and share. `BANNED` catches the few consonant skeletons that still read as
 *     something, and is meant to be extended rather than to be complete.
 *   - **Real randomness.** Codes come from `crypto.getRandomValues`, not
 *     `Math.random()`: a predictable generator would let anyone who watched a
 *     few codes go by guess the next one.
 *
 * This module is pure apart from `secureRandomBytes`, which every function
 * takes as an injectable parameter, so tests can pin the bytes and get the same
 * code every run.
 *
 * ## How guessable is a code?
 *
 * 22 symbols over `CODE_LENGTH` 4 is 234,256 codes. With a hundred rooms live,
 * a blind guess lands in one roughly once every 2,300 tries — fine for a game
 * among friends where the worst case is a stranger watching a story, and not
 * fine for anything else. Raising `CODE_LENGTH` to 6 multiplies the space by
 * 484 and is the mitigation if this ever goes public; joining should also be
 * rate limited once there is a server to rate limit it on.
 */

/** 22 symbols: consonants and digits that cannot be misread as each other. */
export const CODE_ALPHABET = "CDFGHJKMNPQRTVWXY34679";

/** Length of a freshly minted code. See the guessability note above. */
export const CODE_LENGTH = 4;

/**
 * Longest code we will ever mint. The store widens a code by one character when
 * it keeps colliding, so this is the ceiling on that widening, not a length
 * anyone should expect to see.
 */
export const MAX_CODE_LENGTH = 8;

/**
 * Consonant skeletons that still read as something once the vowels are gone,
 * in English and Italian. A code containing one is redrawn. Short by design:
 * this is a courtesy filter for the code a group screenshots, not a moderation
 * system, and every entry added shrinks the code space a little.
 */
const BANNED = ["FCK", "CNT", "DCK", "KKK", "NGR", "CZZ", "MRD", "FGA"];

/** Source of raw bytes. Injectable so tests can pin the output. */
export type RandomBytes = (count: number) => Uint8Array;

/** The real one. Present in Node 18+ and every browser we target. */
export const secureRandomBytes: RandomBytes = (count) => {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
};

/** True if the code reads as one of the words in `BANNED`. */
export function isBannedCode(code: string): boolean {
  return BANNED.some((word) => code.includes(word));
}

/**
 * Draw `length` characters uniformly from the alphabet.
 *
 * `256 % 22` is not zero, so mapping every byte with `% 22` would make the
 * first fourteen symbols slightly likelier than the rest. Bytes at or above
 * `limit` are thrown away instead, which costs a few extra bytes and keeps the
 * distribution flat.
 */
function drawCode(length: number, randomBytes: RandomBytes): string {
  const size = CODE_ALPHABET.length;
  const limit = 256 - (256 % size);
  let code = "";

  while (code.length < length) {
    // A few spare bytes per round, so a rejected byte rarely costs a round trip.
    const pool = randomBytes(length - code.length + 4);
    if (pool.length === 0) throw new Error("randomBytes returned no bytes");

    for (const byte of pool) {
      if (code.length === length) break;
      if (byte >= limit) continue;
      code += CODE_ALPHABET[byte % size];
    }
  }

  return code;
}

/** How many draws before we decide the byte source is broken. */
const DRAW_ATTEMPTS = 64;

/**
 * A fresh invite code.
 *
 * Throws only if the byte source keeps handing back banned codes, which with a
 * working CSPRNG has a probability somewhere below "the machine is on fire" —
 * so failing loudly beats returning a code we said we would not return.
 */
export function generateCode(
  length: number = CODE_LENGTH,
  randomBytes: RandomBytes = secureRandomBytes,
): string {
  if (!Number.isInteger(length) || length < 1 || length > MAX_CODE_LENGTH) {
    throw new Error(`Code length must be an integer in 1..${MAX_CODE_LENGTH}, got ${length}`);
  }

  for (let attempt = 0; attempt < DRAW_ATTEMPTS; attempt++) {
    const code = drawCode(length, randomBytes);
    if (!isBannedCode(code)) return code;
  }

  throw new Error("Could not draw an acceptable invite code; is the byte source working?");
}

/**
 * What a player typed, turned into what we store.
 *
 * People type `kblt`, `KB LT`, `kb-lt` and paste `KBLT.` with the sentence's
 * full stop attached. All four are the same room. Characters outside the
 * alphabet are dropped rather than mapped: every confusable pair had one of its
 * members removed from the alphabet precisely so there is no sensible guess to
 * make about a `0` or an `S`, and quietly guessing wrong would send someone
 * into the wrong room.
 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** True if this could be a code we minted. Cheap enough to run before a lookup. */
export function isValidCode(code: string): boolean {
  if (code.length < CODE_LENGTH || code.length > MAX_CODE_LENGTH) return false;
  return [...code].every((char) => CODE_ALPHABET.includes(char));
}
