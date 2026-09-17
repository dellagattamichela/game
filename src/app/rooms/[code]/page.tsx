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
import {
  ReadyToggle,
  StartButton,
  StoryPicker,
  type StoryCard,
} from "../_components/lobby-controls";
import { RoomTable, type StoryChrome } from "../_components/room-table";
import { resolveEnding, sceneView } from "@/engine/engine";
import type { GameState, Story } from "@/engine/types";
import { normalizeCode } from "@/rooms/code";
import { PLAYER_COOKIE } from "@/rooms/player";
import { hasSeat, isMember, startBlocker } from "@/rooms/room";
import { rooms } from "@/rooms/store";
import type { Room } from "@/rooms/types";
import { STORIES, getStory } from "@/stories";

export const metadata: Metadata = {
  title: "Room · Pilot Season",
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
  const me = room.players.find((p) => p.id === playerId);
  const story = room.storyId ? getStory(room.storyId) : undefined;
  // Polling would re-render a puzzle out from under the person playing it, and
  // they are the only one who can end the phase anyway.
  const myMinigame = room.game?.phase === "minigame" && room.game.minigame?.playerId === playerId;
  // Nothing about a finished run will change, so stop asking.
  const settled = room.status === "ended";

  return (
    <main
      className={`mx-auto flex w-full flex-col gap-6 p-6 ${
        room.status === "lobby" ? "max-w-md" : "max-w-2xl"
      }`}
    >
      <LobbyRefresh everyMs={room.status === "lobby" ? 3000 : 2000} paused={myMinigame || settled} />
      <h1 className="text-2xl font-bold">{room.status === "lobby" ? "Lobby" : story?.title}</h1>

      {room.status === "lobby" ? <InviteCode code={room.code} link={link} /> : null}

      <Roster room={room} playerId={playerId} />

      {room.status === "lobby" ? (
        <>
          {me ? <ReadyToggle code={room.code} ready={me.ready} /> : null}

          {isHost ? (
            <StoryPicker code={room.code} stories={STORY_CARDS} chosenId={room.storyId} />
          ) : (
            <p className="text-sm opacity-70">
              {story
                ? `The host picked ${story.title}.`
                : "The host is choosing a story."}
            </p>
          )}

          {isHost ? (
            <StartButton
              code={room.code}
              blockedBecause={startBlocker(room, story)?.message ?? null}
            />
          ) : null}
        </>
      ) : (
        <Table game={room.game} story={story} code={room.code} myId={playerId} />
      )}

      <Link href="/" className="text-sm underline opacity-70">
        Back to the single-browser prototype
      </Link>
    </main>
  );
}

/**
 * The run, handed to the table.
 *
 * Everything the client needs is computed here: the engine's own `sceneView`,
 * and the story's titles for clues, mishaps and the ending. That keeps the
 * story files and the zod-validated registry out of the client bundle, and it
 * keeps the rule that the UI never evaluates a gate for itself.
 */
function Table({
  game,
  story,
  code,
  myId,
}: {
  game: GameState | null;
  story: Story | undefined;
  code: string;
  myId: string;
}) {
  if (!story || !game) return null;

  const chrome: StoryChrome = {
    title: story.title,
    clues: story.clues
      ? Object.fromEntries(
          Object.entries(story.clues).map(([id, clue]) => [
            id,
            { title: clue.title, description: clue.description },
          ]),
        )
      : null,
    clueCount: story.clues ? Object.keys(story.clues).length : 0,
    mishaps: Object.fromEntries(
      Object.entries(story.mishaps ?? {}).map(([id, mishap]) => [id, mishap.title]),
    ),
    ending:
      game.phase === "ended"
        ? (() => {
            const ending =
              story.endings.find((e) => e.id === game.endingId) ?? resolveEnding(story, game);
            return { title: ending.title, text: ending.text };
          })()
        : null,
  };

  return (
    <RoomTable
      code={code}
      myId={myId}
      game={game}
      view={sceneView(story, game)}
      chrome={chrome}
    />
  );
}

/**
 * The story list, flattened to what the picker draws. Built here so the client
 * bundle never has to import the registry and the story files behind it.
 */
const STORY_CARDS: StoryCard[] = STORIES.map((story) => ({
  id: story.id,
  title: story.title,
  hook: story.hook,
  detail: [
    `${Object.keys(story.scenes).length} scenes`,
    story.clues ? `${Object.keys(story.clues).length} clues` : null,
    `${story.endings.length} endings`,
    `${story.players.min}–${story.players.max} players`,
  ]
    .filter(Boolean)
    .join(" · "),
}));

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
            : room.status === "ended"
              ? "This game has finished. If you were playing, put in the name you used to see how it went."
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
