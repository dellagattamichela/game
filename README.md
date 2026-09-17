# Pilot Season

A turn-based story game you play in the browser with friends. A group joins a
room, each person builds a pixel-art character, and the host picks a story. The
story plays out in scenes: one player is in the spotlight and makes a choice, and
at a few crisis moments the best option costs Stars — so the room has to decide
who spends, and who helps.

Design doc: [`docs/pilot-season-design-doc.md`](docs/pilot-season-design-doc.md).

## Where this is

Stage 1 of the build plan is done: **the mechanic, playable in one browser**.
The prototype puts the whole room on one screen and you act as whoever the turn
belongs to, which is enough to exercise spotlight rotation, group votes, gated
choices and Star-giving. No networking and no art yet.

Stage 3 works end to end: a creator makes a room and gets an invite code, other
people walk in through it, everyone readies up, the host picks a story and
starts — and the room hands itself to the engine. What is not built is playing
that story across devices, which is stage 4.

| Stage | Status |
|---|---|
| 1. Single-browser prototype | done |
| 2. Character creator | not started |
| 3. Rooms | done: create, invite, join, rejoin, ready, pick, start |
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
src/rooms/     rooms and invite codes
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

## Rooms and invite codes

`/rooms/new` takes a name and a table size, mints an invite code, and drops you
into `/rooms/CODE` as the host. Everyone else arrives either by typing the code
at `/join` or by following the link, which is the same `/rooms/CODE` URL: what
you get there depends on whether your cookie already holds a seat in that room.
A member sees the lobby, anyone else sees the door with a name field. So the
link a host pastes into a chat does the whole job on its own.

`src/rooms` keeps the engine's split between a pure core and a thin impure edge:

| | |
|---|---|
| `code.ts` | Minting, normalising and validating a code. Pure, with the byte source as an argument. |
| `room.ts` | Building a room around its creator, seating the people who join, and the rules for both. Pure. |
| `store.ts` | Where rooms live. Owns the clock, the randomness, and code *uniqueness*. |
| `player.ts` | The cookie that makes a player the same player after a reload. |

**The code alphabet has no vowels and no lookalikes** — 22 symbols, `CDFGHJKMNPQRTVWXY34679`.
Dropping the vowels means a code almost never spells a word, which matters for
something a group screenshots; dropping `B`/`8`, `S`/`5`, `L`/`1`, `Z`/`2` means
it survives being read aloud across a room. A short blocklist catches the
consonant skeletons that still read as something. Codes come from
`crypto.getRandomValues`, not `Math.random()`, so watching a few go by tells you
nothing about the next one.

**Four symbols is 234,256 codes.** With a hundred rooms live, a blind guess lands
in one about every 2,300 tries: fine among friends, where the worst case is a
stranger watching a story, and not fine for anything public. `CODE_LENGTH` is the
knob — 6 multiplies the space by 484 — and joining wants rate limiting once there
is a server to rate limit on.

**Uniqueness belongs to the store, not the generator.** `open()` draws up to
eight candidates, then widens the code by a character rather than drawing forever
or failing, and it sweeps expired rooms first so their codes come back. A room
nobody touches for six hours is gone. A rejected room never consumes a code.

**Codes are matched forgivingly and canonicalised.** `kblt`, `KB LT`, `kb-lt` and
a pasted `KBLT.` are the same room, and `/rooms/kb-lt` redirects to `/rooms/KBLT`
so the link that gets passed on is the one the room is stored under. Characters
*outside* the alphabet are not guessed at: every confusable pair had one member
removed precisely so there is no sensible guess, and guessing wrong would walk
someone into another group's game.

**Joining and reconnecting are the same call.** From a player's side, "let me
in" and "my wifi dropped" are one action, and the client cannot tell them apart
— it sends the id its browser has been carrying since the first time it saw the
game. `joinRoom` decides which it was by whether that id is already at the
table, which is why the membership check runs *before* the checks for space and
for whether the story has started: a full game must still let its own players
back in, and checking capacity first would lock them out of their own session.

