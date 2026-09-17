"use client";

/**
 * The game, seen from one seat.
 *
 * The prototype's screen is a hot seat: it renders every player's controls and
 * you act as whoever the turn belongs to. This one is the opposite — it knows
 * which player it belongs to and shows only what that person may do. Everything
 * else is watched, not driven: a spectator sees the same scene and the same
 * options, greyed, which is what keeps four people looking at the same story
 * instead of at a waiting screen.
 *
 * It computes no rules. `view` comes from the engine's `sceneView` on the
 * server, so a choice this screen shows as locked is exactly the one the
 * reducer will refuse.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { CharacterPortrait } from "@/app/_components/character-portrait";
import { playCue } from "@/app/_components/sound";
import { SoundToggle } from "@/app/_components/sound-toggle";
import { TurnAnnouncement } from "@/app/_components/turn-announcement";
import type { Character } from "@/characters/types";
import { Minigame } from "@/app/_components/minigames";
import { hashString } from "@/engine/rng";
import type { GameState } from "@/engine/types";
import type { SceneView } from "@/engine/engine";
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

  const me = game.players.find((p) => p.id === myId);
  const isSpotlight = view.spotlight.id === myId;

  useCues(game, view);

  // Announce a scene once, on arrival. Keyed off the scene id rather than a
  // flag, so a poll landing mid-scene cannot replay the announcement — and
  // because every client sees the same id change at the same moment, the beat
  // lands together across the room without the server modelling it.
  const [announced, setAnnounced] = useState<string | null>(null);
  const announcing = game.phase === "scene" && announced !== game.sceneId;

  return (
    <div className="flex flex-col gap-4">
      <Cast
        game={game}
        myId={myId}
        characters={characters}
        spotlightId={view.spotlight.id}
        canGive={game.phase === "scene" && !pending}
        onGive={(toId) => play({ kind: "give", toId, amount: 1 })}
      />

      {chrome.clues ? <Notebook clues={chrome.clues} found={game.clues} total={chrome.clueCount} /> : null}

      <TurnClock endsAt={turnEndsAt} />

      <section
        className={`flex flex-col gap-3 border-t-4 p-4 ${
          view.isCrisis && game.phase !== "ended" ? "border-red-600" : ""
        }`}
      >
        {game.phase === "scene" ? (
          <Scene
            game={game}
            view={view}
            myId={myId}
            isSpotlight={isSpotlight}
            busy={pending}
            play={play}
          />
        ) : null}

        {game.phase === "minigame" ? (
          <SkillTest game={game} myId={myId} play={play} />
        ) : null}

        {game.phase === "result" ? (
          <Result game={game} busy={pending} onContinue={() => play({ kind: "continue" })} />
        ) : null}

        {game.phase === "ended" ? <Ending game={game} chrome={chrome} characters={characters} /> : null}
      </section>

      {error ? (
        <p role="alert" className="border border-red-600 px-2 py-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {me ? (
          <p className="text-sm opacity-60">
            You are {me.name}, with {me.stars} ⭐.
          </p>
        ) : (
          <p className="text-sm opacity-60">You are watching this one.</p>
        )}
        <SoundToggle />
      </div>

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

/**
 * Plays a cue when the run reaches a new beat.
 *
 * Driven off changes in the state rather than off the click that caused them,
 * so a spectator hears the same things as the player who acted: the room is
 * meant to react together. The key folds in everything worth a sound, and the
 * ref means a poll that changes nothing stays quiet.
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

function Cast({
  game,
  myId,
  characters,
  spotlightId,
  canGive,
  onGive,
}: {
  game: GameState;
  myId: string;
  characters: Record<string, Character>;
  spotlightId: string;
  canGive: boolean;
  onGive: (toId: string) => void;
}) {
  const me = game.players.find((p) => p.id === myId);
  const ended = game.phase === "ended";

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap items-end justify-center gap-4">
        {game.players.map((player) => {
          const isSpotlight = !ended && player.id === spotlightId;
          return (
            <li key={player.id} className="flex flex-col items-center gap-1">
              <CharacterPortrait
                player={player}
                character={characters[player.id]}
                size={isSpotlight ? 72 : 56}
                dimmed={!ended && !isSpotlight}
                blink
              />
              <span className={`text-sm ${isSpotlight ? "font-bold" : ""}`}>
                {player.name}
                {player.id === myId ? <span className="opacity-60"> (you)</span> : null}
              </span>
              <span className="text-xs tabular-nums opacity-70">{player.stars} ⭐</span>
            </li>
          );
        })}
      </ul>

      {/* Giving is the good part of the design doc, so it is one button and
          always in the same place — not buried in the crisis it rescues. */}
      {me && !ended && me.id !== spotlightId ? (
        <button
          type="button"
          className="self-center border px-3 py-1 text-sm disabled:opacity-40"
          disabled={!canGive || me.stars < 1}
          onClick={() => onGive(spotlightId)}
        >
          Give 1 ⭐ to {game.players.find((p) => p.id === spotlightId)?.name}
        </button>
      ) : null}
    </div>
  );
}

function Notebook({
  clues,
  found,
  total,
}: {
  clues: Record<string, { title: string; description?: string }>;
  found: string[];
  total: number;
}) {
  return (
    <details className="border px-2 py-1 text-sm">
      <summary className="cursor-pointer opacity-70">
        Notebook {found.length}/{total}
      </summary>
      {found.length === 0 ? (
        <p className="mt-1 opacity-40">Nothing yet.</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {found.map((id) => (
            <li key={id} className="border-l-2 pl-2">
              <span className="block">{clues[id]?.title ?? id}</span>
              {clues[id]?.description ? (
                <span className="block opacity-50">{clues[id].description}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </details>
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
    <>
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
    </>
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
    <>
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
    </>
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
    <>
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
    </>
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
    <div className="flex flex-col gap-4">
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
            <CharacterPortrait player={player} character={characters[player.id]} size={72} blink />
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
        className="border-2 px-4 py-2 font-semibold disabled:opacity-40"
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
 * with four slightly wrong clocks still agree on the moment, give or take
 * their own drift, rather than each timing their own idea of when the scene
 * began. Running out is not this component's business: the next poll asks the
 * server, and the server decides.
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
    <p
      className={`text-center text-sm tabular-nums ${left <= 10 ? "font-bold text-red-600" : "opacity-60"}`}
      // Read out only as it gets tight, so a screen reader is not counting
      // every second of a ninety-second turn.
      aria-live={left <= 10 ? "polite" : "off"}
    >
      {left > 0 ? `${left}s left` : "Time — taking the safe option."}
    </p>
  );
}
