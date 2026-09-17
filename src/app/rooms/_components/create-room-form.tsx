"use client";

/**
 * The create-a-room form. Deliberately two fields: a name and a table size.
 * Everything else the design doc puts on this screen — the story, the turn
 * timer — belongs in the lobby, where the host can change their mind while
 * people are still arriving.
 */
import { useActionState } from "react";
import { createRoomAction, type CreateRoomState } from "../actions";
import {
  DEFAULT_MAX_PLAYERS,
  MAX_NAME_LENGTH,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
} from "@/rooms/types";
import { translator, type Locale } from "@/i18n";

const EMPTY: CreateRoomState = {
  error: null,
  values: { name: "", maxPlayers: DEFAULT_MAX_PLAYERS },
};

const SIZES = Array.from(
  { length: MAX_ROOM_PLAYERS - MIN_ROOM_PLAYERS + 1 },
  (_, i) => MIN_ROOM_PLAYERS + i,
);

export function CreateRoomForm({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const [state, action, pending] = useActionState(createRoomAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4">
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

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">{t("form.tableSize")}</legend>
        <div className="mt-1 flex gap-2">
          {SIZES.map((size) => (
            <label key={size} className="flex-1">
              <input
                type="radio"
                name="maxPlayers"
                value={size}
                defaultChecked={size === state.values.maxPlayers}
                className="peer sr-only"
              />
              <span className="block cursor-pointer border py-1 text-center opacity-70 peer-checked:border-2 peer-checked:font-semibold peer-checked:opacity-100">
                {size}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs opacity-60">{t("form.tableSizeHint")}</p>
      </fieldset>

      {state.error ? (
        <p role="alert" className="border border-amber-600 px-2 py-1 text-sm text-amber-700">
          {t(state.error.key, state.error.params)}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="border-2 px-4 py-2 font-semibold disabled:opacity-40">
        {pending ? t("form.creating") : t("form.createRoom")}
      </button>
    </form>
  );
}
