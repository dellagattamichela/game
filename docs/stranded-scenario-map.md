# Stranded — scenario map

*The story bible for the investigation story. This is the source of truth for
what is true, what can be found, and where every run can end up.*

Companion: `npm run scenarios -- stranded` generates the coverage report that
checks this document against the actual story file — every clue findable, every
ending reachable, no orphan scenes. The ending table in §8 is also pinned by
tests in `src/stories/stories.test.ts`, so editing a condition without editing
this document fails the suite.

---

## 1. Premise

> Your cruise ship's captain has vanished. So has the buffet.

The *Sea Marigold* is adrift somewhere off the coast. Captain Vasquez did not
appear for morning muster. Neither did breakfast. There are five people who could
have had a hand in it, one of whom actually did, and about eighteen hours before
the ship's generators give out.

Tone: light, dry, closed-circle mystery. Nobody is evil; one person is in very
deep trouble and making it worse.

## 2. What actually happened

**The canonical truth, which players never see stated outright.**

Marisol Reyes, the head chef, has been running goods through the ship's food
shipments for two years. On the night of the Captain's Dinner, Captain Vasquez
opened a crate expecting langoustines and found something else. He confronted her
in the galley at around 2am. It went badly — not murderously, but badly. He is
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
| **First Officer Brann** | Second in command | Takes command smoothly, and his promotion paperwork was filed the day *before* the captain vanished | Innocent. He filed it early because he is a careerist, not a criminal |
| **Dr. Okonjo** | Ship's doctor | Was quietly treating the captain; the prescription suggests confusion and wandering | Innocent. Protecting a patient's privacy, badly |
| **Marisol Reyes** | Head chef | The buffet is gone and she was the last to leave the galley | **Guilty** |
| **Teddy Vance** | Passenger, cruise influencer | Filmed everything, everywhere, and is strangely unwilling to hand over footage | Innocent. The footage shows him stealing a lobster |
| **Hal** | Night engineer | The only person awake at 3am | Innocent. Genuinely just working |

Brann and Okonjo are the designed red herrings: each has a clue that points
squarely at them, and each clue has an innocent explanation that only surfaces if
the group keeps digging.

## 4. Clues

Twelve clues. **Nine of twelve is the realistic ceiling in one run** — the search
scenes force a choice of location, and the third location is only reachable by
paying at a crisis.

| Id | What it is | Found in | Missable |
|---|---|---|---|
| `captain_notebook` | The captain's notebook, several pages torn out | s3, free | no |
| `brann_promotion` | Promotion papers dated the day before | s4, if the desk is searched | yes |
| `cold_store_empty` | The cold store was emptied overnight, not just the buffet | Galley search | yes |
| `key_missing` | The cold store key is gone from the key board | Galley search | yes |
| `hal_saw_light` | Hal saw the cold store light on at 3am | Engine room search | yes |
| `manifest_gap` | Forty minutes missing from the cargo manifest | Engine room search | yes |
| `doctor_prescription` | The captain was medicated, and prone to wandering | Sick bay search | yes |
| `scuffed_deck` | Drag marks on the deck outside the galley | Sick bay search | yes |
| `teddy_footage` | Corridor footage from 2am | s11, costs Stars | yes |
| `marisol_alibi_broken` | She said she was asleep; the ovens ran all night | s13, needs `hal_saw_light` or `cold_store_empty` | yes |
| `torn_page` | The torn notebook page, in the galley bin. It names her | s14, needs `captain_notebook` | yes |
| `smuggling_crate` | A crate with a false bottom | s14, needs `manifest_gap` | yes |

### Clue pairs and the location choice

The three search locations each give **two** clues and can each be visited once:

- **Galley** → `cold_store_empty`, `key_missing` *(the "where" pair)*
- **Engine room** → `hal_saw_light`, `manifest_gap` *(the "when" pair)*
- **Sick bay** → `doctor_prescription`, `scuffed_deck` *(the red herring pair)*

Two searches are free. The third costs a crisis. A group that skips the galley
entirely will struggle to find the captain; a group that skips the engine room
will struggle to prove the smuggling.

## 5. Run variables

Beyond clues, a run carries two single-valued variables that the endings read:

| Variable | Set at | Values |
|---|---|---|
| `accused` | s18, the accusation vote | `brann`, `okonjo`, `marisol`, `teddy`, `hal`, or unset |
| `found_captain` | s16, if the cold store is opened | `yes`, or unset |

## 6. Scene map

Twenty scenes. `spot` = spotlight player decides, `group` = everyone votes,
**bold** = crisis scene with Star-gated choices.

```
ACT 1 — THE MORNING AFTER
  s1  spot   The ship is not moving
  s2  group  Who do we trust to run this?
  s3  spot   The bridge is empty          -> captain_notebook (free)
  s4  spot   Brann takes command          -> brann_promotion (optional)
  s5  group  Tell the passengers, or keep it quiet?

ACT 2 — THE SEARCH
  s6  spot   Search #1: galley | engine room | sick bay
  s7  spot   The generators cough
  s8  spot   Search #2: the two rooms you have not been in
  s9  CRISIS Brann confines everyone to cabins
               free  -> comply, take a mishap, skip the third search -> s11
               2 ⭐  -> talk him down                                -> s10
               5 ⭐  -> name his promotion date (needs brann_promotion) -> s10
  s10 spot   Search #3: the last room
  s11 CRISIS Teddy wants something for the footage
               free  -> refuse, take a mishap
               2 ⭐  -> pay his price   -> teddy_footage
               4 ⭐  -> put him in the story -> teddy_footage, +1 ⭐ all
  s12 group   Who do we like for this?
  s13 spot   Confront Marisol             -> marisol_alibi_broken (gated)
  s14 spot   The galley bin / the crate   -> torn_page | smuggling_crate (gated)

ACT 3 — THE ACCUSATION
  s15 group  The generators are going. What matters most now?
  s16 spot   The one room nobody has opened -> found_captain (gated)
  s17 CRISIS Brann asks for your evidence, correctly
               free  -> hand it over    -> LOSES torn_page
               3 ⭐  -> refuse
               6 ⭐  -> hand over a copy -> +1 ⭐ all
  s18 group  THE ACCUSATION -> sets `accused`
  s19 spot   What you say next
  s20 spot   Dawn                          -> ending
```

