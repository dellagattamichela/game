"use client";

/**
 * The character creator, laid out as the design doc describes it: the preview
 * large in the middle, category tabs down one side, a grid of options for the
 * chosen tab, arrows to flick through a layer without reading labels, and a
 * Randomize button for people who want to get on with it.
 *
 * Two things are worth knowing about how it saves. It does not autosave on
 * every click — a preview is a place to fiddle, and forty saves on the way to
 * one face is forty writes every other player's lobby has to redraw. And what
 * you build is also kept in this browser, so the next room you join starts from
 * the person you already made rather than from the default face again.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CharacterSprite } from "@/app/_components/character-sprite";
import {
  CHOICES,
  GROUPS,
  PALETTES,
  cycle,
  fieldsInGroup,
  normalizeCharacter,
  randomCharacter,
} from "@/characters/character";
import type { Group } from "@/characters/character";
import type { Character, CharacterField } from "@/characters/types";
import { saveCharacterAction, type ActionError } from "../actions";
import { translator, type Locale, type Translate } from "@/i18n";

/** Where this browser remembers the last face its owner built. */
const REMEMBERED = "pilot-season:character";

const COLOUR_FIELDS: Partial<Record<CharacterField, keyof typeof PALETTES>> = {
  skin: "skin",
  hairColor: "hair",
  eyeColor: "eye",
  topColor: "top",
};

export function CharacterCreator({
  code,
  initial,
  playerName,
  locale,
}: {
  code: string;
  initial: Character;
  playerName: string;
  locale: Locale;
}) {
  const t = translator(locale);
  const router = useRouter();
  const [character, setCharacter] = useState(initial);
  const [group, setGroup] = useState<Group>("Body");
  const [error, setError] = useState<ActionError>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const dirty = JSON.stringify(character) !== JSON.stringify(initial);

  function remember(next: Character) {
    try {
      localStorage.setItem(REMEMBERED, JSON.stringify(next));
    } catch {
      // Private mode, or storage refused. Losing the memory of a face between
      // rooms is a small loss and not worth interrupting anyone over.
    }
  }

  /**
   * Bring back the face this browser last saved. A button rather than an
   * automatic load: reading storage on mount would mean overwriting, without
   * being asked, whatever this player already looks like in this room.
   */
  function recall() {
    try {
      const saved = localStorage.getItem(REMEMBERED);
      if (!saved) {
        setNote(t("creator.nothingSaved"));
        return;
      }
      setCharacter(normalizeCharacter(JSON.parse(saved)));
      setNote(null);
    } catch {
      setNote(t("creator.storageRefused"));
    }
  }

  function save() {
    startSaving(async () => {
      const result = await saveCharacterAction(code, character);
      setError(result.error);
      if (!result.error) {
        remember(character);
        router.push(`/rooms/${code}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <CharacterSprite character={character} size={192} label={`${playerName}'s character`} />
        </div>
        <p className="text-sm opacity-60">{playerName}</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 border px-3 py-1 text-sm"
          onClick={() => setCharacter(randomCharacter(Math.floor(Math.random() * 0xffffffff)))}
        >
          {t("creator.randomize")}
        </button>
        <button
          type="button"
          className="flex-1 border px-3 py-1 text-sm"
          onClick={recall}
        >
          {t("creator.lastCharacter")}
        </button>
        <button
          type="button"
          className="flex-1 border px-3 py-1 text-sm disabled:opacity-40"
          disabled={!dirty}
          onClick={() => setCharacter(initial)}
        >
          {t("creator.undo")}
        </button>
      </div>

      {note ? <p className="text-sm opacity-60">{note}</p> : null}

      <nav className="flex flex-wrap gap-1">
        {GROUPS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setGroup(name)}
            className={`border px-3 py-1 text-sm ${
              name === group ? "border-2 font-semibold" : "opacity-70"
            }`}
          >
            {t(`group.${name}`)}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-4">
        {fieldsInGroup(group).map((field) => (
          <Layer
            key={field}
            field={field}
            character={character}
            onChange={setCharacter}
            t={t}
          />
        ))}
      </div>

      {error ? (
        <p role="alert" className="border border-amber-600 px-2 py-1 text-sm text-amber-700">
          {t(error.key, error.params)}
        </p>
      ) : null}

      <button
        type="button"
        className="border-2 px-4 py-2 font-semibold disabled:opacity-40"
        disabled={saving}
        onClick={save}
      >
        {saving ? t("creator.saving") : dirty ? t("creator.saveAndBack") : t("creator.backToLobby")}
      </button>
    </div>
  );
}

function Layer({
  field,
  character,
  onChange,
  t,
}: {
  field: CharacterField;
  character: Character;
  onChange: (next: Character) => void;
  t: Translate;
}) {
  const { options, optional } = CHOICES[field];
  const title = t(`field.${field}`);
  const swatches = COLOUR_FIELDS[field];
  const current = character[field];

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex gap-1">
          {/* The doc's arrows: flick through a layer without reading a grid. */}
          <button
            type="button"
            aria-label={t("creator.previous", { layer: title })}
            className="border px-2 text-sm"
            onClick={() => onChange(cycle(character, field, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={t("creator.next", { layer: title })}
            className="border px-2 text-sm"
            onClick={() => onChange(cycle(character, field, 1))}
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {optional ? (
          <Option
            selected={current === null}
            title={t("creator.none")}
            onClick={() => onChange({ ...character, [field]: null })}
          />
        ) : null}

        {options.map((option) => (
          <Option
            key={option.id}
            selected={current === option.id}
            title={t(`part.${field}.${option.id}` as never)}
            swatch={
              swatches
                ? PALETTES[swatches].find((p) => p.id === option.id)?.base
                : undefined
            }
            onClick={() => onChange({ ...character, [field]: option.id })}
          />
        ))}
      </div>
    </section>
  );
}

function Option({
  selected,
  title,
  swatch,
  onClick,
}: {
  selected: boolean;
  title: string;
  swatch?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={`flex items-center gap-1 border px-2 py-1 text-xs ${
        selected ? "border-2 font-semibold" : "opacity-70"
      }`}
    >
      {swatch ? (
        <span
          aria-hidden
          className="inline-block h-3 w-3 border border-black/20"
          style={{ background: swatch }}
        />
      ) : null}
      {title}
    </button>
  );
}

