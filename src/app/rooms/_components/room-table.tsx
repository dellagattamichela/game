"use client";

/**
 * The game, seen from one seat.
 *
 * The prototype's screen is a hot seat: it renders every player's controls and
 * you act as whoever the turn belongs to. This one is the opposite — it knows
 * which player it belongs to and enables only what that person may do.
 * Everyone else watches the same scene with the same options greyed, which is
 * what keeps four people looking at one story instead of at a waiting screen.
 *
 * The framing is the prototype's, deliberately: the cast on a stage above, a
 * dialog box pinned to the bottom with whoever is speaking on the left, a
 * crisis marked in red, the notebook where the room can see it. That shape is
 * the visual-novel look the game is aiming for, and a room should not look
 * like a different game from the one on the front page.
 *
 * It computes no rules. `view` comes from the engine's `sceneView` on the
 * server, so a choice this screen shows as locked is exactly the one the
 * reducer will refuse, and the speaker it shows is the one the story named.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { CharacterPortrait } from "@/app/_components/character-portrait";
import { CharacterSprite } from "@/app/_components/character-sprite";
import { playCue } from "@/app/_components/sound";
import { SoundToggle } from "@/app/_components/sound-toggle";
import { Minigame } from "@/app/_components/minigames";
import { TurnAnnouncement } from "@/app/_components/turn-announcement";
import { castCharacter } from "@/characters/character";
import type { Character } from "@/characters/types";
import { hashString } from "@/engine/rng";
import type { GameState } from "@/engine/types";
import type { SceneView, SpeakerView } from "@/engine/engine";
import { playAction, type PlayInput } from "../actions";
import { downloadEndingCard } from "./ending-card";

/** Story text the table needs but the engine state does not carry. */
export type StoryChrome = {
  title: string;
  /** Titles and blurbs for the notebook, keyed by clue id. Null for stories without clues. */
  clues: Record<string, { title: string; description?: string }> | null;
  clueCount: number;
  mishaps: Record<string, string>;
  /** Resolved server-side once the run is over. */
  ending: { title: string; text?: string } | null;
  /** Computed from the log server-side, so every screen reads the same run. */
  awards: { id: string; title: string; detail: string; who: string }[];
  /** The scenes worth retelling, already summarised. */
  recap: { label: string; note: string }[];
  /** Art key for the current scene. Placeholder until stage 6 art exists. */
  background?: string;
};

