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
import { z } from "zod";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Action } from "@/engine/types";
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

/**
 * The three lobby controls share a shape: they act on the room in the URL, on
 * behalf of whoever the cookie says you are, and they either change something
 * or come back with a sentence explaining why not.
 */
export type LobbyState = { error: string | null };

/** Who the browser claims to be. Null when it has never been anywhere. */
async function currentPlayerId(): Promise<string | null> {
  return (await cookies()).get(PLAYER_COOKIE)?.value ?? null;
}

const NOT_YOU: LobbyState = { error: "This browser is not in that room." };

export async function setReadyAction(
  _previous: LobbyState,
  formData: FormData,
): Promise<LobbyState> {
  const playerId = await currentPlayerId();
  if (!playerId) return NOT_YOU;

  const code = String(formData.get("code") ?? "");
  const ready = formData.get("ready") === "true";

  const result = rooms.ready(code, playerId, ready);
  if (!result.ok) return { error: result.message };

  // The lobby already polls, but waiting up to three seconds to see your own
  // button change state would feel broken. This re-renders it immediately.
  refresh();
  return { error: null };
}

export async function chooseStoryAction(
  _previous: LobbyState,
  formData: FormData,
): Promise<LobbyState> {
  const playerId = await currentPlayerId();
  if (!playerId) return NOT_YOU;

  const result = rooms.chooseStory(
    String(formData.get("code") ?? ""),
    playerId,
    String(formData.get("storyId") ?? ""),
  );
  if (!result.ok) return { error: result.message };

  refresh();
  return { error: null };
}

export async function startGameAction(
  _previous: LobbyState,
  formData: FormData,
): Promise<LobbyState> {
  const playerId = await currentPlayerId();
  if (!playerId) return NOT_YOU;

  const result = rooms.start(String(formData.get("code") ?? ""), playerId);
  if (!result.ok) return { error: result.message };

  refresh();
  return { error: null };
}

/**
 * What a client is allowed to ask for during a scene.
 *
 * Deliberately *not* the engine's `Action`. Every engine action carries the id
 * of the player it is for, and a Server Action is reachable by direct POST, so
 * accepting one whole would let anyone vote as anyone. This shape has no id in
 * it at all: the id is added below, from the cookie, which makes acting as
 * someone else structurally impossible rather than merely checked for.
 */
const playInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choose"), choiceIndex: z.number().int().min(0) }),
  z.object({ kind: z.literal("vote"), choiceIndex: z.number().int().min(0) }),
  z.object({ kind: z.literal("give"), toId: z.string().min(1), amount: z.number().int().min(1) }),
  z.object({ kind: z.literal("minigame"), passed: z.boolean() }),
  z.object({ kind: z.literal("continue") }),
]);

export type PlayInput = z.infer<typeof playInput>;

function toEngineAction(input: PlayInput, playerId: string): Action {
  switch (input.kind) {
    case "choose":
      return { type: "choose", playerId, choiceIndex: input.choiceIndex };
    case "vote":
      return { type: "vote", playerId, choiceIndex: input.choiceIndex };
    case "give":
      return { type: "give", fromId: playerId, toId: input.toId, amount: input.amount };
    case "minigame":
      return { type: "minigameResult", playerId, passed: input.passed };
    case "continue":
      return { type: "continue", playerId };
  }
}

/**
 * Play a scene action. Called directly from the table with arguments rather
 * than through a form, because a choice is a button in a list, not a document
 * being submitted.
 */
export async function playAction(code: string, input: unknown): Promise<LobbyState> {
  const playerId = await currentPlayerId();
  if (!playerId) return NOT_YOU;

  const parsed = playInput.safeParse(input);
  if (!parsed.success) return { error: "That move made no sense." };

  const result = rooms.act(code, toEngineAction(parsed.data, playerId));
  if (!result.ok) return { error: result.message };

  refresh();
  return { error: null };
}
