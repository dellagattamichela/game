"use client";

/**
 * Keeps the lobby roughly current by re-fetching the server component.
 *
 * A stand-in, and a knowingly crude one: stage 4 gives rooms a real-time
 * channel and this component goes away with it. Until then a host has no way
 * to see that anyone arrived, which makes joining impossible to even watch
 * work. Polling is skipped while the tab is hidden, so a lobby left open in a
 * background tab costs nothing.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LobbyRefresh({ everyMs = 3000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);

  return null;
}
