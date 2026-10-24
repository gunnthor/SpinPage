# SpinPage premium redesign — plan

Branch: `feature/premium-redesign`. `master` stays deployable until this is reviewed.

## 1. Goal

The wheel, the spin controls and the live draft statistics must be on screen
**together, without page scrolling**, on desktop (1366x768 and up, surviving
~1280x620 once browser chrome is subtracted) and on phones (320x568 up to
430x932, 768x1024 and landscape). Everything else is designed around that.
Gameplay, randomness and personality are preserved exactly.

Baseline measured before any change (viewport screenshots in the session
scratchpad): the page scrolled **2,289px** on every desktop size and
**3,800-4,500px** on phones; it overflowed sideways at 768x1024 and 844x390;
the draft order sat below the fold on desktop under 1240px wide and at the
very bottom on phones, covered by a floating dock.

## 2. Inventory — what must not change

The source is the authority. Every item below is covered by
`tests/gameplay.test.js`, which passes against the original page.

| Mechanic | Exact rule (source) |
|---|---|
| Selection | `weightedPick(buildSegments(weights).weights)`; winner drawn before the wheel moves, landing at 12-88% across the slice |
| Segments | players + PANIC wedge when `panicEnabled && draftOrder >= 2 && !panicCooldown`, wedge weight `min(0.8, sum/3)` |
| Illegal spin | 5% of spins; stamp, no state change, autospin retries |
| Power-ups | 35% when >= 3 names: Hot Seat x3, Cursed x0.25, Wildcard 0.35-3.0 per slice; odds shown are `chanceOf` over the real segment weights (PANIC included) |
| Rigged | session-only switch; first name starting with the saved prefix always wins; prefix persists |
| Hand flick | release speed sets laps/duration/direction/pop-off, never the winner |
| Wind-back | 20% of eligible spins; overshoot then reversal, lands on the drawn winner |
| Gremlin | chance 30% at 3 names fading to 5% at 12+ (40% fading to 10% until he has been seen once on the device); 1-6 rounds weighted 40/22/15/11/7/5; never under reduced motion |
| Pop-off | power >= 0.88, 35% + (power-0.88)x4; never under reduced motion; roll or bounce |
| Stunt eligibility | no stunts on illegal spins, pop-offs, flicks with power >= 0.6 or backwards |
| No One Is Safe | 15% after a pick when a seat is drafted and names remain; new pick takes the victim's seat (same index), victim back on the wheel |
| Final name | with one name left after a pick it is drafted automatically; draft-complete splash |
| PANIC race | every drafted name runs; `outCount = max(1, ceil(n/2)-1)`; 2-4 hurdles; losers back on the wheel; no PANIC twice in a row |
| Winner display | auto: 2s under 5 entrants, `max(600, 2000 - (n-4)x100)`; manual 0.5-6s |
| Autospin | 1400ms between picks, 600ms after illegal, can be called off mid-spin |
| Undo | pops the last pick back onto the wheel |
| Restore | every pick back on the wheel |
| Clear | empties the draft; those names leave the table |
| Reset | names, draft and colours wiped |
| Copy | `WINNERS` / `LOSERS` blocks, `1st pick: Name` |
| Duplicates | refused case-insensitively against wheel, draft and undo stack |
| Persistence | `localStorage.spinpage`: names, draftOrder, undoStack, winnerSlots, nameColors, the six feature flags, displayDuration, autoDisplay, riggedValue; legacy `plotTwistsEnabled` |
| Sound | Web Audio synthesis: peg ticks, fanfare, stunts, race |

## 3. What the specialist reviews found

Six independent reviews ran against a frozen copy of the original (UX
research, visual design, mobile, architecture, accessibility, QA/performance).
Reports and evidence live in the session scratchpad. The findings that shaped
the plan, merged and de-duplicated:

**Layout and journey**
- A 12-player draft on a phone takes 36-65 scroll gestures if you check each
  result; SPIN is below the fold at 1280x620, in tablet portrait and landscape.
- Every swipe that starts on the wheel spins it (it fills ~92% of a phone's
  width), including pinches and swipes in the canvas's empty corners.
- The floating draft dock covers SPIN, UNDO and RESET on short phones, and the
  board's own COPY/RESTORE/CLEAR.
- The full-screen winner card hides the landing, the board and the stats, and
  says WINNER for picks the board labels LOSER.
- Nothing says what the wheel is doing (ready, spinning, which pick is next).
- The power-up rail is desktop-only and goes stale after its player is drafted.
- The splash, the PANIC race and the No One Is Safe wheel don't fit phones;
  the splash's CLOSE can end up off-screen with no other way out.

