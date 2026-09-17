/**
 * A room, seen from either side of the door.
 *
 * The invite link and the lobby are the same URL on purpose: the host sends
 * `/rooms/KBLT`, and what a visitor gets there depends on whether their cookie
 * already holds a seat in it. A member sees the lobby; anyone else sees the
 * room's door, with a name field. That way the link a host pastes into a chat
 * does the whole job, and nobody has to be told where to type the code in.
 */
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InviteCode } from "../_components/invite-code";
import { JoinRoomForm } from "../_components/join-room-form";
import { LobbyRefresh } from "../_components/lobby-refresh";
import { normalizeCode } from "@/rooms/code";
import { PLAYER_COOKIE } from "@/rooms/player";
import { hasSeat, isMember } from "@/rooms/room";
import { rooms } from "@/rooms/store";
import type { Room } from "@/rooms/types";

export const metadata: Metadata = {
  title: "Lobby · Pilot Season",
};

export default async function RoomPage({ params }: PageProps<"/rooms/[code]">) {
  const { code } = await params;
  const canonical = normalizeCode(decodeURIComponent(code));

  // A shared link can arrive lowercased by a chat client, or with punctuation
  // attached. Send it to the one spelling so the URL people copy onward is the
  // one the room is actually stored under.
  if (canonical !== code) redirect(`/rooms/${canonical}`);

  const room = rooms.find(canonical);
  if (!room) notFound();

  const playerId = (await cookies()).get(PLAYER_COOKIE)?.value ?? null;

  if (!isMember(room, playerId)) return <Door room={room} />;

  const link = `${await requestOrigin()}/rooms/${room.code}`;
  const isHost = playerId === room.hostId;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <LobbyRefresh />
      <h1 className="text-2xl font-bold">Lobby</h1>

      <InviteCode code={room.code} link={link} />

      <Roster room={room} playerId={playerId} />

      <p className="text-sm opacity-70">
        {isHost
          ? "You are the host: you pick the story and start the game."
          : "The host picks the story and starts the game."}{" "}
        The story picker and the game itself are not wired to rooms yet.
      </p>

      <Link href="/" className="text-sm underline opacity-70">
        Back to the single-browser prototype
      </Link>
    </main>
  );
}

/** What someone who followed the invite link sees before they have a seat. */
function Door({ room }: { room: Room }) {
  const full = !hasSeat(room);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          Join room <span className="font-mono tracking-[0.2em]">{room.code}</span>
        </h1>
        <p className="mt-1 text-sm opacity-70">
          {room.players.map((p) => p.name).join(", ")} {room.players.length === 1 ? "is" : "are"}{" "}
          already here, {room.players.length} of {room.maxPlayers}.
        </p>
      </div>

      {full ? (
        // The form is still rendered underneath: a player whose seat this is
        // gets back in through the same door, and only the store can tell.
        <p className="border border-amber-600 px-2 py-1 text-sm text-amber-700">
          {room.status === "lobby"
            ? "This room is full."
            : "This game has already started. If you were playing, put in the name you used."}
        </p>
      ) : null}

      <JoinRoomForm fixedCode={room.code} />
    </main>
  );
}

function Roster({ room, playerId }: { room: Room; playerId: string | null }) {
  const freeSeats = room.maxPlayers - room.players.length;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">
        Players ({room.players.length}/{room.maxPlayers})
      </h2>
      {room.players.map((player) => (
        <div key={player.id} className="flex items-center justify-between border px-2 py-1">
          <span>
            {player.name}
            {player.id === playerId ? <span className="opacity-60"> (you)</span> : null}
          </span>
          <span className="flex gap-2 text-xs opacity-60">
            {player.isHost ? <span>host</span> : null}
            {player.ready ? <span>ready</span> : null}
          </span>
        </div>
      ))}
      {Array.from({ length: freeSeats }, (_, i) => (
        <div key={i} className="border border-dashed px-2 py-1 text-sm opacity-40">
          waiting…
        </div>
      ))}
    </section>
  );
}

/**
 * The origin the host's browser used to reach us, which is the one worth
 * putting in a shareable link: a laptop serving the room next door answers on a
 * LAN address, and the server has no other way to know which of its addresses
 * the players can see.
 */
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = headerList.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}
