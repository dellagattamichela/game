"use client";

/**
 * Joining, in the two places it happens: on `/join` for someone who was read
 * the code out loud, and on the lobby itself for someone who followed the link.
 * The second case already knows the code, so it passes `fixedCode` and the
 * field becomes a hidden input — asking someone to retype a code they just
 * clicked would be a strange thing to do.
 */
import { useActionState } from "react";
import { joinRoomAction, type JoinRoomState } from "../actions";
import { CODE_LENGTH, MAX_CODE_LENGTH } from "@/rooms/code";
import { MAX_NAME_LENGTH } from "@/rooms/types";
import { translator, type Locale } from "@/i18n";

const EMPTY: JoinRoomState = { error: null, values: { code: "", name: "" } };

export function JoinRoomForm({ fixedCode, locale }: { fixedCode?: string; locale: Locale }) {
  const t = translator(locale);
  const [state, action, pending] = useActionState(joinRoomAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4">
      {fixedCode ? (
        <input type="hidden" name="code" value={fixedCode} />
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t("form.inviteCode")}</span>
          <input
            name="code"
            required
            minLength={CODE_LENGTH}
            maxLength={MAX_CODE_LENGTH + 4}
            defaultValue={state.values.code}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="border px-2 py-1 font-mono text-2xl uppercase tracking-[0.3em]"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{t("form.yourName")}</span>
        <input
          name="name"
          required
          maxLength={MAX_NAME_LENGTH}
          defaultValue={state.values.name}
          autoComplete="nickname"
          className="border px-2 py-1"
        />
      </label>

      {state.error ? (
        <p role="alert" className="border border-amber-600 px-2 py-1 text-sm text-amber-700">
          {t(state.error.key, state.error.params)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="border-2 px-4 py-2 font-semibold disabled:opacity-40"
      >
        {pending ? t("form.knocking") : t("form.joinRoom")}
      </button>
    </form>
  );
}
