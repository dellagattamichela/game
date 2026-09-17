/**
 * Who the browser says it is.
 *
 * The design doc's rejoin rule — "a dropped player comes back to their own seat
 * with their character intact" — only works if identity outlives the
 * connection. So a player id is minted once, stored in a cookie, and reused for
 * every room that browser creates or joins afterwards.
 *
 * Kept out of the `"use server"` action file on purpose: every export of such a
 * file has to be an async server function, and these are a constant and a
 * one-liner.
 */

export const PLAYER_COOKIE = "ps_player";

/** Thirty days. Long enough to come back to a game next weekend as yourself. */
export const PLAYER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * A new player id. `randomUUID` rather than an invite-style code: this one is
 * never read aloud, and it is a bearer token for a seat, so it wants to be
 * unguessable rather than short.
 */
export function newPlayerId(): string {
  return crypto.randomUUID();
}
