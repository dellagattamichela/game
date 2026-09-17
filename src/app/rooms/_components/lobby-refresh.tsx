"use client";

/**
 * The heartbeat.
 *
 * Every tick tells the server this browser is still here, lets the turn clock
 * run out if it has, and re-renders the page with whatever changed. One call,
 * because presence, the clock and the refresh all want the same interval and
 * three requests every two seconds per player is three times the traffic for
 * the same information.
 *
 * A stand-in, and a knowingly crude one: a real-time channel replaces this
 * component entirely. Polling stops while the tab is hidden — a lobby left
 * open in a background tab costs nothing, and a room nobody is looking at has
 * nothing to hurry.
 */
import { useEffect } from "react";
import { pollAction } from "../actions";

export function LobbyRefresh({
  code,
  everyMs = 3000,
  paused = false,
}: {
  code: string;
  everyMs?: number;
  /** Set while this player is mid-puzzle, or once the run is over. */
  paused?: boolean;
}) {
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      if (!document.hidden) void pollAction(code);
    }, everyMs);
    return () => clearInterval(timer);
  }, [code, everyMs, paused]);

  return null;
}
