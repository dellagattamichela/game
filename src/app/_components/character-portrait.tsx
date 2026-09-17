/**
 * A player's portrait.
 *
 * Thin wrapper over `CharacterSprite` that answers one question the sprite
 * cannot: what does someone look like who has not built a character yet? The
 * answer is a character derived from their player id — stable, so they look the
 * same all game, and different from the person next to them. The hot-seat
 * prototype never opens the creator and still gets a cast of distinct faces.
 */
import { randomCharacter } from "@/characters/character";
import type { Character } from "@/characters/types";
import { hashString } from "@/engine/rng";
import type { PlayerState } from "@/engine/types";
import { CharacterSprite } from "./character-sprite";

export function CharacterPortrait({
  player,
  character,
  size = 64,
  dimmed = false,
}: {
  player: Pick<PlayerState, "id" | "name">;
  /** Omitted for a player who has not been to the creator. */
  character?: Character | null;
  size?: number;
  dimmed?: boolean;
}) {
  return (
    <CharacterSprite
      character={character ?? randomCharacter(hashString(player.id))}
      size={size}
      dimmed={dimmed}
      label={`${player.name}'s character`}
    />
  );
}
