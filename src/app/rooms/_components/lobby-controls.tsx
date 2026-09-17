"use client";

/**
 * The three things a lobby can do: ready up, pick a story, start.
 *
 * All three take the same shape — a form carrying the room code, a server
 * action, and one line of error if the server says no. None of them decides
 * anything: whether Start is allowed, and the sentence explaining why it is
 * not, both come from `startBlocker` on the server, so the greyed-out button
 * and the rejection can never tell different stories.
 *
 * The story list arrives as plain props rather than being imported here. The
 * registry validates every story with zod at import time, and pulling that plus
 * both story files into the client bundle to render four titles would be a poor
 * trade.
 */
import { useActionState } from "react";
import {
  chooseStoryAction,
  setReadyAction,
  setTimerAction,
  startGameAction,
  type LobbyState,
} from "../actions";
import { TURN_TIMERS } from "@/rooms/types";
import { translator, type Locale, type Translate } from "@/i18n";

const EMPTY: LobbyState = { error: null };

export type StoryCard = {
  id: string;
  title: string;
  hook?: string;
  detail: string;
};

function Problem({ state, t }: { state: LobbyState; t: Translate }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="border border-amber-600 px-2 py-1 text-sm text-amber-700">
      {t(state.error.key, state.error.params)}
    </p>
  );
}

export function ReadyToggle({
  code,
  ready,
  locale,
}: {
  code: string;
  ready: boolean;
  locale: Locale;
}) {
  const t = translator(locale);
  const [state, action, pending] = useActionState(setReadyAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="ready" value={String(!ready)} />
      <button
        type="submit"
        disabled={pending}
        className={`border-2 px-4 py-2 font-semibold disabled:opacity-40 ${ready ? "opacity-70" : ""}`}
      >
        {ready ? t("lobby.notReadyAfterAll") : t("lobby.imReady")}
      </button>
      <Problem state={state} t={t} />
    </form>
  );
}

export function StoryPicker({
  code,
  stories,
  chosenId,
  locale,
}: {
  code: string;
  stories: StoryCard[];
  chosenId: string | null;
  locale: Locale;
}) {
  const t = translator(locale);
  const [state, action, pending] = useActionState(chooseStoryAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <h2 className="text-sm font-semibold">{t("lobby.story")}</h2>
      {stories.map((story) => (
        <button
          key={story.id}
          type="submit"
          name="storyId"
          value={story.id}
          disabled={pending}
          className={`border p-2 text-left disabled:opacity-40 ${
            story.id === chosenId ? "border-2 font-semibold" : "opacity-70"
          }`}
        >
          <span className="block">{story.title}</span>
          <span className="block text-xs font-normal opacity-70">{story.hook}</span>
          <span className="block text-xs font-normal opacity-50">{story.detail}</span>
        </button>
      ))}
      <Problem state={state} t={t} />
    </form>
  );
}

export function StartButton({
  code,
  blockedBecause,
  locale,
}: {
  code: string;
  blockedBecause: string | null;
  locale: Locale;
}) {
  const t = translator(locale);
  const [state, action, pending] = useActionState(startGameAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={pending || blockedBecause !== null}
        className="border-2 px-4 py-2 font-semibold disabled:opacity-40"
      >
        {pending ? t("lobby.starting") : t("lobby.start")}
      </button>
      {blockedBecause ? <p className="text-sm opacity-60">{blockedBecause}</p> : null}
      <Problem state={state} t={t} />
    </form>
  );
}

/**
 * The doc's turn timer: off, a minute, or ninety seconds.
 *
 * Off by default, because a clock is something a host turns on for a room that
 * needs it, not a thing sprung on people who are enjoying the deliberating.
 */
export function TimerPicker({
  code,
  seconds,
  locale,
}: {
  code: string;
  seconds: number;
  locale: Locale;
}) {
  const t = translator(locale);
  const [state, action, pending] = useActionState(setTimerAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold">{t("lobby.turnTimer")}</h2>
      <div className="flex gap-2">
        {TURN_TIMERS.map((option) => (
          <button
            key={option}
            type="submit"
            name="seconds"
            value={option}
            disabled={pending}
            className={`flex-1 border py-1 text-sm disabled:opacity-40 ${
              option === seconds ? "border-2 font-semibold" : "opacity-70"
            }`}
          >
            {option === 0 ? t("lobby.timerOff") : t("lobby.timerSeconds", { seconds: option })}
          </button>
        ))}
      </div>
      <p className="text-xs opacity-60">
        {t("lobby.timerHint")}
      </p>
      <input type="hidden" name="code" value={code} />
      <Problem state={state} t={t} />
    </form>
  );
}
