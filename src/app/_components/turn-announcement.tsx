"use client";

/**
 * The beat between scenes: "It's Bo's turn."
 *
 * This is presentation, not a game phase, so it lives in the UI and not in the
 * engine. It is keyed off `sceneId` changing, which every client sees at the
 * same moment from the same state, so it will still land in sync once rooms
 * exist without the server having to model it.
 *
 * It auto-dismisses, because a game among friends should not need someone to
 * click "ok" before every scene. Clicking skips it for players who read fast.
 */
import { useEffect } from "react";
import type { PlayerState } from "@/engine/types";
import { CharacterPortrait } from "./character-portrait";

export const ANNOUNCEMENT_MS = 1900;

export function TurnAnnouncement({
  spotlight,
  cast,
  mode,
  isCrisis,
  onDone,
}: {
  spotlight: PlayerState;
  cast: PlayerState[];
  mode: "spotlight" | "group";
  isCrisis: boolean;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, ANNOUNCEMENT_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  const isGroup = mode === "group";

  return (
    <div
      // Not a modal dialog: it takes no input beyond "skip", and trapping focus
      // for under two seconds would fight a keyboard user rather than help them.
      role="status"
      aria-live="polite"
      onClick={onDone}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-4 bg-black/85 text-white"
    >
      {isCrisis && (
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-red-500">Crisis</p>
      )}

      <div className="flex gap-2">
        {isGroup ? (
          cast.map((p) => <CharacterPortrait key={p.id} player={p} size={72} />)
        ) : (
          <CharacterPortrait player={spotlight} size={128} />
        )}
      </div>

      <p className="text-3xl font-bold">
        {isGroup ? "Everyone votes" : `It's ${spotlight.name}'s turn`}
      </p>
      <p className="text-xs uppercase tracking-widest opacity-50">tap to skip</p>
    </div>
  );
}
