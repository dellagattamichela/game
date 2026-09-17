"use client";

/**
 * Stage 1 prototype: the whole room on one screen, hot-seat.
 *
 * There are no rooms or networking yet, so this stands in for four people on
 * four devices. Everything on screen is driven by the engine's `sceneView`, and
 * every button dispatches an engine action — the same actions a client will send
 * to the server once rooms exist. Nothing here computes game rules locally.
 *
 * Layout is the visual-novel shape the game is aiming for: the cast on a stage
 * above, a dialog box pinned to the bottom with the speaking character on the
 * left, and a turn announcement between scenes. The art inside it is placeholder
 * (see character-portrait.tsx); the mechanic is what is being tested.
 */
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  applyAction,
  createGame,
  resolveEnding,
  sceneView,
  spotlightPlayer,
} from "@/engine/engine";
import { hashString, newSeed } from "@/engine/rng";
import { STORIES, requireStory } from "@/stories";
import type { Action, GameState, PlayerState, SceneMode, Story } from "@/engine/types";
import { CharacterPortrait } from "./character-portrait";
import { Minigame } from "./minigames";
import { TurnAnnouncement } from "./turn-announcement";

const DEFAULT_NAMES = ["Ada", "Bo", "Cy", "Di"];

export function Prototype() {
  const [storyId, setStoryId] = useState(STORIES[0].id);
  const story = useMemo(() => requireStory(storyId), [storyId]);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The last scene whose announcement has already played. */
  const [announced, setAnnounced] = useState<string | null>(null);

  function dispatch(action: Action) {
    if (!state) return;
    const result = applyAction(story, state, action);
    // Rejections are surfaced rather than swallowed: during a prototype an
    // unexpected "not_spotlight" is a bug worth seeing, not a no-op.
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setState(result.state);
  }

  function start() {
    setAnnounced(null);
    setError(null);
    setState(
      createGame(
        story,
        names.map((name, i) => ({ id: `p${i + 1}`, name })),
        newSeed(),
      ),
    );
  }

  // Declared before the early return so the hook order stays stable.
  const dismissAnnouncement = useCallback(() => {
    setAnnounced(state?.sceneId ?? null);
  }, [state?.sceneId]);

  if (!state) {
    return (
      <Setup
        story={story}
        storyId={storyId}
        onStoryId={setStoryId}
        names={names}
        onNames={setNames}
        onStart={start}
      />
    );
  }

  const view = sceneView(story, state);
  // Announce a scene once, on arrival. Comparing scene ids rather than holding a
  // boolean means a rejected action mid-scene cannot replay the announcement.
  const announcing = state.phase === "scene" && announced !== state.sceneId;

  return (
    <div className="flex h-dvh flex-col">
      <TopBar story={story} state={state} onReset={() => setState(null)} />

      <Stage
        story={story}
        state={state}
        background={story.scenes[state.sceneId].background}
        canGive={state.phase === "scene" && !announcing}
        dispatch={dispatch}
      />

      {error && (
        <p role="alert" className="mx-auto w-full max-w-4xl px-4 pb-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <DialogBox
        story={story}
        state={state}
        mode={view.mode}
        isCrisis={view.isCrisis}
        dispatch={dispatch}
      />

      {announcing && (
        <TurnAnnouncement
          spotlight={view.spotlight}
          cast={state.players}
          mode={view.mode}
          isCrisis={view.isCrisis}
          onDone={dismissAnnouncement}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Setup({
  story,
  storyId,
  onStoryId,
  names,
  onNames,
  onStart,
}: {
  story: Story;
  storyId: string;
  onStoryId: (id: string) => void;
  names: string[];
  onNames: (names: string[]) => void;
  onStart: () => void;
}) {
  const wrongCount = names.length < story.players.min || names.length > story.players.max;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Pilot Season</h1>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Story</legend>
        {STORIES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onStoryId(s.id)}
            className={`border p-2 text-left ${s.id === storyId ? "border-2 font-semibold" : "opacity-70"}`}
          >
            <span className="block">{s.title}</span>
            <span className="block text-xs font-normal opacity-70">{s.hook}</span>
            <span className="block text-xs font-normal opacity-50">
              {Object.keys(s.scenes).length} scenes
              {s.clues ? ` · ${Object.keys(s.clues).length} clues` : ""} · {s.endings.length} endings
            </span>
          </button>
        ))}
      </fieldset>

      <p className="text-sm opacity-70">Everyone starts with {story.startingStars} ⭐.</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          Players ({story.players.min}–{story.players.max})
        </legend>
        {names.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <CharacterPortrait player={{ id: `p${i + 1}`, name }} size={32} />
            <input
              aria-label={`Player ${i + 1} name`}
              className="flex-1 border px-2 py-1"
              value={name}
              onChange={(e) => onNames(names.map((n, j) => (j === i ? e.target.value : n)))}
            />
            <button
              type="button"
              className="border px-3 py-1 disabled:opacity-40"
              disabled={names.length <= story.players.min}
              onClick={() => onNames(names.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          className="border px-3 py-1 disabled:opacity-40"
          disabled={names.length >= story.players.max}
          onClick={() => onNames([...names, `Player ${names.length + 1}`])}
        >
          Add player
        </button>
        <button
          type="button"
          className="border-2 px-4 py-1 font-semibold disabled:opacity-40"
          disabled={wrongCount || names.some((n) => !n.trim())}
          onClick={onStart}
        >
          Start
        </button>
      </div>

      <p className="text-sm opacity-70">
        Or play it with other devices:{" "}
        <Link href="/rooms/new" className="underline">
          create a room
        </Link>{" "}
        ·{" "}
        <Link href="/join" className="underline">
          join one
        </Link>
      </p>
    </main>
  );
}

function TopBar({
  story,
  state,
  onReset,
}: {
  story: Story;
  state: GameState;
  onReset: () => void;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <div className="flex items-baseline gap-2">
        <h1 className="font-bold">{story.title}</h1>
        <p className="text-xs opacity-60">
          {state.phase === "ended"
            ? `${state.log.length} scenes played`
            : `scene ${state.sceneId} · ${state.log.length} resolved`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {state.mishaps.map((id) => (
          <span key={id} className="border border-amber-600 px-2 py-0.5 text-xs text-amber-700">
            {story.mishaps?.[id]?.title ?? id}
          </span>
        ))}
        <button type="button" className="border px-2 py-1 text-xs" onClick={onReset}>
          Restart
        </button>
      </div>
    </header>
  );
}

/**
 * The cast, standing in a row above the dialog — the arrangement the design doc
 * describes for the lobby and the ending screen, reused here so the same shape
 * carries through the whole game.
 *
 * Each other player gets a one-click "give 1 ⭐" to the spotlight, because the
 * gate moment only works if helping is easier than thinking about helping.
 */
function Stage({
  story,
  state,
  background,
  canGive,
  dispatch,
}: {
  story: Story;
  state: GameState;
  background?: string;
  canGive: boolean;
  dispatch: (a: Action) => void;
}) {
  const spotlight = spotlightPlayer(state);
  const ended = state.phase === "ended";

  return (
    <div className="relative flex min-h-0 flex-1 items-end justify-center overflow-hidden border-b bg-neutral-100 dark:bg-neutral-900">
      {/* Backgrounds are stage 5 art. Filling the stage with the placeholder
          keeps the empty space reading as "art goes here" rather than as a gap,
          and shows the framing the cast will stand in front of. */}
      <div className="absolute inset-2 flex items-start justify-center border border-dashed opacity-40">
        <span className="px-2 py-1 text-xs">background: {background ?? "none"}</span>
      </div>

      {/* The notebook. An investigation is only legible if the room can see
          what it already knows, so it sits on screen rather than behind a tab. */}
      {story.clues && (
        <div className="absolute left-3 top-10 max-h-[70%] w-56 overflow-y-auto text-xs">
          <p className="mb-1 font-semibold uppercase tracking-wide opacity-60">
            Notebook {state.clues.length}/{Object.keys(story.clues).length}
          </p>
          {state.clues.length === 0 ? (
            <p className="opacity-40">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {state.clues.map((id) => (
                <li key={id} className="border-l-2 pl-2">
                  <span className="block">{story.clues![id]?.title ?? id}</span>
                  {story.clues![id]?.description && (
                    <span className="block opacity-50">{story.clues![id].description}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="relative flex flex-wrap items-end justify-center gap-4 p-6">
        {state.players.map((p) => {
          const isSpotlight = !ended && p.id === spotlight.id;
          return (
            <li key={p.id} className="flex flex-col items-center gap-1">
              <CharacterPortrait
                player={p}
                size={isSpotlight ? 88 : 64}
                dimmed={!ended && !isSpotlight}
              />
              <span className={`text-sm ${isSpotlight ? "font-bold" : ""}`}>
                {p.name} <span className="tabular-nums opacity-70">{p.stars} ⭐</span>
              </span>
              {!ended && !isSpotlight && (
                <button
                  type="button"
                  className="border px-1 py-0.5 text-xs disabled:opacity-30"
                  disabled={!canGive || p.stars < 1}
                  onClick={() =>
                    dispatch({ type: "give", fromId: p.id, toId: spotlight.id, amount: 1 })
                  }
                >
                  Give 1 ⭐
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Portrait plus name for whoever the dialog is speaking as. */
function Speaker({ players, label }: { players: PlayerState[]; label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="flex -space-x-4">
        {players.map((p) => (
          <CharacterPortrait key={p.id} player={p} size={players.length > 1 ? 44 : 72} />
        ))}
      </div>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

function DialogBox({
  story,
  state,
  mode,
  isCrisis,
  dispatch,
}: {
  story: Story;
  state: GameState;
  mode: SceneMode;
  isCrisis: boolean;
  dispatch: (a: Action) => void;
}) {
  const spotlight = spotlightPlayer(state);
  const isGroup = mode === "group";

  // The whole cast speaks for group scenes and for the ending; otherwise the
  // spotlight player does.
  // During a skill test the attempting player speaks, whatever the scene mode.
  const attempting = state.minigame
    ? (state.players.find((p) => p.id === state.minigame!.playerId) ?? spotlight)
    : null;
  const speakers = attempting
    ? [attempting]
    : isGroup || state.phase === "ended"
      ? state.players
      : [spotlight];
  const label = attempting
    ? attempting.name
    : state.phase === "ended"
      ? "The room"
      : isGroup
        ? "Everyone"
        : spotlight.name;

  return (
    <section
      className={`shrink-0 border-t-4 p-4 ${isCrisis && state.phase !== "ended" ? "border-red-600" : ""}`}
    >
      <div className="mx-auto flex w-full max-w-4xl gap-4">
        <Speaker players={speakers} label={label} />
        <div className="min-w-0 flex-1">
          {state.phase === "scene" && (
            <SceneBody story={story} state={state} dispatch={dispatch} />
          )}
          {state.phase === "minigame" && <MinigameBody state={state} dispatch={dispatch} />}
          {state.phase === "result" && <ResultBody state={state} dispatch={dispatch} />}
          {state.phase === "ended" && <EndingBody story={story} state={state} />}
        </div>
      </div>
    </section>
  );
}

function SceneBody({
  story,
  state,
  dispatch,
}: {
  story: Story;
  state: GameState;
  dispatch: (a: Action) => void;
}) {
  const view = sceneView(story, state);
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-3">
      {view.isCrisis && (
        <p className="text-xs font-bold uppercase tracking-widest text-red-600">Crisis</p>
      )}
      <p className="leading-relaxed">{view.text}</p>

      {view.mode === "spotlight" ? (
        <ul className="flex flex-col gap-1">
          {/* Hidden choices are not rendered at all. A Star gate is shown locked
              with its price, but a clue gate must not admit it exists. */}
          {view.choices
            .filter((c) => !c.hidden)
            .map((c) => (
              <li key={c.index}>
                <button
                  type="button"
                  className="w-full border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={c.locked}
                  onClick={() =>
                    dispatch({ type: "choose", playerId: view.spotlight.id, choiceIndex: c.index })
                  }
                >
                  {c.label}
                  {c.cost > 0 && <strong className="ml-2">{c.cost} ⭐</strong>}
                  {c.lockedReason && (
                    <em className="ml-2 text-sm not-italic opacity-70">{c.lockedReason}</em>
                  )}
                </button>
              </li>
            ))}
        </ul>
      ) : (
        <>
          <p className="text-sm opacity-70">
            {view.awaitingVotes.length > 0
              ? `Waiting on ${view.awaitingVotes.map((p) => p.name).join(", ")}.`
              : "Counting…"}
          </p>
          <ul className="flex flex-col gap-2">
            {view.choices
              .filter((c) => !c.hidden)
              .map((c) => (
              <li key={c.index} className="border p-2">
                <p className="text-sm">
                  {c.label}
                  {c.votes.length > 0 && (
                    <span className="ml-2 opacity-70">
                      — {c.votes.map((id) => byId[id]).join(", ")}
                    </span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {state.players.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`border px-2 py-0.5 text-xs ${
                        state.votes[p.id] === c.index ? "border-2 font-semibold" : ""
                      }`}
                      onClick={() => dispatch({ type: "vote", playerId: p.id, choiceIndex: c.index })}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function MinigameBody({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const attempt = state.minigame!;
  const who = state.players.find((p) => p.id === attempt.playerId)!;
  // Seeded from the run, the scene and the choice, so the same attempt always
  // generates the same puzzle and spectators can follow along once rooms exist.
  const seed = hashString(`${state.seed}:${state.sceneId}:${attempt.choiceIndex}`);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <strong>{who.name}</strong> only gets one go at this.
        <span className="ml-2 opacity-60">difficulty {attempt.spec.difficulty}/5</span>
      </p>
      <Minigame
        // Remounts per attempt, so a puzzle never inherits the previous one's state.
        key={`${state.sceneId}:${attempt.choiceIndex}`}
        spec={attempt.spec}
        seed={seed}
        onDone={(passed) =>
          dispatch({ type: "minigameResult", playerId: attempt.playerId, passed })
        }
      />
    </div>
  );
}

function ResultBody({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const pending = state.pending!;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const deltas = Object.entries(pending.deltas).filter(([, n]) => n !== 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm opacity-60">{pending.label}</p>
      {pending.text && <p className="leading-relaxed">{pending.text}</p>}

      {pending.gifts.length > 0 && (
        <ul className="text-sm opacity-70">
          {pending.gifts.map((g, i) => (
            <li key={i}>
              {byId[g.fromId]} gave {g.amount} ⭐ to {byId[g.toId]}
            </li>
          ))}
        </ul>
      )}

      {deltas.length > 0 && (
        <ul className="flex flex-wrap gap-3 text-sm">
          {deltas.map(([id, n]) => (
            <li key={id} className="tabular-nums">
              {byId[id]} {n > 0 ? `+${n}` : n} ⭐
            </li>
          ))}
        </ul>
      )}

      {pending.minigame && (
        <p
          className={`border px-3 py-1 text-sm ${
            pending.minigame.passed
              ? "border-emerald-600 text-emerald-700"
              : "border-red-600 text-red-600"
          }`}
        >
          {pending.minigame.passed ? "Passed." : "Failed."}
        </p>
      )}

      {pending.cluesFound.length > 0 && (
        <p className="border border-sky-600 px-3 py-1 text-sm text-sky-700">
          {pending.cluesFound.length === 1 ? "Clue found" : `${pending.cluesFound.length} clues found`}
          {" — added to the notebook."}
        </p>
      )}

      {pending.mishapAdded && (
        <p className="border border-amber-600 px-3 py-1 text-sm text-amber-700">
          Mishap collected.
        </p>
      )}

      <button
        type="button"
        className="self-start border-2 px-4 py-1 font-semibold"
        onClick={() => dispatch({ type: "continue", playerId: state.players[0].id })}
      >
        {pending.next ? "Next scene" : "See how it went"}
      </button>
    </div>
  );
}

function EndingBody({ story, state }: { story: Story; state: GameState }) {
  const ending = story.endings.find((e) => e.id === state.endingId) ?? resolveEnding(story, state);
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p.name]));

  return (
    <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto">
      <div>
        <p className="text-xs uppercase tracking-widest opacity-60">Ending</p>
        <h2 className="text-xl font-bold">{ending.title}</h2>
      </div>
      {ending.text && <p className="text-sm leading-relaxed">{ending.text}</p>}

      {state.mishaps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Mishaps collected</h3>
          <ul className="list-inside list-disc text-sm opacity-80">
            {state.mishaps.map((id) => (
              <li key={id}>{story.mishaps?.[id]?.title ?? id}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold">Recap</h3>
        <ol className="list-inside list-decimal text-sm opacity-80">
          {state.log.map((entry, i) => (
            <li key={i}>
              {entry.label}
              <span className="opacity-60">
                {" "}
                — {entry.deciderIds.map((id) => byId[id]).join(", ")}
                {entry.starsSpent > 0 && `, spent ${entry.starsSpent} ⭐`}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
