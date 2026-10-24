# SpinPage

> A dramatic spinning wheel and random name picker for draft orders, giveaways, party games, and any moment that deserves a little spectacle.

SpinPage turns a simple random picker into a casino-style show on a dark stage: a brass wheel with marquee bulbs, fanfare, confetti, an undoable draft board, autospin, plot twists, and a second-chance wheel where no one is ever completely safe. It is a static site with no dependencies and no build step.

![SpinPage preview](https://img.shields.io/badge/SpinPage-Spinning%20Wheel-e2b94a?style=for-the-badge)
![Static site](https://img.shields.io/badge/Static%20HTML-No%20build%20required-3fbf86?style=for-the-badge)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-c8352a?style=for-the-badge)

## One screen

The wheel, SPIN and the live numbers are on screen together and the page never scrolls, from a 320px phone to a 4K monitor:

- **Desktop:** Players | wheel | Draft board, under a scoreboard.
- **Tablet portrait:** the wheel on top, players and board side by side beneath it.
- **Phone:** the wheel takes the full width, SPIN sits in the thumb zone, and a tab bar opens Players, Board and Settings as bottom sheets.
- **Phone on its side:** the wheel on the left, everything else on the right.

The **scoreboard** always shows the next pick, how many are left on the wheel, the latest pick and the spin count (with illegal spins). The **status line** under it says what the wheel is doing: ready (with each name's real odds), spinning (with the name under the pointer), a power-up and what it did to the odds, a stunt, the result.

## Highlights

- **Spinning wheel picker** drawn at your screen's real resolution, with rim pegs you can see and hear and a flapper pointer that kicks on every peg.
- **Grab-to-spin**: drag the wheel with a mouse or finger and let go. Your flick sets the speed, the lap count and the drama — never the winner, which is drawn after your hand leaves the wheel. Only the wheel itself is grabbable; a second finger or a resting finger does nothing.
- **Pop-off**: a violent enough hand-flick can rip the wheel off its hub. It either ricochets around the screen or drops to the floor and rolls away, then hops back onto the hub to finish the very same spin.
- **The winner's moment**: the winning slice lights up, the rest dim, and a nameplate rises over the wheel with the pick number. Nothing blacks out the board or the scoreboard.
- **Draft board**: every seat from first to last — the picks so far, the one on the clock, the empty ones still to come — with the winner cut drawn where it falls.
- **Autospin** for hands-free draft generation. Auto can be switched on or off at any moment — mid-spin, mid-event, even from inside the PANIC race — and takes over from the next pick. The phone stays awake while it runs.
- **Undo** reverses whatever happened last: a pick, a stolen seat or a whole PANIC race. **Restore all**, **Delete picks** and **Reset table** act at once and offer an Undo for ten seconds.
- **Paste a list**: a column copied from a spreadsheet or a notes app becomes one player per line.
- **Wind-back**: the wheel runs an ordinary spin, creeps to a stop on a slice — and then gets dragged backwards, held, and thrown forward again onto the real winner.
- **The Gremlin**: as the wheel crawls through its last degree, something climbs onto the rim, creeps it round by hand, fakes the stop, looks innocently away — and grabs it again. A slow burn from ten seconds to a minute and a half; rare at a full table, up to about one spin in four with three names left.
- **Power-up slices** (Hot Seat, Cursed, Wildcard) swell or shrink a slice before a spin and genuinely shift the odds; the status line spells out the change (`14% → 33%`) for the whole spin, on every screen.
- **PANIC slice** that drops every drafted player into a horse race over 2-4 hurdles where only the majority keep their seats. It runs at a fixed 60 steps a second, so a 120Hz phone runs the same race as a 60Hz monitor, and it can be skipped to the result.
- **Illegal spin moments** with a stamped invalid result and retry.
- **No One Is Safe**: after a pick, the wheel can turn over to show the drafted seats under a red light and spin once to steal one. It plays on the stage, so the scoreboard, the board (seats at risk, then the one lost) and the console stay up; SPIN becomes Skip, and Auto stays live.
- **Sound**: synthesized peg clicks, fanfare and stunt sounds, with a mute that is remembered.
- **Calm effects**: follows your system's reduce-motion setting (or the switch in Settings) — no confetti, fire, shaking or flashing, and a three-second spin to the same result.
- **Accessible**: every result is announced to screen readers, everything works from the keyboard (Space spins), dialogs and sheets manage focus, and phone targets are at least 44px.
- **Local persistence** through `localStorage`, so your table survives refreshes — including in the middle of an event.
- **Zero runtime dependencies.**

## Quick Start

```bash
git clone https://github.com/gunnthor/SpinPage.git
cd SpinPage
```

Open `index.html` in your browser — it works straight from disk. Or serve the folder:

```bash
python -m http.server 8000
```

## How To Use

1. Add names in the Players panel (on a phone, in the box under the wheel). Paste a whole list if you have one.
2. Set the winner slots on the board: how many of the first picks count as winners.
3. Press **SPIN** or Space, or grab the wheel and flick it — a quick tap on the wheel spins it too.
4. Watch the winner take the next seat on the board. **Auto** keeps spinning until the wheel is empty.
5. Copy the finished draft order from the board, or from the results card at the end.

Settings has every twist as a switch: wind-back, gremlin, pop-off, power-ups, the Panic slice and No One Is Safe, plus winner display timing, sound, calm effects and the Rigged house rule. Turn them all off and you have a plain, fast wheel spinner.

**Is it fair?** Every spin draws its winner, weighted by slice size, before the wheel has moved a degree. Power-ups change slice sizes and the real odds, and say so. Hand flicks, wind-backs, the gremlin and pop-offs only change the *route* the wheel takes to get there. The one exception is **Rigged**, which you have to switch on yourself and which switches itself off when you reload.

## Project Structure

```text
SpinPage/
├── index.html            # Markup, SEO metadata and the About/FAQ copy
├── css/spinpage.css      # The whole design system and all four layouts
├── js/                   # Classic scripts, loaded in this order:
│   ├── core.js           #   pure game maths: selection, easings, gremlin, hurdles
│   ├── dom.js            #   element references
│   ├── state.js          #   game state, derived stats, undo history, save/migrate, commit()
│   ├── audio.js          #   Web Audio synthesis
│   ├── fx.js             #   confetti, sparks, fire, flash, shake
│   ├── wheel.js          #   rendering, spin flow, grab-to-spin, pop-off
│   ├── events.js         #   illegal spins, No One Is Safe, PANIC race, gremlin, the winner's moment, autospin
│   └── ui.js             #   render(), panels, sheets, dialogs, keyboard, settings, boot
├── fonts/                # Cinzel and Oswald (SIL Open Font License), latin + latin-ext
├── tests/                # node:test + playwright-core (dev only)
├── docs/                 # Design notes (not deployed)
├── favicon.svg, apple-touch-icon.png, og-image.png, robots.txt, sitemap.xml
└── README.md
```

The scripts are ordinary `<script>` tags rather than modules so the page still opens from `file://`, and their top-level functions stay reachable for browser tests. Every change to the table goes through `commit()`, which saves once and re-renders everything from state, so no panel can be left showing stale numbers.

## Tech Notes

- **Rendering:** HTML5 Canvas at device resolution; the wheel face is cached and rotated, under a fixed lighting layer
- **Sound:** Web Audio API
- **State:** `localStorage` (`spinpage`), save format v2 — additive, so an older build can still read it
- **Hosting:** static files (`.vercelignore` keeps `tests/` and `docs/` off the site)
- **Build step:** none
- **Runtime dependencies:** none

## Tests

```bash
cd tests
npm install            # playwright-core only; the site itself has no dependencies
npm test
```

84 checks in four suites:

- `gameplay.test.js` — every mechanic, written against the original single-file page and still passing unchanged: selection odds, illegal spins, rigged, flicks, wind-back, gremlin, pop-off, power-ups, the PANIC wedge and race, No One Is Safe, autospin, undo/restore/clear/reset, copy, persistence.
- `stats.test.js` — the scoreboard against the game state through every kind of event and reload.
- `layout.test.js` — no scroll and nothing off screen at 14 viewports from 320x568 to 1920x1080 and phone landscape; touch targets, keyboard, dialogs, announcements, calm effects.
- `unit.test.js` — the pure logic in Node, no browser.

The browser suites need a Chromium: they use one already downloaded by Playwright, or set `CHROME_PATH`, or run `npx playwright-core install chromium`.

## Roadmap Ideas

See [TODO.md](TODO.md) for the running backlog (including the proposed multiplayer "host a room" feature).

- Import/export name lists.
- Shareable saved wheels.
- Custom color themes.
- Optional seeded randomness for repeatable draws.
- Screenshot/export for final draft orders.

## License

No license has been added yet. If you plan to reuse SpinPage publicly, add a license file first. The bundled fonts are under the SIL Open Font License (see `fonts/`).

---

Built for the sacred moment when everyone says, "Just spin it already."
