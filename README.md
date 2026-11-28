# Glimmerkin AR

Glimmerkin on a real table, through an Android phone: look after your Glimmerkin and its littles in the nest, then go
on quests across a little world laid out on the table.

**Play it:** https://stepclrk.github.io/glimmerkin-ar/ in Chrome on an Android phone that supports
[ARCore](https://developers.google.com/ar/devices). Any other browser gets the same game in a preview on screen.

## In the nest

| On the phone | What happens |
| --- | --- |
| Start AR, move the phone slowly over a table until a gold ring shows, tap | The nest pops onto the table: your Glimmerkin, its littles and any eggs |
| Stroke it | Joy rises. Head, cheeks and tummy each react differently, and one is today's favourite spot |
| Hold a finger still on it | A hug |
| Draw a shape on empty space | It tries a trick: circle spin, zigzag wiggle, swipe up leap, swipe down bow, heart kiss, star pose, spiral chase its tail, swipe across roll. Stroke it straight after to praise it; five praised tries and it knows the trick, and the littles join in |
| Flick up from the berry button | A berry from the pantry flies and it leaps to catch it. A tap throws one straight to it. Change berry cycles the pantry. Its diet shapes its look, as in the game |
| Rub an egg | It warms, glows and hatches into a little. A banded egg is a twin |
| Tap a little | It says who it is and what it clears |
| Sleep | Rest comes back four times as fast. A quest costs 25 Rest |

Joy, Belly and Rest drift with time, including while the page is closed. Bond grows with care and stardust, through
the game's stages to a Mythic form.

## Out in the room

Once the nest is down, look slowly around the room: the floor, tables, the sofa, the walls. Gold sparkles show each bit
of surface the phone has found, and blue ones the walls. Wherever you have looked, your Glimmerkin can go.

| What | What happens |
| --- | --- |
| Left alone | It wanders: across the table, down to the floor, up onto a seat, up a wall for a look around, over to you, back to the littles. A hop it can't make, it vanishes in sparkles and reappears |
| Out of sight | A gold arrow at the edge of the screen points to it, with how far away it is |
| Come here | It comes to the floor or table in front of you |
| A berry that sails past | It lands where it lands, on the floor or a seat, and your Glimmerkin runs to fetch it |
| Low Joy or Belly | It comes to find you |
| Play, Hide and seek | The screen goes dark while you count to ten and it hides: under a table, behind something, behind you. Listen for its giggle (left or right, louder when close). After half a minute sparkles rise from its hiding place. Tap it, or look straight at it from close by, to find it. Stardust, more for a quick find |
| Play, Egg hunt | It hides five glimmer eggs around the room. Tap one, or bring the phone right up to it. Each is stardust and a berry, with a bonus for all five. Stuck, and it trots over to the nearest one |
| Play, Keep it near the nest | Roaming off |

On phones with ARCore depth (most mid-range and better), real things hide it: walk round the sofa and it is behind the
sofa, and hide and seek knows what you can't see. Without depth it shows through furniture, but still hides under tables
and behind you.

The preview has a pretend room (a table, a stool and a wall) so all of this works on a screen too.

## On a quest

Where to? offers three portals and lets you choose up to three littles. The world is built by the game's own
generator (`src/core.js`, copied across unchanged), so every world can be finished with the party you take.

| Tap | What happens |
| --- | --- |
| A tile | Your Glimmerkin walks there and picks up what it passes |
| Loot you can reach | A little runs to fetch it |
| A blocker (bramble, water, boulder, chasm, storm, shadow, fog, ruin, crystal) | Choose a little who can clear it, for a spark. Some need two littles together, or a twin |
| A gloom | Choose who chases it off. Some littles are scared of some glooms |
| The moon plate | A little sits on it and holds the moon gate open. Walk through and the gate stays open |
| Loot on a floating islet | A Gale little flies to fetch it |
| Rally | Once a quest, if Belly was 60 or more when you set out: every little gets a spark back |
| The portal | With enough star shards it wakes, and stepping through ends the quest |

Coming home pays stardust (more for spare sparks), brings berries for the pantry and eggs for the nest, and levels up
the littles who went. Head home early keeps the loot for half the stardust.

## Bring in your Glimmerkin

In the game, open the ? sheet, tap Keep a copy, and paste the code into "Bring in your Glimmerkin". The creature, its
littles, eggs and pantry come across. Nothing goes back to the game: progress here stays in this browser.

## What this is not

- **Not the real art.** The creature is a stand-in built from simple shapes, using the game's own `petLook` and its
  body outline turned into 3D. Phase 1 replaces it with a proper rigged model.
- Not in yet: world rules (the six twists), bosses, the journey, tools, the garden and the village. Saves are separate from the web game.
- No iPhone: Safari has no WebXR AR.
- The room is not remembered between visits (WebXR on Android has no lasting anchors), so you look around again each time.
  Plain white walls and dim rooms are often not found. Depth gets rough past about 4 metres.

## How it is built

| File | What |
| --- | --- |
| `index.html` | Page, styles, HUD and sheets |
| `src/core.js` | The game's `src/core.js`, copied unchanged: world generator, kinds, blockers, glooms, biomes, bond and forms |
| `src/glim.js` | From the game: `petLook`, the trick shape recogniser, littles, a new save, reading a save code |
| `src/creature.js` | The stand-in 3D creature built from `petLook`, and its poses |
| `src/main.js` | WebXR session and placement, the nest: care, tricks, berries, eggs, sleep, Where to? |
| `src/quest.js` | The quest board, sending littles, results |
| `src/room.js` | The room map (surfaces and walls from hit tests, each surface anchored) and depth sensing (occlusion, and whether a spot is hidden from the camera) |
| `src/roam.js` | Moving about the room: walking, hopping between surfaces, clinging to walls, vanishing; Come here; what it does when left alone |
| `src/play.js` | Hide and seek, the egg hunt, and the preview's pretend room |
| `test/preview.test.mjs` | Browser test of the nest: tricks, praise, berries, bringing in a creature |
| `test/quest.test.mjs` | Browser test that hatches an egg and plays whole quests to the portal |
| `test/room.test.mjs` | Browser test of the pretend room: roaming, hops, the wall, Come here, fetching, hide and seek, the egg hunt |

Third-party code: [three.js](https://threejs.org) 0.170.0 (MIT), loaded from jsdelivr. No build step.

WebXR features: `immersive-ar` with `hit-test` (required; several rays at once while you look around), `dom-overlay`, `anchors` and `depth-sensing` (cpu-optimized) (optional).

## Run and test

```sh
python3 -m http.server 8765        # then open http://localhost:8765 (preview only; AR needs https)
node test/preview.test.mjs          # needs Playwright: npm i -g playwright && npx playwright install chromium
node test/quest.test.mjs            # QUESTS=5 to play more
node test/room.test.mjs
```

Each test prints `ALL CHECKS PASSED` or names what failed. `THREE_PATH` serves three.js from disk when the CDN is not
reachable; `SHOTS_DIR` sets where screenshots go.
