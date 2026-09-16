# Stranded — scenario map

*The story bible for the investigation story. This is the source of truth for
what is true, what can be found, and where every run can end up.*

**36 scenes · 21 clues · 8 skill tests · 4 crisis gates · 12 endings.**
A full run is roughly 50 to 70 minutes.

Companion: `npm run scenarios -- stranded` generates the coverage report that
checks this document against the actual story file — every clue findable, every
ending reachable, no orphan scenes, and it exits non-zero if anything is dead.
The ending table in §9 is also pinned by tests in `src/stories/stories.test.ts`,
so editing a condition without editing this document fails the suite.

---

## 1. Premise

> Your cruise ship's captain has vanished. So has the buffet.

The *Sea Marigold* is adrift somewhere off the coast. Captain Vasquez did not
appear for morning muster. Neither did breakfast. There are five people who could
have had a hand in it, one of whom actually did, and about twelve hours before
the ship's generators give out.

Tone: light, dry, closed-circle mystery. Nobody is evil; one person is in very
deep trouble and making it worse by the hour.

## 2. What actually happened

**The canonical truth, which players never see stated outright.**

Marisol Reyes, the head chef, has been running goods through the ship's food
shipments for two years. On the night of the Captain's Dinner, Captain Vasquez
opened a crate expecting langoustines and found something else. He confronted her
in the galley at around 02:00. It went badly — not murderously, but badly. He is
currently **alive and locked in the cold store**, which is why the cold store had
to be emptied, which is why there is no buffet.

This is the structural joke and the structural clue: **the missing buffet and the
missing captain have the same cause.** A group that works out why the food is gone
is most of the way to finding the man.

Two separate things can be got right, and they come apart:

| | |
|---|---|
| **Who** | Naming Marisol, and being able to prove it |
| **Where** | Working out that the cold store is the one room nobody has opened |

A group can name her without saving him, or save him without ever knowing why.
That split is where most of the endings come from.

## 3. Suspects

| Suspect | Role | Why they look guilty | Truth |
|---|---|---|---|
| **First Officer Brann** | Second in command | Takes command smoothly, and his promotion paperwork was filed the day *before* the captain vanished | Innocent. Cleared by `brann_alibi` |
| **Dr. Okonjo** | Ship's doctor | Was quietly treating the captain; the prescription suggests confusion and wandering | Innocent. Cleared by `okonjo_statement` |
| **Marisol Reyes** | Head chef | The buffet is gone and she was the last to leave the galley | **Guilty** |
| **Teddy Vance** | Passenger, cruise influencer | Filmed everything and will not hand over the footage | Innocent. The footage shows him stealing a lobster |
| **Hal** | Night engineer | The only person awake at 03:00 | Innocent. Genuinely just working |

Brann and Okonjo are the designed red herrings. Each has a clue pointing squarely
at them **and** an exculpatory clue that clears them, reachable only by asking a
second time. A group that accuses one of them while holding the exculpatory clue
gets a harsher ending than one that never found it — see endings 7 and 8.

## 4. Clues

Twenty-one clues. The measured ceiling in a single run is **18**, so every group
finishes with something they never found.

| Id | Found in | Gate | Missable |
|---|---|---|---|
| `captain_notebook` | s3, the empty bridge | — | no |
| `brann_promotion` | s4, searching his desk | — | yes |
| `radio_log` | s5, the radio room | **memory** | yes |
| `cold_store_empty` | Galley search | — | yes |
| `key_missing` | Galley search | — | yes |
| `hal_saw_light` | Engine room search | — | yes |
| `manifest_gap` | Engine room search | — | yes |
| `doctor_prescription` | Sick bay search | — | yes |
| `scuffed_deck` | Sick bay search | — | yes |
| `torn_page` | s13, the galley bin | **search** + needs `captain_notebook` | yes |
| `galley_boots` | s13, the galley locker | — | yes |
| `smuggling_crate` | s14, the crate | **timing** + needs `manifest_gap` | yes |
| `teddy_phone` | s15, crisis — costs Stars | — | yes |
| `teddy_footage` | s16, scrubbing the footage | **order** + needs `teddy_phone` | yes |
| `marisol_alibi_broken` | s18, the ovens | needs `hal_saw_light` or `cold_store_empty` | yes |
| `okonjo_statement` | s19, asking her privately | needs `doctor_prescription` | yes |
| `brann_alibi` | s20, the watch log | needs `radio_log` | yes |
| `captain_ledger` | s22, the bridge safe | **memory** + needs `captain_notebook` | yes |
| `cabin_note` | s24, the captain's cabin | **search** | yes |
| `timeline` | s25, laying it all out | **order** + needs 6 clues | yes |
| `marisol_admission` | s28, with the timeline | needs `timeline` | yes |

