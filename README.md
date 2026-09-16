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
npm run balance    # star economy report for a story
```

## How it fits together

```
src/engine/    the game rules, as a pure reducer
src/stories/   stories as JSON data
src/app/       the prototype UI
scripts/       the balance tool
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

### Balancing a story

`npm run balance` walks every combination of choices — 78,732 of them for The
Pilot — and reports how often the priciest crisis option is within reach:

```
  s6  (best option costs min 5, avg 5.0, max 5)
    affordable solo     33%
    affordable pooled   100%
    needs the table     67%
```

Near 100% solo means the gate is decoration. Near 0% means it is a wall. The gap
between the two is how often the room has to chip in, which is the moment the
whole mechanic exists to create.

```bash
npm run balance -- the-pilot 6     # story id, player count
```

## Decisions already made

Taken from the design doc's own recommendations, so section 12's open questions
are partly settled:

- **Stars**, a single currency, rather than three stats.
- **Spent** at a gate, not checked against a threshold.
- **Teammates can give** Stars mid-scene. This is the good part.
- **No losing.** A failed crisis is a mishap, which surcharges later gates and
  steers the ending. Every run reaches an ending.
- **Group votes are visible**, majority wins, the spotlight breaks ties.
- Endings key on **mishaps collected**, so the ending you get is legible from
  what actually happened.

Still open: the art pipeline (see the note on `docs/reference/admin.png` — it is a
portrait bust at roughly 64px, not a 32px full body), and which story comes next.
