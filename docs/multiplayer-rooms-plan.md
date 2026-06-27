# Multiplayer Rooms — Plan (DRAFT, not yet implemented)

> Status: **planning only.** No code written yet. This doc lives on the
> `feature/multiplayer-rooms` branch so the eventual build + testing happens here,
> isolated from `master`.

## Context & goal

SpinPage is currently a **zero-dependency static single-file app** (`index.html`,
state in `localStorage`, deployed to Vercel / `ruglad.com`). The goal is to let a
user **host a private room with a 4-character code** that others join from their own
devices, enabling **shared/interactive games** (everyone watches the same spin, players
add their own names, and eventually live input during mini-games).

**The honest tradeoff:** real-time rooms require a backend (a service or small server).
This is the one feature that changes what SpinPage *is* — from a file you can open
offline into a client + backend app. Worth doing deliberately. We keep a **local/solo
mode** that works with no backend so the offline experience never regresses.

## Core concept

- **"Private" = unlisted.** Anyone with the 4-char code can join; no accounts. (True
  privacy would need auth — out of scope. Optional later: host "lock room after start.")
- **Identity** = a display name + the room code. No sign-up.
- **Roles:** one **host** (creator) + **participants**. Presence list shows who's in.
- **4-char code:** drawn from an unambiguous alphabet (no `0/O`, `1/I/L`) → ~500k–1M
  combos. On create, verify the code isn't already taken; joining an unknown code →
  "room not found."

## Recommended approach (MVP)

- **Managed realtime service** (Firebase Realtime Database **or** Supabase Realtime) —
  nothing to operate, free tier, presence built in. Room = a channel/path keyed by the code.
- **Host-authoritative RNG:** the host's browser decides outcomes and broadcasts them.
  Fine for a party game (no stakes). Graduate to server-authoritative only if we ever
  want cheat-proof games.
- **Sync outcomes, not frames** (key insight): the host computes the result (winner, or
  the PANIC safe/doomed set) and broadcasts it; **every client runs its own local
  animation that lands on that same result.** Far simpler + more robust than lock-step
  animation, and it reuses our existing spin/race code almost unchanged.

### Alternatives considered
- **Room server — PartyKit / Cloudflare Durable Objects:** a tiny server process per room
  runs the game + RNG (fair, cheat-proof, survives host leaving). Best long-term home for
  "games on the server," but more setup + a separate deploy. Pick this if/when fairness matters.
- **Peer-to-peer (WebRTC):** minimal hosting, but fragile — room dies if the host closes
  the tab, plus NAT/TURN complexity. Ruled out for the MVP.
- **Raw Vercel functions:** stateless/short-lived — wrong fit for persistent live rooms. Ruled out.

## Room state shape (illustrative)

```
rooms/{CODE}:
  hostId, createdAt, status            # "lobby" | "spinning" | "panic" | ...
  players: { id: { name, color, joinedAt, lastSeen } }   # presence via onDisconnect/heartbeat
  draftOrder: [ { name, color }, ... ]
  event: { type, result, startedAt }   # e.g. {type:"spin", result:{winnerName,color}}
  settings: { winnerSlots, panicEnabled, ... }
```

Local UI **mirrors** room state; it stops being the source of truth while in a room.

## Integration with the current app (`index.html`)

- Add a small **realtime client** (CDN `<script>`, e.g. Firebase web SDK) + a **rooms
  module** in the existing script. Keep everything else single-file if practical.
- A **mode flag**: `solo` (today's behavior, localStorage) vs `room` (mirrors room state).
- **Host SPIN flow:** compute the winner with the existing `startSpin`/weighted-pick logic
  → write `event` + updated `draftOrder` to the room → all clients (incl. host) react by
  animating to the broadcast result (reuse `onSpinEnd`, `colorOf`, the PANIC horse race
  resolve path).
- **Non-host:** SPIN hidden/disabled under host-driven control; enabled under free-for-all
  (with a server/room lock while a spin is in progress).
- Reuse existing pieces: stable `colorOf(name)`, `draftOrder` rendering, `onSpinEnd`,
  `startMarbleRace` (outcome-driven), winner overlay.

## MVP milestones (ladder)

1. **Lobby:** create room (get code) / join by code; live presence list; pick a host.
2. **Shared player list:** names sync to all; (host-managed or anyone-adds — TBD).
3. **Synced spin:** host presses SPIN → outcome broadcast → every screen animates +
   shows the same winner; draft order syncs.
4. **Synced PANIC + games:** broadcast the safe/doomed outcome; each client animates locally.
5. **(Phase 2) Live input:** real interaction in mini-games (tap to push your horse,
   vote who gets Cursed, etc.).

## Open decisions (confirm before building)

- **Backend:** managed realtime (Firebase/Supabase) vs room server (PartyKit/Cloudflare DO).
- **MVP scope:** synced spin viewing → + players add own names → + live input.
- **Control model:** host-driven vs free-for-all spinning.
- **Vendor:** Firebase RTDB vs Supabase (both fine; Firebase RTDB is the simplest for
  broadcast + presence).
- **Config/secrets:** web SDK keys are public by design — must lock down with **security
  rules / RLS** so randoms can't read/wipe other rooms.

## Risks & considerations

- Host disconnect / migration (close room, or promote a new host).
- Reconnection + race conditions on shared writes.
- Abuse: name-flooding / spam → basic rate limits, host kick, max players per room.
- Room lifecycle: expire/clean up idle rooms (TTL).
- Don't regress **solo/offline mode** (must work with no backend).
- Mobile-first **join** screen (enter code → name → lobby).
- Cost: stay within free tier for hobby use.

## Testing plan

- All work on `feature/multiplayer-rooms`.
- Push the branch → **Vercel preview deployment** gives a real URL for cross-device tests
  (phone + desktop joining the same code).
- Manual checks: create/join, presence updates, spin outcome identical on all screens,
  draft order in sync, host-leaves behavior, reconnect.

## Rough effort

- Backend setup + lobby/join + presence: the foundation (largest chunk).
- Synced spin + draft (milestones 1–3): the satisfying MVP.
- Live mini-game input (milestone 5): a separate, larger phase.