### The location choice

The three search rooms each give **two** clues and can each be visited once:

- **Galley** → `cold_store_empty`, `key_missing` *(the "where" pair)*
- **Engine room** → `hal_saw_light`, `manifest_gap` *(the "when" pair)*
- **Sick bay** → `doctor_prescription`, `scuffed_deck` *(the red herring pair)*

Two searches are free (s8, s10). The third (s12) is only reachable by paying at
the s11 crisis. A group that skips the galley will struggle to find the captain;
one that skips the engine room will struggle to prove the smuggling.

Repeats are prevented by the clue system itself: each room's option carries
`requires: { lacksClue: <that room's marker> }`, so a visited room simply stops
being offered.

## 5. Run variables

| Variable | Set at | Values |
|---|---|---|
| `accused` | s33, the accusation vote | `brann`, `okonjo`, `marisol`, `teddy`, `hal`, or unset |
| `found_captain` | s29, if the cold store is opened | `yes`, or unset |

## 6. Scene map

Five acts, 36 scenes. `spot` = spotlight player decides, `group` = everyone votes,
**CRISIS** = Star-gated, **[type]** = skill test.

```
ACT 1 — THE MORNING AFTER
  s1  spot   The ship is not moving
  s2  group  Who do we trust to run this?
  s3  spot   The bridge is empty              -> captain_notebook (free)
  s4  spot   Brann takes command              -> brann_promotion
  s5  spot   The radio room        [memory]   -> radio_log
  s6  group  Tell the passengers, or keep it quiet?
  s7  spot   The head count

ACT 2 — THE SEARCH
  s8  spot   Search #1: galley | engine room | sick bay
  s9  spot   The generators cough
  s10 spot   Search #2: the rooms you have not been in
  s11 CRISIS Brann confines everyone to cabins
               free -> mishap, skip the third search -> s13
               2 ⭐ -> talk him down                  -> s12
               6 ⭐ -> name his promotion date        -> s12  (needs brann_promotion)
  s12 spot   Search #3: the last room
  s13 spot   The galley bin        [search]   -> torn_page (needs captain_notebook)
                                              -> galley_boots (free option)
  s14 spot   The crate             [timing]   -> smuggling_crate (needs manifest_gap)
  s15 CRISIS Teddy wants something for the footage -> teddy_phone
  s16 spot   Nine days of footage  [order]    -> teddy_footage (needs teddy_phone)

ACT 3 — THE PASSENGERS
  s17 group  Who do we like for this?
  s18 spot   Marisol, in her galley           -> marisol_alibi_broken (gated)
  s19 spot   Dr. Okonjo, properly             -> okonjo_statement (gated)
  s20 spot   Brann's watch log                -> brann_alibi (gated)
  s21 spot   Hal, nineteen hours in
  s22 spot   The bridge safe       [memory]   -> captain_ledger (needs captain_notebook)
  s23 group  The passengers want answers

ACT 4 — THE NIGHT BEFORE
  s24 spot   The captain's cabin   [search]   -> cabin_note
  s25 spot   Laying it out         [order]    -> timeline (needs 6 clues)
  s26 group  What does the timeline say?
  s27 CRISIS The generators fail early
               free -> mishap: below decks is dark
  s28 spot   Marisol, with the timeline       -> marisol_admission (gated)
  s29 spot   The cold store        [timing]   -> found_captain (gated)
  s30 spot   Six o'clock

ACT 5 — THE ACCUSATION
  s31 CRISIS Brann asks for your evidence
               free -> LOSES torn_page
  s32 spot   Getting the story straight
  s33 group  THE ACCUSATION                   -> sets `accused`
  s34 spot   What you say next
  s35 spot   The cutter comes alongside
  s36 spot   Dawn                             -> ending
```

## 7. Skill tests

Eight moments where the spotlight player has to *do* something, not just choose.
Two of each kind, spread across the run.

| Kind | What it is | Where |
|---|---|---|
| **timing** | A marker sweeps a bar; stop it in the zone | s14 the crate, s29 the cold store door |
| **memory** | A code shows briefly, then you enter it | s5 the radio, s22 the safe |
| **search** | Find the entries that do not belong, against a clock | s13 the bin, s24 the cabin |
| **order** | Put timestamps back in sequence | s16 the footage, s25 the timeline |

Rules the engine enforces:

- **A choice has a cost or a skill test, never both.** Paying Stars and then
  failing a puzzle punishes one decision twice.
- **Skill tests are spotlight-only.** Six people cannot play one puzzle.
- **Failing is never a dead end.** A failed attempt applies `failEffects`
  (nothing, by default) and continues. It costs you the prize, not the run.
