import { LanguagePicker } from "@/app/_components/language-picker";
import type { Metadata } from "next";
import Link from "next/link";
import { JoinRoomForm } from "../rooms/_components/join-room-form";
import { cookies } from "next/headers";
import { LOCALE_KEY, toLocale, translator } from "@/i18n";

export const metadata: Metadata = {
  title: "Join a room · Pilot Season",
};

export default async function JoinPage() {
  const locale = toLocale((await cookies()).get(LOCALE_KEY)?.value);
  const t = translator(locale);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{t("page.join.title")}</h1>
          <LanguagePicker locale={locale} label={t("language.label")} />
        </div>
        <p className="mt-1 text-sm opacity-70">
          {t("page.join.subtitle")}
        </p>
      </div>

      <JoinRoomForm locale={locale} />

      <Link href="/rooms/new" className="text-sm underline opacity-70">
        {t("page.join.createInstead")}
      </Link>
    </main>
  );
}