**Correctness**
- Refreshing during No One Is Safe deletes the winner from the table (the
  state is saved between the wheel and the draft).
- Toggling Panic mid-spin makes the drawn wheel disagree with the announced
  winner (geometry is rebuilt every frame from live settings).
- Undo after No One Is Safe or PANIC removes an innocent pick; one undo after
  the automatic final pick leaves a one-name dead end.
- Names stop drawing at 49+ slices; the race runs twice as fast on 120Hz
  screens and a clipped rail costs twice as much; Reset/Clear silently reset
  winner slots; COPY throws without clipboard access; the power-up rail injects
  names as HTML; one exception in a frame leaves the app locked.

**Visual**
- The wheel is blurry on every hi-DPI screen; 39 of 71 desktop text elements
  are under 12px; the winner's name fails contrast for 14 of 15 colours; the
  palette is six hues across fifteen slots; buttons render in Arial Black;
  every surface is the same generic gradient card.

**Accessibility**
- Nothing is ever announced to a screen reader; hidden overlays stay in the
  tab order and the accessibility tree; switches have no names or focus ring;
  focus drops to the body after SPIN; reduced motion still runs confetti, fire
  and particles; there is no mute; RESET/CLEAR/RESTORE can't be undone.

**Performance**
- Re-rasterising every rotated label each frame costs 21-80ms per frame at 4x
  CPU throttle (12-48 names); a cached face rotated with drawImage costs <1ms.
- Hidden overlays animate `filter` forever (~11% main thread at idle).

### Decisions where reviewers differed

| Question | Options raised | Decision |
|---|---|---|
| Destructive actions | tap-twice confirm (visual) vs undo toast (a11y, UX) | **Undo toast** for Restore, Clear and Reset: no friction, fully reversible |
| Undo semantics | keep "pop the last seat" vs reverse the last event | **Reverse the last event** — a pick, a stolen seat or a PANIC race — because "pop the last seat" removes an innocent player after either event. The final auto-pick undoes with the pick that caused it |
| Display/marquee type | system condensed stack vs webfont | **Self-hosted Oswald** (OFL, variable): wheel labels are fitted from font metrics, so they must be the same everywhere. Cinzel for display. Latin-ext subsets load only when a name needs them (Þ, ð, Ł…) |
| SEO footer | keep below the app vs move into About | **Into About**: the document never scrolls, so accidental swipes can't drag the dashboard away. The copy stays in the HTML (Google indexes collapsed content) and shows inline without JS |
| Pointer readout | plate under the pointer vs nowhere | **In the status line** while spinning: every name stays readable at any slice count without covering the pointer zone |
| First names on a phone | entry sheet docked to the keyboard vs inline | **Inline quick-add in the dock** until the first pick, so the wheel fills up live above it; afterwards the dock shows the latest picks |

## 4. Target experience

**One shell, no page scroll.** `100dvh` grid, safe-area padding,
`interactive-widget=resizes-content`. The wheel takes whatever height is left
(`container-type: size`, `min(100cqw, 100cqh)`).

- **Desktop (>= 900 wide, landscape-ish):** three columns — Players | stage |
  Draft board — under a top row of brand, scoreboard and icon actions. The
  stage is status line, wheel, console (Undo · SPIN · Auto).
- **Tablet portrait:** brand + actions, scoreboard, status, wheel, console,
  then Players and Board side by side with internal scrolling.
- **Phone portrait:** top bar, scoreboard (4 cells), status line, wheel, dock
  (quick-add during setup, latest picks after), console in the thumb zone, tab
  bar (Players · Board · Settings). Players and Board are bottom sheets.
  Height-driven disclosure drops the dock first on short screens.
- **Phone landscape:** wheel on the left at full height; everything else in a
  right column; sheets become right-hand drawers.

**Scoreboard:** Next pick (#8 of 12) · On the wheel (5 / 12) · Latest (name,
pick number) · Spins (with illegal spins). A progress track underneath with a
tick at the winner-slot cut.

