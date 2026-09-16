/**
 * Deterministic randomness.
 *
 * The engine must never call Math.random(). Once the game is server-authoritative
 * the server applies an action and broadcasts the result, but clients also render
 * scene text locally — so anything "random" has to be a pure function of the run
 * seed and the scene, or players would see different names in the same sentence.
 */

/** FNV-1a. Stable across engines and platforms, which Array.hashCode-style tricks are not. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in integer range via Math.imul.
    h = Math.imul(h, 0x01000193);
  }
  // Coerce to unsigned so callers can safely modulo.
  return h >>> 0;
}

/**
 * Pick an index in [0, length) from a seed and a string key. Same inputs always
 * give the same index, so every client resolves {randomPlayer} identically.
 */
export function pickIndex(seed: number, key: string, length: number): number {
  if (length <= 0) return 0;
  return hashString(`${seed}:${key}`) % length;
}

/** A fresh run seed. Called once, at game creation, outside the pure engine. */
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
