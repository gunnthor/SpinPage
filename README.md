# SpinPage

> A dramatic spinning wheel and random name picker for draft orders, giveaways, party games, and any moment that deserves a little spectacle.

SpinPage is a single-file web app that turns a simple random picker into a polished casino-style experience: animated canvas wheel, fanfare, confetti, undoable draft picks, autospinning, surprise plot twists, and a mischievous second-chance wheel where no one is ever completely safe.

![SpinPage preview](https://img.shields.io/badge/SpinPage-Spinning%20Wheel-d4af37?style=for-the-badge)
![Static site](https://img.shields.io/badge/Static%20HTML-No%20build%20required-1e8449?style=for-the-badge)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JavaScript-c0392b?style=for-the-badge)

## Highlights

- **Spinning wheel picker** with smooth canvas animation and weighted-looking theatrical timing.
- **Draft order mode** that removes winners from the wheel and records every pick.
- **Autospin** for hands-free draft generation.
- **Undo, restore, clear, and copy** controls for managing draft results.
- **Plot twists** where the wheel fakes a stop, then blasts back into motion.
- **Power-up slices** (Hot Seat, Cursed, Wildcard) that swell or shrink a slice before a spin and genuinely shift the odds.
- **Illegal spin moments** with a stamped invalid result and retry.
- **No One Is Safe wheel** that can randomly undraft a previous pick.
- **Confetti, fire, fanfare, ticks, and impact sounds** using browser-native canvas and Web Audio APIs.
- **Local persistence** through `localStorage`, so your current table survives refreshes.
- **Zero dependencies**: just open `index.html`.

## Quick Start

Clone the repo:

```bash
git clone https://github.com/gunnthor/SpinPage.git
cd SpinPage
```

Open `index.html` in your browser. That is the whole app.

You can also serve it locally if you prefer:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## How To Use

1. Add players or names in the left panel.
2. Press **SPIN** to pick one winner.
3. Watch the winner move into the draft order.
4. Use **AUTOSPIN** to keep picking until the wheel is empty.
5. Copy the finished draft order when you are done.

The options panel lets you tune winner display duration, set how many positions count as winners, toggle plot twists and power-up slices, enable the second-chance "No One Is Safe" wheel, and turn on the rigged mode used for local jokes or demos. All of these preferences persist across refreshes.

## Project Structure

```text
SpinPage/
├── index.html   # HTML, CSS, and JavaScript for the full app
└── README.md    # Project documentation
```

SpinPage is intentionally compact. The UI, styling, animation, sound effects, and app state all live in `index.html`, making it easy to host anywhere static files are supported.

## Tech Notes

- **Rendering:** HTML5 Canvas
- **Sound:** Web Audio API
- **State:** Browser `localStorage`
- **Hosting:** Static HTML
- **Build step:** None
- **Runtime dependencies:** None

## Browser Support

SpinPage works best in modern desktop and mobile browsers with JavaScript enabled. Audio effects begin after a user gesture, following normal browser autoplay rules.

## Development

Because this is a dependency-free static app, development is refresh-driven:

```bash
# optional local server
python -m http.server 8000
```

Edit `index.html`, refresh the browser, repeat.

For a lightweight JavaScript syntax check, you can extract the inline script and run it through Node, or use your editor's HTML/JS validation.

## Roadmap Ideas

- Import/export name lists.
- Shareable saved wheels.
- Custom color themes.
- Optional seeded randomness for repeatable draws.
- Screenshot/export for final draft orders.
- Keyboard shortcuts and accessibility refinements.

## License

No license has been added yet. If you plan to reuse SpinPage publicly, add a license file first.

---

Built for the sacred moment when everyone says, "Just spin it already."