**Status line:** the phase in words (Ready for pick #8 / Spinning / Hot Seat on
Ada: 25% → 50% this spin / Ada takes pick #8 / Illegal spin — no pick), the
actual odds per name when idle, the name under the pointer while spinning.

**Winner moment:** the wheel dims everything but the winning slice and rings
it in light; a brass nameplate rises over the lower third of the wheel (ivory
name, pick number, WINNER/LOSER); the board appends the row and the scoreboard
updates. Nothing blacks out. Timing is the existing `winnerDisplayMs()`.

**Wheel:** device-resolution canvas; face cached and rotated; fixed lighting
layer; brass rim; pegs drawn from the same peg ring the click sound uses; a
DOM flapper pointer that kicks on each peg; marquee bulbs on a static frame
that chase with the wheel's speed; labels sized from slice geometry; striped
hazard PANIC wedge; 16-colour jewel palette with tone-matched label colours.

## 5. Live statistics — definitions

One function, `draftStats()`, derives every number from game state, so no
counter can drift from the wheel:

| Stat | Definition |
|---|---|
| In the draft | `names.length + draftOrder.length` |
| On the wheel | `names.length` |
| Picked | `draftOrder.length` |
| Next pick | `picked + 1` while anyone is left; otherwise the draft is complete |
| Latest | the most recent name to win a seat that still holds one (tracked as `lastPick`, survives refresh); falls back to the last seat when PANIC undrafts them or undo removes them |
| Spins | every spin that resolved since the draft started: picks, illegal spins and PANIC landings. Undo does not un-spin |
| Void | illegal spins in that count |
| Events | PANIC races, stolen seats (No One Is Safe), undos |

Spins and events reset when the draft is restored, cleared or reset.

## 6. Acceptance criteria (defined before coding)

1. **Gameplay**: `tests/gameplay.test.js` passes unchanged.
2. **Desktop** (1366x768, 1440x900, 1920x1080, 1280x620, 1024x700): the app
   shell fits the viewport; wheel, SPIN, the stats strip and the draft board
   are fully inside it; no horizontal overflow.
3. **Phones** (320x568, 360x640, 375x667, 375x548, 390x844, 430x932, 768x1024,
   667x375, 844x390): the shell fits the viewport; wheel, SPIN, remaining,
   picked, latest and next pick are fully visible; no horizontal overflow; the
   wheel is at least 240px at 320x568 and 300px at 375x667.
4. **Counters** match engine state after spin, autospin, undo, restore, clear,
   reset, PANIC, No One Is Safe, illegal spins, adding/removing names and reload.
5. **Touch targets** >= 44x44 CSS px for every control on phones.
6. **Keyboard**: every action reachable; visible focus; dialogs trap focus,
   close on Esc and return focus.
7. **Announcements**: winner, power-up, illegal spin, PANIC result, stolen
   seat and draft complete reach a live region.
8. **Reduced motion**: no confetti, fire, shake, flash or particle bursts; the
   winner is still unmistakable.
9. **Sound**: a persisted mute that silences everything.
10. **Contrast**: text >= 4.5:1, large text and UI parts >= 3:1.
11. **No console errors** in any scenario; no animation loop left running at idle.

## 7. Results (measured, not assumed)

**Fit.** At 320x568, 360x640, 375x667, 375x548, 390x844, 430x932, 768x1024,
667x375, 844x390, 1024x700, 1280x620, 1366x768, 1440x900 and 1920x1080, with
an empty table, 12 players and 50 players: the page never scrolls, nothing
overflows sideways, and the wheel, SPIN, the scoreboard and the status line
are fully on screen and uncovered (`tests/layout.test.js`).

| Viewport | Page scroll before | after | Wheel (drawn canvas) after |
|---|---|---|---|
| 1366x768 | 2,289px | none | 442px |
| 1280x620 | 2,289px (SPIN below the fold) | none | 368px |
| 1920x1080 | 2,289px | none | 715px |
| 768x1024 | 3,411px + sideways overflow | none | 425px |
| 390x844 | 4,098px | none | 340px |
| 375x667 | 4,106px | none | 326px |
| 320x568 | 4,456px | none | 275px |
| 844x390 | 2,637px + sideways overflow | none | 345px |

**Performance** (headless Chromium, 4x CPU throttle; relative numbers):
a spin holds 60fps at 375x667@2x and 1366x768 with 12 and 50 names, as the
original did, while one fully rasterised frame costs 3.9-7.1ms against
11.8-13.3ms — at up to 1.85x the pixels, because the redesign draws at device
resolution. At idle the original ran 181 style recalculations per 3 seconds
(animations on hidden overlays); the redesign runs none.

**Tests.** 84 automated checks, all passing: the 28 gameplay checks written
against the original page pass unchanged on the redesign.

## 8. Final independent review

The six specialists reviewed the finished build against their own baseline
reports (reports in the session scratchpad). Verdicts: every one judged it
decisively better on desktop and phones; the page never scrolls in any of
the 168 states rendered; the draw is untouched (the RNG call order and every
probability match the original). What they found, and what was done:

**Fixed (each pinned by `tests/review.test.js`)**
- `let history` shadowed `window.history`, so the live analytics script threw
  on every load. Renamed `draftHistory`; the saved key is unchanged.
- On the winner card the wheel snapped back to equal slices (and the PANIC
  wedge returned), so after a power-up the pointer sat on a different name
  from the one announced. The landing now stays on the slices it was solved
  against until the pick is seated, the void stamp clears or the race opens.
- A save in the gap between the wheel and No One Is Safe (the sound button, a
  switch in a Settings dialog opened mid-spin) lost the winner on reload. The
  waiting winner is now `pendingPick`, saved back on the wheel; takeovers close
  any open dialog.
- The Restore/Delete/Reset toast's Undo restored a stale table, erasing picks
  and names added since. It is retired the moment the table changes, and the
  toast now sits above the console (or an open sheet), never over SPIN.
- Space after *clicking* Undo or Auto pressed it again (`:focus-visible` is on
  for any focused button once a key is down). Input modality is tracked
  instead; Space on a keyboard-reached scroller scrolls it; Shift+Space never
  spins.
- Autospin could not be stopped during the race or No One Is Safe: both
  takeovers have a Stop autospin button. Esc skips a takeover; Calm effects
  run the race straight to its result (same steps, same dice).
- Next and Left lagged the nameplate; they now move on the landing frame. The
  nameplate holds at least 2.4s on auto timing (it flashed for ~40ms at 18+
  names) without changing when the pick is seated or the next autospin starts;
  a display time set by hand is kept exactly.
- One exception in a takeover or the power-up tween left the app locked. Every
  event timer and frame is `guarded()`; recovery closes takeovers and returns
  a waiting winner to the wheel.
- The tote truncated at 1024x700 and in phone landscape: a 900-1180px desktop
  band gives the stage the room (wheel 268px → 470px at 1024x700), and the tote
  goes compact from its own width (container query).
- The PANIC verdict on a phone showed only the runners who were out; the race
  board in phone landscape overlapped the result. The verdict now shows the
  finish order with the survivors first; the race sizes itself from the
  stylesheet's layout instead of a second breakpoint.
- Smaller: every event was announced twice (a live hint, a status toast);
  switch names were whole paragraphs; the rigged state was a 7px dot and the
  odds line showed fair odds while rigged (now no odds, and the button says
  so); loser picks got jackpot lines; refused names were invisible on phones;
  sheets could not be swiped shut by finger; the players guide hid the list
  with the keyboard up; emoji names were cut mid-character; labels on a dense
  wheel all vanished at once; disabled labels and control edges were under
  contrast; stunt signs had no plate; long drafts scrolled in the splash; the
  reverb was still built on the first winner; `.claude/` and `TODO.md` were
  served by the live site.

**Left, deliberately**
- Power-ups and horses are still OS emoji: art work, not defects. (The No
  One Is Safe wheel was the other half of this item; see section 9.)
- On short Android phones the keyboard can tip the layout into landscape
  (`orientation` follows the shrunken viewport).
- `migrate()` drops keys a future version might add.
- Pop-off bounds use the layout viewport, so after a pinch-zoom the wheel can
  fly outside the visible area.

## 9. No One Is Safe on the stage

The old event was a full-screen takeover with its own flat red pie: labels
upside down, no rim, pegs or flapper, the app inert behind it, and the only
autospin control a Stop button that appeared once autospin was already on.

It now plays on the main wheel:

- The wheel turns over (a 0.5s flip; instant under Calm) to show the drafted
  seats, under a red light: the brass ring, rim and hub go blood-red, the
  bulbs run red, a "Plot twist / No one is safe" sign drops and a short
  brass sting plays (the fanfare's voices, a diminished chord; peak 0.95).
- The same renderer draws it, so the seats get the jewel slices, upright
  labels, pegs, the flapper and the name-under-the-pointer readout.
- The scoreboard, the board and the console stay up. The board marks every
  seat at risk and the pick that set it off as "Stealing", then the seat
  lost ("Out") and where the pick goes ("Takes #3").
- SPIN reads Skip while the seats spin (Esc too); Auto is live throughout.
- The landing lights the lost seat in red, with a red nameplate (the name
  struck through, "Hiro takes the seat"), then the wheel turns back over
  with the victim on it.

The draw is unchanged: the same four random calls in the same order (victim,
landing, laps, duration). Only the landing's spread within the slice moved
off the dividers, 12-88% like the main wheel instead of 1-99%.

Auto can now be switched on at any moment, not just when idle: mid-spin or
mid-event it arms, and the event's own ending hands on to it, as every event
already did. The race takeover's Stop button is now an on/off toggle.

Pinned by six new tests in `tests/review.test.js`: no takeover and the
console in reach at five viewports; Auto on mid-event carries the draft on;
Auto off mid-event stops it; pointer, nameplate and board agree on the seat
lost; Skip (button or Esc) never changes which seat is lost; Auto on
mid-spin takes over from the next pick. 107 tests, all passing; the
gameplay suite is unchanged.
