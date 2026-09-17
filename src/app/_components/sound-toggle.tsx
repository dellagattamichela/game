"use client";

/**
 * Mute. Reads the stored preference on click rather than on mount, so nothing
 * is set from inside an effect and the server never renders a state it cannot
 * know — the button starts on "Sound" and corrects itself the moment it is
 * used or a cue is played.
 */
import { useState } from "react";
import type { Translate } from "@/i18n";
import { isMuted, playCue, setMuted } from "./sound";

export function SoundToggle({ t }: { t: Translate }) {
  const [muted, setLocal] = useState(false);

  function toggle() {
    const next = !isMuted();
    setMuted(next);
    setLocal(next);
    // A cue on unmuting doubles as the gesture that lets audio start at all.
    if (!next) playCue("turn");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={muted}
      className="text-xs underline opacity-60"
    >
      {muted ? t("sound.off") : t("sound.on")}
    </button>
  );
}