**A name the room already uses is refused, not silently suffixed.** Scene text
resolves `{spotlight}` to a name, so two Sams make the story itself ambiguous;
better to say so than to rename someone behind their back.

The store is a `Map` in the server process, hung off `globalThis` so `next dev`
does not bin everyone's room on each save. That works for one long-lived server
and not for serverless; section 10 of the design doc picks the real backend, and
`RoomStore` is an interface with one implementation so swapping it costs one file.

The lobby polls itself every three seconds so a host can watch people arrive.
That is a placeholder with a known replacement: stage 4 gives rooms a real-time
channel, and `lobby-refresh.tsx` goes away with it. Actions call `refresh()`
themselves, so your own clicks land immediately rather than on the next tick.

### Where the room meets the engine

`startGame` is the seam the whole build has been pointing at. Everything before
it is people arriving; everything after it is `applyAction`. The room keeps the
seats and the identities, and `room.game` holds the story state, built by the
engine's own `createGame` — so a run started from a room is indistinguishable
from one the single-browser prototype would have produced.

The run seed comes from the store, not from the engine. `createGame` may not
roll its own, which is the same rule that makes `{randomPlayer}` resolve to the
same name on every client.

**One function decides whether Start is allowed.** `startBlocker(room, story)`
returns either null or the reason, and the lobby renders that reason under the
greyed-out button while `startGame` enforces it. This is `sceneView`'s rule
applied to the lobby: one place computes the rule, and the UI never gets to hold
a second opinion about it.

```
        ┌──── join ────┐
create ─┤              ├─ ready ─→ pick ─→ start ─→ room.game
        └── rejoin ────┘                            (the engine takes over)
```

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

Rules the validator enforces: `next` and `failNext` must point at real scenes,
only crisis scenes carry costs, group scenes carry neither costs nor skill tests,
no choice carries both a cost and a skill test, every scene must be reachable,
every declared clue must be findable somewhere and every declared variable value
must be set somewhere, and the last ending must have no `requires` so every run
lands somewhere.

### Checking a story

`npm run scenarios` reports what you cannot see by reading a story file: whether
every ending is reachable, whether every clue is findable, and whether each
crisis gate is a real decision.

```bash
npm run scenarios -- stranded 4 0.7   # story id, player count, skill-test pass rate
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
far more than that, so it samples from a fixed seed instead. The pass rate lets
you check a story both at the rate a confident group hits and at the rate a
struggling one does; Stranded keeps every ending reachable from 35% to 95%. Sampling picks
uniformly among takeable options, which is not how a group plays — read the
percentages as the shape of the space, not as predicted outcomes.

## The two stories

**The Pilot** — 12 scenes, comedy, one branch, endings keyed on mishaps. Short,
and the one to teach the game with.

**Stranded** — 36 scenes, a closed-circle mystery: 21 clues, 8 skill tests, 4
crisis gates and 12 endings, running roughly 50 to 70 minutes. Endings depend on
*who* the room accuses, *what* it can prove, whether anyone thought to open the
one door nobody opened, and whether the room had the exculpatory clue in its
notebook when it named someone. See
[`docs/stranded-scenario-map.md`](docs/stranded-scenario-map.md) for the full
scenario map: the truth, the suspects, every clue and where it is found, and the
complete ending table.

Stranded adds three things The Pilot does not use:

- **Clues.** A notebook the group accumulates. Choices can require them.
- **Run variables.** Single-valued state such as `accused`, read by endings.
- **Skill tests.** Eight moments where the spotlight player has to *do*
  something: hold a hand steady, remember a code, scan a page, put a night back
  in order.

The important rule: **clue gates hide, Star gates lock.** A Star gate is shown
with its price, because money you can see you lack. A clue gate is not shown at
all, because rendering it greyed out would tell players that evidence they have
not found exists.

Skill tests follow their own rules: a choice carries a cost *or* a test and never
both, tests are spotlight-only, and failing one costs you the prize rather than
the run — `failEffects` and `failNext` default to "nothing happened, carry on".
Mishaps raise test difficulty the same way they raise gate prices, clamped so a
pile of setbacks can never make a puzzle unwinnable.

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
