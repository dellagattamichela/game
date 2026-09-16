# Pilot Season

A turn-based story game you play in the browser with friends. A group joins a
room, each person builds a pixel-art character, and the host picks a story. The
story plays out in scenes: one player is in the spotlight and makes a choice, and
at a few crisis moments the best option costs Stars — so the room has to decide
who spends, and who helps.

Design doc: [`docs/pilot-season-design-doc.md`](docs/pilot-season-design-doc.md).

## Where this is

Stage 1 of the build plan: **the mechanic, playable in one browser**. No rooms,
no networking, no art yet. The prototype puts the whole room on one screen and
you act as whoever the turn belongs to, which is enough to exercise spotlight
rotation, group votes, gated choices and Star-giving.

| Stage | Status |
|---|---|
| 1. Single-browser prototype | done |
| 2. Character creator | not started |
| 3. Rooms | not started |
| 4. Multiplayer turns | not started |
| 5. Polish | not started |
| 6. More stories | not started |

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine + story tests
npm run scenarios  # coverage report: endings, clues, gates
```

## How it fits together

```
src/engine/    the game rules, as a pure reducer
src/stories/   stories as JSON data
src/app/       the prototype UI
scripts/       the scenario coverage tool
```

**The engine is a pure function** — `applyAction(story, state, action)` returns a
new state or a typed rejection. It does no I/O, never calls `Date.now()` or
`Math.random()`, and never mutates its input. `{randomPlayer}` resolves from a
run seed, so every client renders the same sentence.

That is not fussiness: it is what lets stage 4 put the referee on the server. A
route handler will read the room's state, call the same `applyAction`, and write
the result back, while clients call it too to predict the outcome. The design doc
suggests making the host's browser the referee; a pure reducer means we can skip
that and its host-handoff problem entirely.

The UI computes no rules of its own. `sceneView()` returns the resolved text and
the choices with costs and lock states already worked out, so what a player sees
locked is exactly what the reducer will refuse.

## Writing a story

A story is one JSON file in `src/stories/`, registered in `src/stories/index.ts`.
Stories are validated at import, so a mistake fails the test run with a field
name rather than three scenes into a playthrough.

```jsonc
{
  "id": "the-pilot",
  "startingStars": 2,
  "start": "s1",
  "scenes": {
    "s6": {
      "type": "crisis",           // only crisis scenes may gate choices
      "mode": "spotlight",        // or "group" for a vote
      "text": "The boss walks in early. {spotlight} has one move left.",
      "choices": [
        { "label": "Bluff", "effects": { "addMishap": "boss_suspicious" }, "next": "s7b" },
        { "label": "Charm him", "cost": 2, "next": "s7" }
      ]
    }
  },
  "endings": [ /* matched in order; the last one must be unconditional */ ]
}
```

Placeholders: `{spotlight}`, `{randomPlayer}` (never the spotlight), `{everyone}`.

Rules the validator enforces: `next` must point at a real scene, only crisis
scenes carry costs, group scenes carry none, every scene must be reachable, and
the last ending must have no `requires` so every run lands somewhere.

### Checking a story

`npm run scenarios` reports what you cannot see by reading a story file: whether
every ending is reachable, whether every clue is findable, and whether each
crisis gate is a real decision.

```bash
npm run scenarios -- stranded 4     # story id, player count
```

```
  s9  best option costs min 5, avg 5.0, max 5
        affordable alone 59% · pooled 100% · needs the table 41%

  ████████████████████████████████████████ 100.0%  captain_notebook
  ███████·································  18.4%  torn_page

  ██······································   4.8%  rescued_and_named
  ████····································  10.8%  adrift
```

Near 100% affordable alone means the gate is decoration; near 0% means it is a
wall. The gap is how often the room has to chip in, which is the moment the
mechanic exists to create. An ending marked `← UNREACHABLE` exits non-zero.

Small stories are walked exhaustively (78,732 paths for The Pilot). Stranded has
tens of millions, so it samples from a fixed seed instead. Sampling picks
uniformly among takeable options, which is not how a group plays — read the
percentages as the shape of the space, not as predicted outcomes.

## The two stories

**The Pilot** — 12 scenes, comedy, one branch, endings keyed on mishaps. Short,
and the one to teach the game with.

**Stranded** — 20 scenes, a closed-circle mystery, 12 clues and 10 endings.
Endings depend on *who* the room accuses, *what* it can prove, and whether anyone
thought to open the one door nobody opened. See
[`docs/stranded-scenario-map.md`](docs/stranded-scenario-map.md) for the full
scenario map: the truth, the suspects, every clue and where it is found, and the
complete ending table.

Stranded adds two things The Pilot does not use:

- **Clues.** A notebook the group accumulates. Choices can require them.
- **Run variables.** Single-valued state such as `accused`, read by endings.

The important rule: **clue gates hide, Star gates lock.** A Star gate is shown
with its price, because money you can see you lack. A clue gate is not shown at
all, because rendering it greyed out would tell players that evidence they have
not found exists.

## Decisions already made

Taken from the design doc's own recommendations, so section 12's open questions
are partly settled:

- **Stars**, a single currency, rather than three stats.
- **Spent** at a gate, not checked against a threshold.
- **Teammates can give** Stars mid-scene. This is the good part.
- **No losing in The Pilot.** A failed crisis is a mishap, which surcharges later
  gates and steers the ending. Every run reaches an ending.
- **Losing is possible in Stranded.** Accusing an innocent person is a real, bad
  ending. An investigation you cannot get wrong is not an investigation.
- **Group votes are visible**, majority wins, the spotlight breaks ties.
- Endings key on **mishaps collected**, so the ending you get is legible from
  what actually happened.

Still open: the art pipeline (see the note on `docs/reference/admin.png` — it is a
portrait bust at roughly 64px, not a 32px full body), and the questions at the end
of the Stranded scenario map.
