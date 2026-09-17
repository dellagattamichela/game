"use client";

/**
 * The invite code, shown the two ways people actually pass it on: read aloud,
 * and pasted into a chat. So the code is big and spaced out for reading, and
 * the link is a single copy button.
 *
 * The link arrives as a prop rather than being read from `window` in an effect,
 * so it is right on the first paint instead of appearing a frame later.
 */
import { useState } from "react";
import { translator, type Locale } from "@/i18n";

export function InviteCode({
  code,
  link,
  locale,
}: {
  code: string;
  link: string;
  locale: Locale;
}) {
  const t = translator(locale);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function copy(what: "code" | "link", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // Clipboard access can be refused, and the code is on screen to read
      // anyway — so this is a missing convenience, not a failure worth showing.
      setCopied(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 border-2 p-6">
      <p className="text-sm opacity-70">{t("form.inviteCode")}</p>
      <p className="font-mono text-5xl font-bold tracking-[0.3em] tabular-nums">{code}</p>

      <div className="flex gap-2">
        <button type="button" className="border px-3 py-1 text-sm" onClick={() => copy("code", code)}>
          {copied === "code" ? t("invite.copied") : t("invite.copyCode")}
        </button>
        <button
          type="button"
          className="border px-3 py-1 text-sm disabled:opacity-40"
          disabled={!link}
          onClick={() => copy("link", link)}
        >
          {copied === "link" ? t("invite.copied") : t("invite.copyLink")}
        </button>
      </div>

      <p className="break-all text-center text-xs opacity-60">{link}</p>
    </div>
  );
}
