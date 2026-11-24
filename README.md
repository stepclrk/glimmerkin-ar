# Glimmerkin AR

Phase 0 prototype: your Glimmerkin on a real table, through an Android phone. It answers one question before any
money goes on 3D art: does it feel like the same creature, and is playing with it in AR fun?

**Try it:** https://stepclrk.github.io/glimmerkin-ar/ in Chrome on an Android phone that supports
[ARCore](https://developers.google.com/ar/devices). Any other browser gets the same creature in a preview on screen.

## What you can do

| On the phone | What happens |
| --- | --- |
| Start AR, move the phone slowly over a table until a gold ring shows, tap | The Glimmerkin pops onto the table and turns to face you wherever you walk |
| Stroke it with a finger | Joy rises and hearts float up. Head, cheeks and tummy each react differently, and one is today's favourite spot, as in the game |
| Hold a finger still on it | A hug. Hold for a few seconds for a big hug |
| Draw a shape on empty space | It tries a trick: circle spin, zigzag (side to side) wiggle, swipe up leap, swipe down bow, heart blow a kiss, star strike a pose, spiral chase its tail, swipe across roll over |
| Stroke it straight after a try | Praise. Five praised tries and it knows the trick: then it does it neatly, and shows off by itself when happy |
| Flick up from the berry | A berry flies in an arc and it hops over and leaps to catch it. Too hard or too soft and it misses. A tap throws one straight to it |
| Move | Pick it up and put it somewhere else |

**Bring in your Glimmerkin.** In the game, open the ? sheet, tap Keep a copy, and paste the code into "Bring in your
Glimmerkin". The look (colour, ears, tail, features from its diet, Bond stage, Mythic form, starfruit marks) and the
tricks it knows come across. Nothing goes back to the game yet: what it learns here stays in this browser.

## What this is not

- **Not the real art.** The creature is a stand-in built from simple shapes, using the game's own `petLook` and its
  body outline turned into 3D. Phase 1 replaces it with a proper rigged model.
- No littles, quests, sleep or shared save yet. Those are phases 1 to 3 in the feasibility doc.
- No iPhone: Safari has no WebXR AR.

## How it is built

| File | What |
| --- | --- |
| `index.html` | Page, styles, HUD and sheets |
| `src/glim.js` | Copied from the game unchanged: RNG, `petLook`, the trick shape recogniser (`shapeOf`), trick names, the favourite spot, reading a save code |
| `src/creature.js` | The stand-in 3D creature built from `petLook`, and its poses |
| `src/main.js` | WebXR session, hit-test placement and anchors, touch, tricks, praise, the berry throw |
| `test/preview.test.mjs` | Browser test of the preview |

Third-party code: [three.js](https://threejs.org) 0.170.0 (MIT), loaded from jsdelivr. No build step.

WebXR features: `immersive-ar` with `hit-test` (required), `dom-overlay` and `anchors` (optional).

## Run and test

```sh
python3 -m http.server 8765        # then open http://localhost:8765 (preview only; AR needs https)
node test/preview.test.mjs          # needs Playwright: npm i -g playwright && npx playwright install chromium
```

The test prints `ALL CHECKS PASSED` or names what failed. `THREE_PATH` serves three.js from disk when the CDN is not
reachable; `SHOTS_DIR` sets where screenshots go.
