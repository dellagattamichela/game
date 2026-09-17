# Pilot Season

A turn-based story game you play in the browser with friends. A group joins a
room, each person builds a pixel-art character, and the host picks a story. The
story plays out in scenes: one player is in the spotlight and makes a choice, and
at a few crisis moments the best option costs Stars — so the room has to decide
who spends, and who helps.

Design doc: [`docs/pilot-season-design-doc.md`](docs/pilot-season-design-doc.md).

## Where this is

Stage 1 of the build plan is done: **the mechanic, playable in one browser**.
The prototype at `/` puts the whole room on one screen and you act as whoever
the turn belongs to. It is still the quickest way to read a story end to end,
and it stays as the place to test a story without gathering four people.

Stages 2 to 4 work end to end: a creator makes a room and gets an invite code,
other people walk in through it, everyone builds a character and readies up,
the host picks a story, and the room plays it — one seat per browser, spotlight
turns, group votes, Star-giving and skill tests, through to an ending.

What is missing is the drawings and the polish. Every character part is a
placeholder made of rectangles, there are no backgrounds, no turn timer, and
rooms talk over polling rather than a real-time channel.

| Stage | Status |
|---|---|
| 1. Single-browser prototype | done |
| 2. Character creator | done, on placeholder art |
| 3. Rooms | done: create, invite, join, rejoin, ready, pick, start |
| 4. Multiplayer turns | done: one seat per browser, played over polling |
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
src/engine/      the game rules, as a pure reducer
src/stories/     stories as JSON data
src/rooms/       rooms and invite codes
src/characters/  the character model and the parts catalog
src/app/         the UI: the prototype, the lobby, the table
scripts/         the scenario coverage tool
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

The lobby polls itself so a host can watch people arrive — see *Playing across
devices* below for how that works and when it stops. It is a placeholder with a
known replacement: a real-time channel retires `lobby-refresh.tsx` entirely.

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
create ─┤              ├─ ready ─→ pick ─→ start ─→ room.game ─→ act ─→ ending
        └── rejoin ────┘                            (the engine takes over)
```

## Playing across devices

`store.act(code, action)` is the referee. It loads the room, calls the same
`applyAction` the prototype calls, writes the new state back, and closes the
room when the engine says the story is over. The engine's refusals pass through
with their own codes, so `cannot_afford` stays distinguishable from
`not_spotlight` instead of collapsing into one "no".

**A client cannot act as another player.** `playAction` does not accept an
engine `Action` — every one of those carries the id of the player it is for, and
a Server Action is reachable by direct POST, so accepting one whole would let
anyone vote as anyone. It accepts a shape with no id in it at all, and adds the
id from the cookie. Impersonation is not checked for; it is unrepresentable.

**The table shows one seat.** The prototype's screen is a hot seat where you act
as whoever the turn belongs to. `room-table.tsx` is the opposite: it knows which
player it belongs to and enables only what that person may do. Everyone else
watches the same scene with the same options greyed out, which is what keeps
four people looking at one story rather than at a waiting screen. It computes no
rules — `sceneView` runs on the server and the client renders what it says.

**Polling is the transport, and it knows when to stop.** Two seconds during a
scene, three in the lobby, paused while you are mid-puzzle (a refresh would
redraw the puzzle under you, and only you can end that phase anyway) and paused
once the run is over. Your own moves do not wait for the next tick: the actions
call `refresh()` themselves.

Two consequences worth knowing. Anyone may press **Next scene**, so whoever
reads fastest ends up driving the room — which is also how it works around a
table, but it means a quick clicker can move past a result beat before everyone
has read it. And a client reports its own skill-test outcome, so it could lie
about passing; that is the trade the design doc already makes for turn timers,
and it is the same trade for a game among friends.

## Characters

Stage 2, built as the design doc §4 describes it and running on placeholder art:
every part is a handful of rectangles rather than a drawing. The *structure* is
the real one, so the art arriving is a change to one file.

A character is a list of choices, never an image:

```json
{ "body": "soft", "skin": "olive", "hair": "long", "hairColor": "chestnut",
  "eyes": "round", "eyeColor": "green", "brows": "fine", "mouth": "smile",
  "top": "hoodie", "topColor": "teal", "accessory": "glasses" }
```

| | |
|---|---|
| `types.ts` | The layer stack, the sprite grid, and what a character is. |
| `catalog.ts` | The parts and palettes. **This is the placeholder art**, and the only file real drawings touch. |
| `character.ts` | Defaults, normalising, seeded randomising, cycling a layer. Pure. |

**The sprite grid is 64, not the doc's 32.** The doc says to follow the
reference art where it differs, and `docs/reference/admin.png` is a portrait
bust at roughly 64 logical pixels. Placeholder shapes use those coordinates, so
real 64×64 art lines up without moving anything.

**Colour is a palette swap, not another drawing.** Each part is drawn in four
key shades — base, shadow, light, line — and the colour arrives at render time
from whichever palette the player picked. One hair drawing covers eight hair
colours, and the eyebrows take the hair palette too, so the face follows for
free. Garment colours are generated from a hue list, because flat-dyed cloth
really is one hue at three lightnesses; skin and hair shades are written out,
because there they are a drawing decision.

**Parts are saved by id, not by index.** The doc's example saves `"hair": 7`,
but an index is a promise never to reorder or insert a part, and every saved
character breaks the first time someone does.

**A saved character outlives the catalog that made it.** `normalizeCharacter`
coerces anything into something drawable: an unknown part falls back to that
layer's default, junk becomes the default character, and an unknown accessory
becomes none. A player's hair reverting is a small disappointment; a lobby that
cannot draw one of its players is a broken room. `setCharacter` therefore
normalises rather than rejecting — a shirt is not a rule.

**Nobody starts faceless.** A player gets a character the moment they sit down,
derived from their player id, and the creator personalises it. That is also
what gives the hot-seat prototype a cast of distinct faces without a creator,
and what makes `randomCharacter` worth keeping pure: the same seed draws the
same person on every machine.

The creator lives at `/rooms/CODE/character` — a route, not a panel, so there
is no lobby polling underneath redrawing the page while someone picks a
hairstyle. It saves on a button rather than on every click, because forty saves
on the way to one face is forty redraws in everyone else's lobby. What you
build is also kept in this browser, and **My last character** brings it back in
the next room — a button rather than an automatic load, so it never overwrites
what you already look like here without being asked.

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
