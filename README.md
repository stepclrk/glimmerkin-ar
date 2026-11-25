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

## How it is built

| File | What |
| --- | --- |
| `index.html` | Page, styles, HUD and sheets |
| `src/core.js` | The game's `src/core.js`, copied unchanged: world generator, kinds, blockers, glooms, biomes, bond and forms |
| `src/glim.js` | From the game: `petLook`, the trick shape recogniser, littles, a new save, reading a save code |
| `src/creature.js` | The stand-in 3D creature built from `petLook`, and its poses |
| `src/main.js` | WebXR session and placement, the nest: care, tricks, berries, eggs, sleep, Where to? |
| `src/quest.js` | The quest board, sending littles, results |
| `test/preview.test.mjs` | Browser test of the nest: tricks, praise, berries, bringing in a creature |
| `test/quest.test.mjs` | Browser test that hatches an egg and plays whole quests to the portal |

Third-party code: [three.js](https://threejs.org) 0.170.0 (MIT), loaded from jsdelivr. No build step.

WebXR features: `immersive-ar` with `hit-test` (required), `dom-overlay` and `anchors` (optional).

## Run and test

```sh
python3 -m http.server 8765        # then open http://localhost:8765 (preview only; AR needs https)
node test/preview.test.mjs          # needs Playwright: npm i -g playwright && npx playwright install chromium
node test/quest.test.mjs            # QUESTS=5 to play more
```

Each test prints `ALL CHECKS PASSED` or names what failed. `THREE_PATH` serves three.js from disk when the CDN is not
reachable; `SHOTS_DIR` sets where screenshots go.