export function RoomTable({
  code,
  myId,
  game,
  view,
  chrome,
  characters,
  turnEndsAt,
}: {
  code: string;
  myId: string;
  game: GameState;
  view: SceneView;
  chrome: StoryChrome;
  characters: Record<string, Character>;
  /** Epoch ms the current decision runs out, or null when nothing is timed. */
  turnEndsAt: number | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function play(input: PlayInput) {
    startTransition(async () => {
      const result = await playAction(code, input);
      setError(result.error);
    });
  }

  useCues(game, view);

  // Announce a scene once, on arrival. Keyed off the scene id rather than a
  // flag, so a poll landing mid-scene cannot replay the announcement — and
  // because every client sees the same id change at the same moment, the beat
  // lands together across the room without the server modelling it.
  const [announced, setAnnounced] = useState<string | null>(null);
  const announcing = game.phase === "scene" && announced !== game.sceneId;

  const isSpotlight = view.spotlight.id === myId;

  return (
    <div className="flex h-dvh flex-col">
      <TopBar game={game} chrome={chrome} turnEndsAt={turnEndsAt} />

      <Stage
        game={game}
        chrome={chrome}
        characters={characters}
        myId={myId}
        spotlightId={view.spotlight.id}
        canGive={game.phase === "scene" && !pending && !announcing}
        onGive={(toId) => play({ kind: "give", toId, amount: 1 })}
      />

      {error ? (
        <p role="alert" className="mx-auto w-full max-w-4xl px-4 pb-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <DialogBox
        game={game}
        view={view}
        chrome={chrome}
        characters={characters}
        myId={myId}
        isSpotlight={isSpotlight}
        busy={pending}
        play={play}
      />

      {announcing ? (
        <TurnAnnouncement
          spotlight={view.spotlight}
          cast={game.players}
          mode={view.mode}
          isCrisis={view.isCrisis}
          onDone={() => setAnnounced(game.sceneId)}
        />
      ) : null}
    </div>
  );
}

function TopBar({
  game,
  chrome,
  turnEndsAt,
}: {
  game: GameState;
  chrome: StoryChrome;
  turnEndsAt: number | null;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <div className="flex items-baseline gap-2">
        <h1 className="font-bold">{chrome.title}</h1>
        <p className="text-xs opacity-60">
          {game.phase === "ended"
            ? `${game.log.length} scenes played`
            : `scene ${game.sceneId} · ${game.log.length} resolved`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <TurnClock endsAt={turnEndsAt} />
        {game.mishaps.map((id) => (
          <span key={id} className="border border-amber-600 px-2 py-0.5 text-xs text-amber-700">
            {chrome.mishaps[id] ?? id}
          </span>
        ))}
        <SoundToggle />
      </div>
    </header>
  );
}

function Stage({
  game,
  chrome,
  characters,
  myId,
  spotlightId,
  canGive,
  onGive,
}: {
  game: GameState;
  chrome: StoryChrome;
  characters: Record<string, Character>;
  myId: string;
  spotlightId: string;
  canGive: boolean;
  onGive: (toId: string) => void;
}) {
  const me = game.players.find((p) => p.id === myId);
  const ended = game.phase === "ended";

  return (
    <div className="relative flex min-h-0 flex-1 items-end justify-center overflow-hidden border-b bg-neutral-100 dark:bg-neutral-900">
      {/* Backgrounds are stage 6 art. Filling the stage with the placeholder
          keeps the empty space reading as "art goes here" rather than as a gap. */}
      <div className="absolute inset-2 flex items-start justify-center border border-dashed opacity-40">
        <span className="px-2 py-1 text-xs">background: {chrome.background ?? "none"}</span>
      </div>

      {/* The notebook. An investigation is only legible if the room can see
          what it already knows, so it sits on screen rather than behind a tab. */}
      {chrome.clues ? (
        <div className="absolute left-3 top-10 max-h-[70%] w-56 overflow-y-auto text-xs">
          <p className="mb-1 font-semibold uppercase tracking-wide opacity-60">
            Notebook {game.clues.length}/{chrome.clueCount}
          </p>
          {game.clues.length === 0 ? (
            <p className="opacity-40">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {game.clues.map((id) => (
                <li key={id} className="border-l-2 pl-2">
                  <span className="block">{chrome.clues![id]?.title ?? id}</span>
                  {chrome.clues![id]?.description ? (
                    <span className="block opacity-50">{chrome.clues![id].description}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <ul className="relative flex flex-wrap items-end justify-center gap-4 p-6">
        {game.players.map((player) => {
          const isSpotlight = !ended && player.id === spotlightId;
          return (
            <li key={player.id} className="flex flex-col items-center gap-1">
              <CharacterPortrait
                player={player}
                character={characters[player.id]}
                size={isSpotlight ? 88 : 64}
                dimmed={!ended && !isSpotlight}
                blink
              />
              <span className={`text-sm ${isSpotlight ? "font-bold" : ""}`}>
                {player.name}
                {player.id === myId ? <span className="opacity-60"> (you)</span> : null}{" "}
                <span className="tabular-nums opacity-70">{player.stars} ⭐</span>
              </span>
              {/* Only your own seat gets a button: this is one player's screen,
                  not the hot seat, so you can hand over your own Stars only. */}
              {player.id === myId && !ended && player.id !== spotlightId ? (
                <button
                  type="button"
                  className="border px-1 py-0.5 text-xs disabled:opacity-30"
                  disabled={!canGive || (me?.stars ?? 0) < 1}
                  onClick={() => onGive(spotlightId)}
                >
                  Give 1 ⭐
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Portrait plus name for whoever the dialog is speaking as. */
function Speaker({
  speaker,
  characters,
}: {
  speaker: SpeakerView;
  characters: Record<string, Character>;
}) {
  if (speaker.kind === "cast") {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1">
        <CharacterSprite
          character={castCharacter(speaker.id, speaker.look)}
          size={72}
          label={`${speaker.name}'s portrait`}
          blinkSeed={hashString(speaker.id)}
        />
        <span className="text-sm font-semibold">{speaker.name}</span>
      </div>
    );
  }

  const players = speaker.kind === "everyone" ? speaker.players : [speaker.player];
  const label = speaker.kind === "everyone" ? "Everyone" : speaker.player.name;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="flex -space-x-4">
        {players.map((p) => (
          <CharacterPortrait
            key={p.id}
            player={p}
            character={characters[p.id]}
            size={players.length > 1 ? 44 : 72}
          />
        ))}
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

function DialogBox({
  game,
  view,
  chrome,
  characters,
  myId,
  isSpotlight,
  busy,
  play,
}: {
  game: GameState;
  view: SceneView;
  chrome: StoryChrome;
  characters: Record<string, Character>;
  myId: string;
  isSpotlight: boolean;
  busy: boolean;
  play: (input: PlayInput) => void;
}) {
  // During a skill test the attempting player speaks, whatever the scene says,
  // and the ending belongs to the whole room.
  const attempting = game.minigame
    ? game.players.find((p) => p.id === game.minigame!.playerId)
    : undefined;
  const speaker: SpeakerView = attempting
    ? { kind: "spotlight", player: attempting }
    : game.phase === "ended"
      ? { kind: "everyone", players: game.players }
      : view.speaker;

  return (
    <section
      className={`shrink-0 border-t-4 p-4 ${
        view.isCrisis && game.phase !== "ended" ? "border-red-600" : ""
      }`}
    >
      <div className="mx-auto flex w-full max-w-4xl gap-4">
        <Speaker speaker={speaker} characters={characters} />
        <div className="min-w-0 flex-1">
          {game.phase === "scene" ? (
            <Scene game={game} view={view} myId={myId} isSpotlight={isSpotlight} busy={busy} play={play} />
          ) : null}
          {game.phase === "minigame" ? <SkillTest game={game} myId={myId} play={play} /> : null}
          {game.phase === "result" ? (
            <Result game={game} busy={busy} onContinue={() => play({ kind: "continue" })} />
          ) : null}
          {game.phase === "ended" ? (
            <Ending game={game} chrome={chrome} characters={characters} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Scene({
  game,
  view,
  myId,
  isSpotlight,
  busy,
  play,
}: {
  game: GameState;
  view: SceneView;
  myId: string;
  isSpotlight: boolean;
  busy: boolean;
  play: (input: PlayInput) => void;
}) {
  const byId = Object.fromEntries(game.players.map((p) => [p.id, p.name]));
  // Hidden choices are not rendered at all: a Star gate is shown locked with
  // its price, but a clue gate must not admit that it exists.
  const choices = view.choices.filter((choice) => !choice.hidden);

  return (
    <div className="flex flex-col gap-3">
      {view.isCrisis ? (
        <p className="text-xs font-bold uppercase tracking-widest text-red-600">Crisis</p>
      ) : null}
      <p className="leading-relaxed">{view.text}</p>

      {view.mode === "spotlight" ? (
        <>
          <p className="text-sm opacity-70">
            {isSpotlight ? "Your call." : `${view.spotlight.name} is deciding.`}
          </p>
          <ul className="flex flex-col gap-1">
            {choices.map((choice) => (
              <li key={choice.index}>
                <button
                  type="button"
                  className="w-full border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!isSpotlight || choice.locked || busy}
                  onClick={() => play({ kind: "choose", choiceIndex: choice.index })}
                >
                  {choice.label}
                  {choice.cost > 0 ? <strong className="ml-2">{choice.cost} ⭐</strong> : null}
                  {choice.lockedReason ? (
                    <em className="ml-2 text-sm not-italic opacity-70">{choice.lockedReason}</em>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {/* Said out loud, because the answer is usually "someone hand them a Star". */}
          {isSpotlight && choices.some((c) => c.shortfall > 0) ? (
            <p className="text-sm opacity-70">Someone else may have a Star to spare.</p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm opacity-70">
            {view.awaitingVotes.length > 0
              ? `Waiting on ${view.awaitingVotes.map((p) => p.name).join(", ")}.`
              : "Counting…"}
          </p>
          <ul className="flex flex-col gap-2">
            {choices.map((choice) => (
              <li key={choice.index} className="border p-2">
                <button
                  type="button"
                  className={`w-full text-left disabled:opacity-50 ${
                    game.votes[myId] === choice.index ? "font-semibold" : ""
                  }`}
                  disabled={busy}
                  onClick={() => play({ kind: "vote", choiceIndex: choice.index })}
                >
                  {game.votes[myId] === choice.index ? "▸ " : ""}
                  {choice.label}
                </button>
                {choice.votes.length > 0 ? (
                  <p className="mt-1 text-xs opacity-70">
                    {choice.votes.map((id) => byId[id]).join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SkillTest({
  game,
  myId,
  play,
}: {
  game: GameState;
  myId: string;
  play: (input: PlayInput) => void;
}) {
  const attempt = game.minigame;
  if (!attempt) return null;

  const who = game.players.find((p) => p.id === attempt.playerId);
  const mine = attempt.playerId === myId;
  // Seeded from the run, the scene and the choice, so every screen in the room
  // draws the same puzzle — spectators watch the one being played, not another.
  const seed = hashString(`${game.seed}:${game.sceneId}:${attempt.choiceIndex}`);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <strong>{who?.name}</strong> only gets one go at this.
        <span className="ml-2 opacity-60">difficulty {attempt.spec.difficulty}/5</span>
      </p>
      {mine ? (
        <Minigame
          // Remounts per attempt, so a puzzle never inherits the previous one's state.
          key={`${game.sceneId}:${attempt.choiceIndex}`}
          spec={attempt.spec}
          seed={seed}
          onDone={(passed) => play({ kind: "minigame", passed })}
        />
      ) : (
        <p className="opacity-70">Hold your breath.</p>
      )}
    </div>
  );
}

function Result({
  game,
  busy,
  onContinue,
}: {
  game: GameState;
  busy: boolean;
  onContinue: () => void;
}) {
  const pending = game.pending;
  if (!pending) return null;

  const byId = Object.fromEntries(game.players.map((p) => [p.id, p.name]));
  const deltas = Object.entries(pending.deltas).filter(([, n]) => n !== 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm opacity-60">{pending.label}</p>
      {pending.text ? <p className="leading-relaxed">{pending.text}</p> : null}

      {pending.gifts.length > 0 ? (
        <ul className="text-sm opacity-70">
          {pending.gifts.map((gift, i) => (
            <li key={i}>
              {byId[gift.fromId]} gave {gift.amount} ⭐ to {byId[gift.toId]}
            </li>
          ))}
        </ul>
      ) : null}

      {deltas.length > 0 ? (
        <ul className="flex flex-wrap gap-3 text-sm">
          {deltas.map(([id, n]) => (
            <li key={id} className="tabular-nums">
              {byId[id]} {n > 0 ? `+${n}` : n} ⭐
            </li>
          ))}
        </ul>
      ) : null}

      {pending.minigame ? (
        <p
          className={`border px-3 py-1 text-sm ${
            pending.minigame.passed
              ? "border-emerald-600 text-emerald-700"
              : "border-red-600 text-red-600"
          }`}
        >
          {pending.minigame.passed ? "Passed." : "Failed."}
        </p>
      ) : null}

      {pending.cluesFound.length > 0 ? (
        <p className="border border-sky-600 px-3 py-1 text-sm text-sky-700">
          {pending.cluesFound.length === 1
            ? "Clue found"
            : `${pending.cluesFound.length} clues found`}
          {" — added to the notebook."}
        </p>
      ) : null}

      {pending.mishapAdded ? (
        <p className="border border-amber-600 px-3 py-1 text-sm text-amber-700">
          Mishap collected.
        </p>
      ) : null}

      {/* Anyone may move the room on. Whoever reads fastest ends up driving,
          which is how it works around a table too. */}
      <button
        type="button"
        className="self-start border-2 px-4 py-1 font-semibold disabled:opacity-40"
        disabled={busy}
        onClick={onContinue}
      >
        {pending.next ? "Next scene" : "See how it went"}
      </button>
    </div>
  );
}

function Ending({
  game,
  chrome,
  characters,
}: {
  game: GameState;
  chrome: StoryChrome;
  characters: Record<string, Character>;
}) {
  const cast = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const sprites = [...(cast.current?.querySelectorAll("svg") ?? [])] as SVGSVGElement[];
      await downloadEndingCard(
        {
          storyTitle: chrome.title,
          endingTitle: chrome.ending?.title ?? "The end",
          names: game.players.map((p) => p.name),
          awards: chrome.awards,
        },
        sprites,
      );
    } catch {
      setSaveError("This browser would not make the picture.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto">
      <div>
        <p className="text-xs uppercase tracking-widest opacity-60">Ending</p>
        <h2 className="text-xl font-bold">{chrome.ending?.title}</h2>
      </div>
      {chrome.ending?.text ? (
        <p className="text-sm leading-relaxed">{chrome.ending.text}</p>
      ) : null}

      {/* The whole cast together, undimmed: the doc's ending screen is a group
          photo, and nobody is in the spotlight once the story is over. */}
      <div ref={cast} className="flex flex-wrap justify-center gap-4">
        {game.players.map((player) => (
          <div key={player.id} className="flex flex-col items-center gap-1">
            <CharacterPortrait player={player} character={characters[player.id]} size={64} />
            <span className="text-sm">{player.name}</span>
            <span className="text-xs tabular-nums opacity-60">{player.stars} ⭐</span>
          </div>
        ))}
      </div>

      {chrome.awards.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Awards</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {chrome.awards.map((award) => (
              <li key={award.id} className="flex justify-between gap-2 border px-2 py-1">
                <span className="opacity-70">{award.title}</span>
                <span>
                  <strong>{award.who}</strong>
                  <span className="ml-2 tabular-nums opacity-60">{award.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {game.mishaps.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Mishaps collected</h3>
          <ul className="list-inside list-disc text-sm opacity-80">
            {game.mishaps.map((id) => (
              <li key={id}>{chrome.mishaps[id] ?? id}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">How it went</h3>
        <ol className="flex flex-col gap-1 text-sm opacity-80">
          {chrome.recap.map((moment, i) => (
            <li key={i}>
              {moment.label}
              {moment.note ? <span className="ml-2 opacity-60">{moment.note}</span> : null}
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        className="self-start border-2 px-4 py-1 font-semibold disabled:opacity-40"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Drawing…" : "Download the ending"}
      </button>
      {saveError ? (
        <p role="alert" className="text-sm text-amber-700">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The countdown, when the host has set a timer.
 *
 * Counts down to `endsAt`, which the server put on the room — so four browsers
 * with four slightly wrong clocks still agree on the moment, rather than each
 * timing its own idea of when the scene began. Running out is not this
 * component's business: the next poll asks the server, and the server decides.
 */
function TurnClock({ endsAt }: { endsAt: number | null }) {
  // The clock reading, not the seconds left: keeping "now" in state and doing
  // the subtraction at render time means nothing is set from inside the effect
  // body, and the server never renders a number the client then disagrees with.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (endsAt === null || now === null) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));

  return (
    <span
      className={`text-xs tabular-nums ${left <= 10 ? "font-bold text-red-600" : "opacity-60"}`}
      // Read out only as it gets tight, so a screen reader is not counting
      // every second of a ninety-second turn.
      aria-live={left <= 10 ? "polite" : "off"}
    >
      {left > 0 ? `${left}s` : "time"}
    </span>
  );
}

/**
 * Plays a cue when the run reaches a new beat.
 *
 * Driven off changes in the state rather than off the click that caused them,
 * so a spectator hears the same things as the player who acted: the room is
 * meant to react together. The ref means a poll that changes nothing stays
 * quiet.
 */
function useCues(game: GameState, view: SceneView) {
  const last = useRef<string | null>(null);

  useEffect(() => {
    const key = `${game.phase}:${game.sceneId}:${game.pending?.minigame?.passed ?? ""}`;
    if (last.current === key) return;
    const first = last.current === null;
    last.current = key;
    // Nothing on the first render: arriving at a page is not an event.
    if (first) return;

    if (game.phase === "ended") return playCue("ending");
    if (game.phase === "scene") return playCue(view.isCrisis ? "crisis" : "turn");
    if (game.phase === "result" && game.pending?.minigame) {
      return playCue(game.pending.minigame.passed ? "pass" : "fail");
    }
    if (game.phase === "result" && game.pending?.gifts.length) return playCue("star");
  }, [game.phase, game.sceneId, game.pending, view.isCrisis]);
}
