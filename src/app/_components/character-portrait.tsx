/**
 * Placeholder character portrait.
 *
 * Stage 2 replaces the inside of this component with the real layered sprite
 * (see the design doc §4). Everything else in the app talks to it through
 * `<CharacterPortrait player={...} />`, so that swap touches only this file.
 *
 * Drawn on a 16×16 grid rather than as a circle-and-shoulders SVG on purpose:
 * the reference art in docs/reference/admin.png is a portrait bust at roughly
 * 64 logical pixels, not a 32px full body, so the placeholder should reserve the
 * right shape and framing for what is coming.
 */
import { hashString } from "@/engine/rng";
import type { PlayerState } from "@/engine/types";

/** Deterministic per-player colours, so a player looks the same all game. */
function paletteFor(playerId: string) {
  const hue = hashString(playerId) % 360;
  return {
    hair: `hsl(${hue} 55% 32%)`,
    shirt: `hsl(${(hue + 40) % 360} 45% 45%)`,
    skin: `hsl(${(hue + 20) % 360} 30% 74%)`,
    backdrop: `hsl(${hue} 25% 18%)`,
  };
}

export function CharacterPortrait({
  player,
  size = 64,
  dimmed = false,
}: {
  player: PlayerState;
  size?: number;
  dimmed?: boolean;
}) {
  const c = paletteFor(player.id);

  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      role="img"
      aria-label={`${player.name}'s character`}
      // Crisp edges now, and the same rule the real sprites will need.
      style={{ imageRendering: "pixelated", opacity: dimmed ? 0.45 : 1 }}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width="16" height="16" fill={c.backdrop} />
      {/* shoulders */}
      <rect x="1" y="12" width="14" height="4" fill={c.shirt} />
      <rect x="6" y="12" width="4" height="2" fill={c.skin} />
      {/* neck and head */}
      <rect x="7" y="10" width="2" height="2" fill={c.skin} />
      <rect x="5" y="4" width="6" height="7" fill={c.skin} />
      {/* hair: fringe plus the long sides that read as a bust rather than a ball */}
      <rect x="4" y="2" width="8" height="3" fill={c.hair} />
      <rect x="4" y="5" width="1" height="6" fill={c.hair} />
      <rect x="11" y="5" width="1" height="6" fill={c.hair} />
      {/* eyes */}
      <rect x="6" y="7" width="1" height="1" fill="#1a1a1a" />
      <rect x="9" y="7" width="1" height="1" fill="#1a1a1a" />
    </svg>
  );
}
