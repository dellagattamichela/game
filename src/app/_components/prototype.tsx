"use client";

/**
 * Stage 1 prototype: the whole room on one screen, hot-seat.
 *
 * There are no rooms or networking yet, so this stands in for four people on
 * four devices. Everything on screen is driven by the engine's `sceneView`, and
 * every button dispatches an engine action — the same actions a client will send
 * to the server once rooms exist. Nothing here computes game rules locally.
 *
 * Deliberately unstyled beyond layout: the mechanic is what is being tested.
 */
import { useMemo, useState } from "react";
import {
  applyAction,
  createGame,
  resolveEnding,
  sceneView,
  spotlightPlayer,
} from "@/engine/engine";
import { newSeed } from "@/engine/rng";
import { requireStory } from "@/stories";
import type { Action, GameState, Story } from "@/engine/types";

const STORY_ID = "the-pilot";
const DEFAULT_NAMES = ["Ada", "Bo", "Cy", "Di"];

export function Prototype() {
  const story = useMemo(() => requireStory(STORY_ID), []);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!state) {
    return (
      <Setup
        story={story}
        names={names}
        onNames={setNames}
        onStart={() =>
          setState(
            createGame(
              story,
              names.map((name, i) => ({ id: `p${i + 1}`, name })),
              newSeed(),
            ),
          )
        }
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Header story={story} state={state} onReset={() => setState(null)} />
      {error && (
        <p role="alert" className="border border-red-500 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {state.phase !== "ended" && <Roster state={state} dispatch={dispatch} />}
      {state.phase === "scene" && <SceneCard story={story} state={state} dispatch={dispatch} />}
      {state.phase === "result" && <ResultCard state={state} dispatch={dispatch} />}
      {state.phase === "ended" && <EndingCard story={story} state={state} />}
    </main>
  );
}

// ---------------------------------------------------------------------------

function Setup({
  story,
  names,
  onNames,
  onStart,
}: {
  story: Story;
  names: string[];
  onNames: (names: string[]) => void;
  onStart: () => void;
}) {
  const tooFew = names.length < story.players.min;
  const tooMany = names.length > story.players.max;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Pilot Season</h1>
      <p className="text-sm opacity-70">
        {story.title}: {story.hook} Everyone starts with {story.startingStars} ⭐.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          Players ({story.players.min}–{story.players.max})
        </legend>
        {names.map((name, i) => (
          <div key={i} className="flex gap-2">
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
          disabled={tooFew || tooMany || names.some((n) => !n.trim())}
          onClick={onStart}
        >
          Start
        </button>
      </div>
    </main>
  );
}

function Header({
  story,
  state,
  onReset,
}: {
  story: Story;
  state: GameState;
  onReset: () => void;
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
      <div>
        <h1 className="text-xl font-bold">{story.title}</h1>
        <p className="text-xs opacity-60">
          {state.phase === "ended"
            ? `${state.log.length} scenes played`
            : `scene ${state.sceneId} · ${state.log.length} resolved`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {state.mishaps.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {state.mishaps.map((id) => (
              <li key={id} className="border border-amber-600 px-2 py-0.5 text-xs text-amber-700">
                {story.mishaps?.[id]?.title ?? id}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="border px-2 py-1 text-xs" onClick={onReset}>
          Restart
        </button>
      </div>
    </header>
  );
}

/**
 * The room. During a scene each other player gets a one-click "give 1 ⭐" to the
 * spotlight, because the gate moment only works if helping is easier than
 * thinking about helping.
 */
function Roster({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const spotlight = spotlightPlayer(state);
  const canGive = state.phase === "scene";

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {state.players.map((p) => {
        const isSpotlight = p.id === spotlight.id;
        return (
          <li
            key={p.id}
            className={`flex flex-col gap-1 border p-2 ${isSpotlight ? "border-2 font-semibold" : ""}`}
          >
            <span className="flex items-baseline justify-between">
              <span>{p.name}</span>
              <span className="tabular-nums">{p.stars} ⭐</span>
            </span>
            {isSpotlight ? (
              <span className="text-xs uppercase tracking-wide opacity-60">spotlight</span>
            ) : (
              <button
                type="button"
                className="border px-1 py-0.5 text-xs disabled:opacity-30"
                disabled={!canGive || p.stars < 1}
                onClick={() =>
                  dispatch({ type: "give", fromId: p.id, toId: spotlight.id, amount: 1 })
                }
              >
                Give 1 ⭐ to {spotlight.name}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SceneCard({
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
    <section className={`flex flex-col gap-4 border p-4 ${view.isCrisis ? "border-4 border-red-600" : ""}`}>
      {view.isCrisis && (
        <p className="text-xs font-bold uppercase tracking-widest text-red-600">Crisis</p>
      )}
      <p className="text-lg leading-relaxed">{view.text}</p>

      {view.mode === "spotlight" ? (
        <>
          <p className="text-sm opacity-70">{view.spotlight.name} decides.</p>
          <ul className="flex flex-col gap-2">
            {view.choices.map((c) => (
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
                  {/* Locked options stay visible so the room can see what it is
                      missing, and by exactly how much. */}
                  {c.locked && (
                    <em className="ml-2 text-sm not-italic opacity-70">
                      needs {c.shortfall} more ⭐
                    </em>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="text-sm opacity-70">
            Everyone votes.{" "}
            {view.awaitingVotes.length > 0
              ? `Waiting on ${view.awaitingVotes.map((p) => p.name).join(", ")}.`
              : "Counting…"}
          </p>
          <ul className="flex flex-col gap-3">
            {view.choices.map((c) => (
              <li key={c.index} className="border p-2">
                <p>
                  {c.label}
                  {c.votes.length > 0 && (
                    <span className="ml-2 text-sm opacity-70">
                      — {c.votes.map((id) => byId[id]).join(", ")}
                    </span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {state.players.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`border px-2 py-0.5 text-xs ${
                        state.votes[p.id] === c.index ? "border-2 font-semibold" : ""
                      }`}
                      onClick={() =>
                        dispatch({ type: "vote", playerId: p.id, choiceIndex: c.index })
                      }
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
    </section>
  );
}

function ResultCard({ state, dispatch }: { state: GameState; dispatch: (a: Action) => void }) {
  const pending = state.pending!;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const deltas = Object.entries(pending.deltas).filter(([, n]) => n !== 0);

  return (
    <section className="flex flex-col gap-3 border p-4">
      <p className="text-sm opacity-60">{pending.label}</p>
      {pending.text && <p className="text-lg leading-relaxed">{pending.text}</p>}

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

      {pending.mishapAdded && (
        <p className="border border-amber-600 px-3 py-2 text-sm text-amber-700">
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
    </section>
  );
}

function EndingCard({ story, state }: { story: Story; state: GameState }) {
  const ending = story.endings.find((e) => e.id === state.endingId) ?? resolveEnding(story, state);
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p.name]));

  return (
    <section className="flex flex-col gap-4 border-4 p-4">
      <div>
        <p className="text-xs uppercase tracking-widest opacity-60">Ending</p>
        <h2 className="text-2xl font-bold">{ending.title}</h2>
      </div>
      {ending.text && <p className="leading-relaxed">{ending.text}</p>}

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

      <div>
        <h3 className="text-sm font-semibold">Stars left</h3>
        <ul className="flex flex-wrap gap-3 text-sm">
          {state.players.map((p) => (
            <li key={p.id} className="tabular-nums">
              {p.name} {p.stars} ⭐
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
