/**
 * The character creator, on its own screen.
 *
 * A route rather than a panel in the lobby, which is the flow the design doc's
 * screen map draws: Lobby → Character creator → Lobby. It also means the
 * creator does not have a lobby polling underneath it, redrawing the page every
 * few seconds while someone is choosing a hairstyle.
 */
import { LanguagePicker } from "@/app/_components/language-picker";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CharacterCreator } from "../../_components/character-creator";
import { normalizeCode } from "@/rooms/code";
import { PLAYER_COOKIE } from "@/rooms/player";
import { isMember } from "@/rooms/room";
import { rooms } from "@/rooms/store";
import { LOCALE_KEY, toLocale, translator } from "@/i18n";

export const metadata: Metadata = {
  title: "Your character · Pilot Season",
};

export default async function CharacterPage({ params }: PageProps<"/rooms/[code]/character">) {
  const { code } = await params;
  const canonical = normalizeCode(decodeURIComponent(code));
  if (canonical !== code) redirect(`/rooms/${canonical}/character`);

  const room = rooms.find(canonical);
  if (!room) notFound();

  const jar = await cookies();
  const playerId = jar.get(PLAYER_COOKIE)?.value ?? null;
  const locale = toLocale(jar.get(LOCALE_KEY)?.value);
  const t = translator(locale);
  // Only someone with a seat has a character to edit; everyone else belongs at
  // the door, which is what the room page shows them.
  if (!isMember(room, playerId)) redirect(`/rooms/${canonical}`);

  const me = room.players.find((p) => p.id === playerId)!;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{t("page.character.title")}</h1>
          <LanguagePicker locale={locale} label={t("language.label")} />
        </div>
        <p className="mt-1 text-sm opacity-70">
          {t("page.character.subtitle")}
        </p>
      </div>

      <CharacterCreator
        code={room.code}
        initial={me.character}
        playerName={me.name}
        locale={locale}
      />

      <Link href={`/rooms/${room.code}`} className="text-sm underline opacity-70">
        {t("page.character.backNoSave")}
      </Link>
    </main>
  );
}