- **Difficulty rises with mishaps**, clamped to 5. `teddy_offended` and
  `blackout` each add 1, so a group that has collected setbacks finds the back
  half genuinely harder — but never impossible.

The puzzle runs in the browser; its *outcome* is an engine action, because the
server applies the effects once rooms exist. A client could lie about passing.
For a game among friends that is the right trade.

## 8. Proof tiers

| Tier | Requires |
|---|---|
| **Strong** | `torn_page` **and** one of `timeline` / `marisol_admission` / `smuggling_crate` / `captain_ledger` |
| **Weak** | any of `torn_page` / `marisol_alibi_broken` / `smuggling_crate` / `marisol_admission` |
| **None** | none of the above |

Note that `torn_page` can be taken off you at s31 if you hand your evidence to
Brann, which can drop a group from Strong to None in one free choice.

## 9. Every ending

Matched top to bottom, first match wins. The last has no conditions.

| # | Id | Conditions | Title |
|---|---|---|---|
| 1 | `perfect` | Marisol · strong proof · captain found | **Everything, before the cutter** |
| 2 | `rescued_and_named` | Marisol · captain found | **He's alive, and she knows you know** |
| 3 | `airtight_too_late` | Marisol · strong proof | **Airtight, and three hours too late** |
| 4 | `she_walks` | Marisol · no proof | **She walks** |
| 5 | `captain_explains` | captain found · someone else accused | **The captain explains it himself** |
| 6 | `found_never_knew` | captain found · nobody accused | **Found him. Never worked out why** |
| 7 | `reckless_brann` | Brann accused · holding `brann_alibi` | **You had his alibi in your hand** |
| 8 | `reckless_okonjo` | Okonjo accused · holding `okonjo_statement` | **You knew where she was** |
| 9 | `ruined_brann` | Brann accused | **A career ends at sea** |
| 10 | `ruined_okonjo` | Okonjo accused | **The doctor stops talking** |
| 11 | `ruined_bystander` | Teddy or Hal accused | **You picked the easiest person** |
| 12 | `adrift` | *(fallback)* | **Adrift** |

### Why this shape

The matrix is **who × proof × rescue × what you knew**, not a single counter. Two
groups that both accuse Marisol can land in four different places depending on
what they can prove and whether anyone opened the cold store.

Endings 5 and 6 are the ones that make the structure worth the effort: the group
gets the *man* back without getting the *answer*, which is a genuinely different
kind of win. Endings 7 and 8 are the inverse — the group had the exculpatory clue
in the notebook and named the person anyway. A rescue overrides both, because the
captain is standing right there to correct the record.

## 10. Measured balance

From `npm run scenarios -- stranded 4 0.7`, 60,000 sampled runs at a 70% skill
test pass rate:

| Gate | Best option costs | Affordable alone | Needs the table |
|---|---|---|---|
| s11 | 6 | 29% | 71% |
| s15 | 3–4 | 52% | 48% |
| s27 | 5–6 | 46% | 54% |
| s31 | 5–7 | 25% | 75% |

**Clues per run: 5 minimum, 9.1 average, 18 maximum of 21.**

All 12 endings and all 21 clues remain reachable at 2, 4 and 6 players, and at
pass rates from 35% to 95%.

One caveat on the ending percentages in that report: sampling picks **uniformly
among the options a table could take**, which is not how a table plays. A real
group that has found the key will open the cold store; the sampler opens it a
quarter of the time. Read those numbers as the shape of the possibility space,
not as the odds of a real group getting a given ending.

## 11. Rules this story sets

Decisions specific to Stranded, which differ from The Pilot:

- **You can be wrong.** Accusing an innocent person is a real, bad ending. The
  design doc's original "no losing" rule is relaxed here, because an investigation
  where you cannot be wrong is not an investigation.
- **Clue gates hide, Star gates lock.** You cannot see an option you have no
  reason to think of; you can always see a price you cannot pay.
- **Crisis scenes buy access, not safety.** Paying buys a *search*, or keeps your
  evidence out of Brann's safe. Information, not insurance.
- **The rescue is separable from the solution.** Deliberately. It is what stops
  the story being a single pass/fail.

## 12. Open questions

1. Eight skill tests in 36 scenes — roughly one every four and a half scenes. Too
   many, too few, or wrong in their placement?
2. A failed skill test currently costs only the clue. Should any of them cost
   something worse — a mishap, or tipping off the culprit?
3. Accessibility: every test is timed or dexterity-based. Should the room be able
   to spend Stars to let another player attempt it, or to pass it automatically?
   That would fit the existing "help the spotlight" mechanic exactly.
4. Should a wrong accusation still allow the rescue afterwards, or is the
   accusation genuinely the last beat?
