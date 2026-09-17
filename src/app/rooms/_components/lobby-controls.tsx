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
  startGameAction,
  type LobbyState,
} from "../actions";

const EMPTY: LobbyState = { error: null };

export type StoryCard = {
  id: string;
  title: string;
  hook?: string;
  detail: string;
};

function Problem({ state }: { state: LobbyState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="border border-amber-600 px-2 py-1 text-sm text-amber-700">
      {state.error}
    </p>
  );
}

export function ReadyToggle({ code, ready }: { code: string; ready: boolean }) {
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
        {ready ? "I'm not ready after all" : "I'm ready"}
      </button>
      <Problem state={state} />
    </form>
  );
}

export function StoryPicker({
  code,
  stories,
  chosenId,
}: {
  code: string;
  stories: StoryCard[];
  chosenId: string | null;
}) {
  const [state, action, pending] = useActionState(chooseStoryAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <h2 className="text-sm font-semibold">Story</h2>
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
      <Problem state={state} />
    </form>
  );
}

export function StartButton({ code, blockedBecause }: { code: string; blockedBecause: string | null }) {
  const [state, action, pending] = useActionState(startGameAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={pending || blockedBecause !== null}
        className="border-2 px-4 py-2 font-semibold disabled:opacity-40"
      >
        {pending ? "Starting…" : "Start the game"}
      </button>
      {blockedBecause ? <p className="text-sm opacity-60">{blockedBecause}</p> : null}
      <Problem state={state} />
    </form>
  );
}
