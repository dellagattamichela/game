"use server";

/**
 * The creator's side of stage 3: one action, which turns a name and a table
 * size into a room with an invite code and puts the creator inside it.
 *
 * All the rules live in `src/rooms`; this file is the boundary that knows about
 * cookies, redirects and `FormData`, and nothing else. Note that a Server
 * Action is reachable by a direct POST, not only through the form, so the host
 * id comes from the cookie rather than from a field anyone could set.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PLAYER_COOKIE, PLAYER_COOKIE_MAX_AGE, newPlayerId } from "@/rooms/player";
import { rooms } from "@/rooms/store";
import { DEFAULT_MAX_PLAYERS } from "@/rooms/types";

/**
 * Every export of a `"use server"` file has to be an async server function, so
 * the initial value of this state lives with the form that owns it. Types are
 * erased at compile time and may still be exported from here.
 */
export type CreateRoomState = {
  error: string | null;
  /** Echoed back so a rejected form does not wipe what the host typed. */
  values: { name: string; maxPlayers: number };
};

export async function createRoomAction(
  _previous: CreateRoomState,
  formData: FormData,
): Promise<CreateRoomState> {
  const name = String(formData.get("name") ?? "");
  const maxPlayers = Number(formData.get("maxPlayers") ?? DEFAULT_MAX_PLAYERS);
  const values = { name, maxPlayers };

  const jar = await cookies();
  // Reuse the id this browser already has, so someone who creates a second
  // room is the same person as far as the game is concerned.
  const hostId = jar.get(PLAYER_COOKIE)?.value ?? newPlayerId();

  const result = rooms.open({ hostId, hostName: name, maxPlayers });
  if (!result.ok) return { error: result.message, values };

  jar.set(PLAYER_COOKIE, hostId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PLAYER_COOKIE_MAX_AGE,
  });

  // Throws a control-flow exception, so nothing below runs.
  redirect(`/rooms/${result.room.code}`);
}

export type JoinRoomState = {
  error: string | null;
  values: { code: string; name: string };
};

/**
 * The other side of the invite code: turn one into a seat.
 *
 * Same boundary rules as creating. The player id comes from the cookie, so a
 * player who reloads, closes the tab, or loses their wifi comes back as
 * themselves — the store decides whether that is a join or a reconnect.
 */
export async function joinRoomAction(
  _previous: JoinRoomState,
  formData: FormData,
): Promise<JoinRoomState> {
  const code = String(formData.get("code") ?? "");
  const name = String(formData.get("name") ?? "");
  const values = { code, name };

  const jar = await cookies();
  const playerId = jar.get(PLAYER_COOKIE)?.value ?? newPlayerId();

  const result = rooms.join(code, { playerId, name });
  if (!result.ok) return { error: result.message, values };

  jar.set(PLAYER_COOKIE, playerId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: PLAYER_COOKIE_MAX_AGE,
  });

  redirect(`/rooms/${result.room.code}`);
}
