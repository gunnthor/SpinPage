# SpinPage — TODO / Backlog

A running list of ideas and follow-ups. Newest big ideas at the top.

## 🏠 Multiplayer rooms (host + join by code) — proposed

Let a user **host a room** by entering their own code; other people **join with that code**
from their own devices. This unlocks genuine *interactive* play instead of the current
single-screen, auto-simulated experience.

**What it would unlock**
- Participants join from their phones and add their own names to the wheel.
- Everyone watches the same wheel spin / mini-game in sync (shared spectating).
- Real input in mini-games — e.g. tap to make *your* marble jump in the PANIC race,
  vote who gets Cursed, press-your-luck on your own pick.
- Host controls the spin; participants send reactions/emotes.
- Shared, live draft board visible to all.

**The catch (architecture)**
- SpinPage is currently a **zero-dependency static site** ("just open `index.html`").
  Real-time rooms need a sync layer, which breaks that model.
- The project already deploys to Vercel (analytics installed), so a serverless/edge
  backend is realistic.
- Options to evaluate:
  - **PartyKit / Cloudflare Durable Objects** — room-per-code WebSocket, minimal glue. Good MVP fit.
  - **Firebase Realtime DB / Supabase Realtime** — hosted, no server to run; room = a doc/channel keyed by code.
  - **Ably / Pusher** — managed pub/sub by channel name (the room code).
  - **WebRTC peer-to-peer** — host is authority; still needs a tiny signaling step for the code handshake.

**Open questions to decide before building**
- Identity: probably just a display name + room code, no accounts.
- Authority model: host-authoritative RNG (host rolls, broadcasts result) vs. server-authoritative.
  Host-authoritative is simpler but trusts the host; server-authoritative is fairer.
- Lifecycle: reconnection, what happens when the host leaves, room expiry/cleanup.
- A mobile-first **join** screen (enter code → enter name → lobby).
- Keep a "solo / local" mode working with no backend (don't regress the static experience).

**Suggested first slice (MVP)**
1. Host screen generates/accepts a code; lobby shows who's joined.
2. Participants add their own names → populate the host's wheel live.
3. Host spins; result broadcast to all screens (still auto-resolved, no live input yet).
4. Layer interactive mini-game input on top once the sync plumbing is proven.

---

## Smaller open items
- [ ] `og-image.png` + favicon — social preview image and tab icon are referenced/expected but missing.
- [ ] `<title>` casing: says "Spinpage" but the H1/brand is "SpinPage".
- [ ] Name remove `×` button contrast is very low until hover (discoverability/a11y).

## Other game-mode ideas (not yet built)
- Survivor / Elimination mode (wheel picks who's OUT; last one standing wins).
- Shields / immunity tokens to counter NOIS and the PANIC race.
- More PANIC mini-games (musical chairs, red-light/green-light, dead sprint).
- Double-or-nothing press-your-luck after a win.