### Gated scenes in detail

**s13 — Confront Marisol.** The confrontation option only appears if the group
holds `hal_saw_light` or `cold_store_empty`. Without either, there is nothing to
confront her *with*, and the scene passes as small talk. This is the shape every
clue gate in this story takes: **the option is hidden, not locked.** You cannot
see an option you have no reason to think of.

That is deliberately different from a Star gate, which is shown locked with its
price. Money you can see you lack; a thought you have not had, you cannot.

**s16 — The cold store.** Needs `key_missing`, `cold_store_empty`, or
`hal_saw_light`. Any one of the three is enough to make someone ask what is behind
that door. This is the rescue, and it is independent of the accusation.

**s14 — Physical evidence.** Two separate options, each gated:
`torn_page` needs `captain_notebook` (you must know pages are missing to look for
one) and `smuggling_crate` needs `manifest_gap`.

## 7. Proof tiers

How well Marisol can be proved, which several endings read:

| Tier | Requires |
|---|---|
| **Strong** | `torn_page` **and** one of `cold_store_empty` / `key_missing` / `smuggling_crate` |
| **Weak** | `marisol_alibi_broken` or `torn_page` or `smuggling_crate` |
| **None** | none of the above |

## 8. Every ending

Ten endings. Matched top to bottom, first match wins, so the table is in
precedence order. The last has no conditions and catches everything left.

| # | Id | Conditions | Title |
|---|---|---|---|
| 1 | `perfect` | accused Marisol · strong proof · captain found | **Everything, before lunch** |
| 2 | `rescued_and_named` | accused Marisol · weak proof · captain found | **He's alive, and she knows you know** |
| 3 | `airtight_too_late` | accused Marisol · strong proof · not found | **Airtight, and three hours too late** |
| 4 | `she_walks` | accused Marisol · no proof · not found | **She walks** |
| 5 | `captain_explains` | captain found · accused anyone else | **The captain explains it himself** |
| 6 | `found_never_knew` | captain found · nobody accused | **Found him. Never worked out why** |
| 7 | `ruined_brann` | accused Brann · not found | **A career ends at sea** |
| 8 | `ruined_okonjo` | accused Okonjo · not found | **The doctor stops talking** |
| 9 | `ruined_bystander` | accused Teddy or Hal · not found | **You picked the easiest person** |
| 10 | `adrift` | *(fallback)* nobody accused, nobody found | **Adrift** |

### Why this shape

The matrix is **who × proof × rescue**, not a single counter. That is the whole
reason for the rewrite: The Pilot's endings read one number, so a run could only
ever land in one of four buckets. Here, two players who both accuse Marisol can
still get materially different endings depending on what they can prove and
whether anyone thought to open the cold store.

Endings 5 and 6 are the ones that make the structure worth the effort: the group
gets the *man* back without getting the *answer*, which is a genuinely different
kind of win and impossible to express with a single counter.

## 9. Measured balance

From `npm run scenarios -- stranded 4`, 60,000 sampled runs:

| Gate | Best option costs | Affordable alone | Needs the table |
|---|---|---|---|
| s9 | 5 | 59% | 41% |
| s11 | 4–5 | 54% | 46% |
| s17 | 6–7 | 33% | 67% |

The gates get harder as the story goes on, which is what you want: by the last
one the room is usually deciding together whether the evidence is worth
everything they have left.

**Clues per run: 5 minimum, 7.3 average, 11 maximum of 12.** No run can collect
all twelve, so every group finishes with something they never found.

One caveat on the ending percentages in that report: sampling picks **uniformly
among the options a table could take**, which is not how a table plays. A real
group that has found the key will open the cold store; the sampler opens it a
third of the time. So read those numbers as the shape of the possibility space,
not as the odds of any particular group getting a particular ending.

## 10. Rules this story sets

Decisions specific to Stranded, which differ from The Pilot:

- **You can be wrong.** Accusing an innocent person is a real, bad ending. The
  design doc's original "no losing" rule is relaxed here, because an investigation
  where you cannot be wrong is not an investigation.
- **Clue gates hide, Star gates lock.** See s13 above.
- **Crisis scenes buy access, not safety.** In The Pilot, paying at a crisis
  avoids a setback. Here, paying buys a *search* — information, not insurance.
- **The rescue is separable from the solution.** Deliberately. It is what stops
  the story being a single pass/fail.

## 11. Open questions

1. Does s12's "who do we like for this?" vote need to *do* anything mechanically,
   or is committing to a name out loud enough on its own?
2. Eleven of twelve clues is the measured ceiling. Is that the right amount of
   missing, or should a perfect run be able to get all twelve?
3. Should a wrong accusation still allow the rescue afterwards, or is the
   accusation genuinely the last beat?
