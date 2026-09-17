/**
 * The lobby, as far as stage 3 has built it: the room exists, it has a code,
 * and its creator is sitting in it. Joining, readying up and the story picker
 * are the next pieces; the screen says so rather than pretending.
 */
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { InviteCode } from "../_components/invite-code";
import { normalizeCode } from "@/rooms/code";
import { PLAYER_COOKIE } from "@/rooms/player";
import { rooms } from "@/rooms/store";

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
  const link = `${await requestOrigin()}/rooms/${room.code}`;
  const isHost = playerId !== null && playerId === room.hostId;
  const freeSeats = room.maxPlayers - room.players.length;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Lobby</h1>

      <InviteCode code={room.code} link={link} />

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
            {player.isHost ? <span className="text-xs opacity-60">host</span> : null}
          </div>
        ))}
        {Array.from({ length: freeSeats }, (_, i) => (
          <div key={i} className="border border-dashed px-2 py-1 text-sm opacity-40">
            waiting…
          </div>
        ))}
      </section>

      <p className="text-sm opacity-70">
        {isHost
          ? "You are the host: you pick the story and start the game."
          : "The host picks the story and starts the game."}{" "}
        Joining and the story picker are not built yet — this room is the invite
        code mechanism, on its own.
      </p>

      <Link href="/" className="text-sm underline opacity-70">
        Back to the single-browser prototype
      </Link>
    </main>
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
