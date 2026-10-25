/* ══════════════════════════════════════
   Core — the game's arithmetic
   ─────────────────────────────────────
   Pure functions and constants only: nothing here touches the DOM, the
   clock or the game state at load time, so it can be required straight
   into Node (tests/unit.test.js) as well as loaded first on the page.
   Everything below moved here verbatim from the scripts that use it.
══════════════════════════════════════ */
function ordinal(n) { const s=['th','st','nd','rd'],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

function weightedPick(w) {
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) return Math.floor(Math.random() * w.length);
    let r = Math.random() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return w.length - 1;
}

// A real wheel carries far more pins than slices — a three-name wheel
// clicking three times a lap sounds empty. Clicks come off a ring of
// ~30 evenly spaced pegs instead, a whole number of them per slice, so
// every `per`-th click can be accented as a name goes by.
const PEG_RING = 30;
function pegRing(segments) {
    const segs = Math.max(segments, 1);
    const per  = Math.max(1, Math.ceil(PEG_RING / segs));
    return { per, arc: (2 * Math.PI) / (segs * per) };
}
function isAccentPeg(idx, per) { return ((idx % per) + per) % per === 0; }

/* ══════════════════════════════════════
   Wind-back easing
   ─────────────────────────────────────
   The whole trick is that nothing gives it away. Up to the false stop
   this is an ordinary spin on the ordinary curve — same shape, same
   slowing, same creep to a halt — so it reads as a spin that has
   landed. Then it is shoved the other way and does a second, equally
   ordinary spin backwards, coasting to a halt on the real winner. One
   reversal, no yank-and-release.

   The first leg deliberately overshoots the landing by exactly the
   ground the backwards leg will give back, so the net rotation is
   untouched: the slice it finishes on is the one that was drawn before
   the wheel ever moved.

   t 0.00-0.44 : an ordinary spin, decelerating to a stop  (→ 1 + over)
   t 0.44-0.53 : sat on a slice, rocking a couple of degrees
   t 0.53-1.00 : shoved the other way, an ordinary spin back to the winner
══════════════════════════════════════ */
const WB = { stop: 0.44, hold: 0.53 };

// `over` is how far past the landing the first leg runs, as a fraction of
// the net rotation; `totalRot` only sizes the rock, which wants to be a
// couple of degrees whatever the trip works out to.
function makeWindBackEase(over, totalRot) {
    const at   = 1 + over;
    const rock = (2.5 * Math.PI/180) / Math.abs(totalRot);
    return function (t) {
        if (t < WB.stop) {                  // an ordinary spin, to an ordinary stop
            return easeOut(t / WB.stop) * at;
        }
        if (t < WB.hold) {                  // a wheel that has just stopped rocks
            const u = (t - WB.stop) / (WB.hold - WB.stop);
            return at + Math.sin(u * Math.PI * 3) * Math.exp(-u * 5) * rock;
        }
        return at - easeOut((t - WB.hold) / (1 - WB.hold)) * over;  // and away the other way
    };
}

/* ══════════════════════════════════════
   The Gremlin
   ─────────────────────────────────────
   A spin runs out normally. As it crawls through its last degree — with
   everyone already reading the slice — something climbs onto the rim and
   takes hold of it.

   Then it works the room. The creep is never smooth: a smoothly creeping
   wheel is just a slow wheel, and the eye adapts to it inside a second. It
   is discrete shoves with dead-still holds between them, slow enough that
   you can always see exactly where the wheel is, and every hold parks the
   pointer on somebody's name and leaves it sitting there.

   The real trick is the FAKE STOP. After a few shoves he gives the wheel
   one last little nudge and lets go — hands off the rim, looking innocently
   away — while it crawls to a halt. It is over. It has landed. Then he
   grabs it again. That whole round can repeat up to five times, so a
   gremlin runs anywhere from about fifteen seconds to a solid minute of
   nobody being allowed to know anything.

   The peg-tick engine pays for the sound design for free: it scales its
   click off wheel speed, so a creep this slow comes out as single lonely
   clicks, and the dying crawl of a fake stop ticks slower and slower.

   Like the wind-back, the route is the only thing that changes. The winner
   was drawn before the wheel ever moved and the whole creep is sized
   backwards from that landing — the gremlin is a passenger with a sense of
   timing, not a thumb on the scale.
══════════════════════════════════════ */
const GOBLIN = {
    // Likelier as the wheel empties out: the last few picks are the ones
    // where a stolen minute actually costs somebody something.
    chanceNear: 0.30,        // with 3 names left
    chanceFar:  0.05,        // with 3 + fadeOver names, and beyond
    fadeOver:   9,
    // Until he has been seen once on this device he is a little likelier,
    // so a new table gets to meet him; after that, the odds above.
    firstNear:  0.40,
    firstFar:   0.10,

    // Rounds, weighted: 1..6. Most gremlins are over inside fifteen seconds;
    // the six-round one runs well over a minute and is rare enough that people
    // tell each other about it afterwards.
    roundOdds:  [40, 22, 15, 11, 7, 5],
    perRound:   [2, 4],      // shoves before the first fake stop...
    shovesPer:  0.5,         // ...and this many more with every round after
    slicesBase: 1.25,        // creep arc in SLICES, so it scales with the wheel...
    slicesPer:  1.90,        // ...and grows with every extra round
    maxLaps:    3.6,         // hard ceiling, for wheels with two or three names

    /* Slow burn. Every round takes more of the wheel and sits on it longer
       than the one before, so the thing ratchets instead of repeating: the
       first round is a few nudges and a short stall, the sixth is long
       grinding sweeps across several names with five seconds of silence at
       the end of them. Because shove speed is capped either way, a bigger
       round doesn't move faster — it moves for longer. */
    burn:       0.38,        // extra wheel per round
    dwellBurn:  0.18,        // extra hold after each shove
    stallBurn:  0.24,        // extra dead stop at each fake stop
    teaseOdds:  0.70,        // chance of a wrong-way drag in any one round
    degPerSec:  110,         // a shove may not outrun the eye: this is the most
                             //   wheel, in degrees, one second of push may cover

    pushMs:   [300, 470],    // one shove
    dwellMs:  [450, 950],    // the dead-still hold after it
    fadeMs:   [1250, 1900],  // the long crawl where it looks like it is dying
    stallMs:  [1700, 3000],  // ...and the dead stop at the end of that crawl
    teaseMs:  [800, 1150],   // the hold after he drags it the wrong way
    releaseMs:[950, 1300],   // the shove he actually lets go on
    climbMs:  1150,          // still time between the opening spin and the first shove
    arriveMs: 300,           // he appears this long BEFORE the wheel would stop
    legAMs:   [4700, 5400],  // the ordinary-looking opening spin
};

const gobRnd = ([a, b]) => a + Math.random() * (b - a);

/* Own functions so a test can force the branch, or read the odds back,
   without pinning Math.random for a whole spin (cf. hurdleOdds). */
function goblinChance(namesLeft) {
    const t = Math.min(Math.max((namesLeft - 3) / GOBLIN.fadeOver, 0), 1);
    return GOBLIN.chanceNear + (GOBLIN.chanceFar - GOBLIN.chanceNear) * t;
}
function goblinFirstChance(namesLeft) {
    const t = Math.min(Math.max((namesLeft - 3) / GOBLIN.fadeOver, 0), 1);
    return GOBLIN.firstNear + (GOBLIN.firstFar - GOBLIN.firstNear) * t;
}
// seen: has he turned up on this device before? One draw either way.
function goblinFires(namesLeft, seen) {
    return Math.random() < (seen ? goblinChance(namesLeft) : goblinFirstChance(namesLeft));
}

function goblinRounds() {
    const odds = GOBLIN.roundOdds;
    let r = Math.random() * odds.reduce((a, b) => a + b, 0);
    for (let i = 0; i < odds.length; i++) if ((r -= odds[i]) < 0) return i + 1;
    return odds.length;
}

/* One creep, as relative moves: how big each is against the others, how long
   the push takes, and how long he sits on it afterwards. */
function makeGoblinCreep(rounds, creepArc, share) {
    const moves = [];
    const mustTease = Math.floor(Math.random() * rounds);     // at least one, guaranteed

    for (let r = 0; r < rounds; r++) {
        const burn  = 1 + GOBLIN.burn      * r;              // this round's share of the wheel
        const held  = 1 + GOBLIN.dwellBurn * r;              // ...and of the patience
        const n = Math.round(gobRnd(GOBLIN.perRound) + GOBLIN.shovesPer * r);

        // Where in the round he drags it backwards, if he does. Held off until
        // the second shove of the opening round, so the drag has some travel to
        // eat into; it can still reach back past the false stop, but only by a
        // fraction of a slice (0.2% of runs, 0.17 of a slice at worst), which
        // just reads as him being greedy.
        const teasing = r === mustTease || Math.random() < GOBLIN.teaseOdds;
        const first   = r === 0 ? 2 : 1;
        const teaseAt = teasing && n >= first ? first + Math.floor(Math.random() * (n - first + 1)) : -1;

        for (let i = 0; i < n; i++) {
            moves.push({
                size:  (0.75 + Math.random() * 0.85) * burn,
                push:  gobRnd(GOBLIN.pushMs),
                dwell: gobRnd(GOBLIN.dwellMs) * held,
                // the first shove of any round after the first is him snatching it back
                kind:  (i === 0 && r > 0) ? 'gotcha' : 'shove',
            });
            if (i + 1 === teaseAt) moves.push({      // sized below
                size: 0, push: gobRnd([220, 330]),
                dwell: gobRnd(GOBLIN.teaseMs) * held, kind: 'tease',
            });
        }
        if (r < rounds - 1) moves.push({                     // the fake stop
            size:  (0.45 + Math.random() * 0.30) * burn,
            push:  gobRnd(GOBLIN.fadeMs),
            dwell: gobRnd(GOBLIN.stallMs) * (1 + GOBLIN.stallBurn * r),
            kind:  'fade',
        });
    }
    moves.push({                                // ...and the one that is real; sized below
        size: 0, push: gobRnd(GOBLIN.releaseMs), dwell: 0, kind: 'release',
    });

    /* The moves that carry the joke get exact shares of the creep rather than
       being left to the dice, because a share of "whatever the other moves
       happened to add up to" is unreadable at one extreme and silly at the
       other:

         the wrong-way drag  — must be big enough to see it go backwards
         the final release   — must arrive somewhere NEW, or the whole
                               build-up ends on the name it was already on

       Everything else sums to A, so with k drags of share t and a release of
       share r, span = A - k·t·span + r·span, which solves in one line. Every
       drag gets the same share, so the fifth one is as readable as the first
       however long the creep has become. */
    const A = moves.reduce((a, m) =>
        a + (m.kind === 'tease' || m.kind === 'release' ? 0 : m.size), 0);
    const drags = moves.reduce((a, m) => a + (m.kind === 'tease' ? 1 : 0), 0);
    const span = A / (1 + drags * share.tease - share.release);
    moves.forEach(m => {
        if (m.kind === 'tease')   m.size = -share.tease * span;
        if (m.kind === 'release') m.size =  share.release * span;
    });

    // Normalised against the final position, so the last keyframe is exactly 1.
    let acc = 0;
    const raw   = moves.map(m => (acc += m.size));
    const total = raw[raw.length - 1];

    // Then stretch any push that would outrun the eye. Without this a big
    // step on a three-name wheel and a small one on a twenty-name wheel both
    // take 400ms, and the three-name version flicks past too fast to read.
    const arcDeg = creepArc * 180 / Math.PI;
    const keys = [{ r: 0, ms: 0, kind: 'grip' }];
    moves.forEach((m, i) => {
        const step = Math.abs(raw[i] - (i ? raw[i - 1] : 0)) / total;
        const ms   = Math.max(m.push, step * arcDeg / GOBLIN.degPerSec * 1000);
        keys.push({ r: raw[i] / total, ms, kind: m.kind });
        if (m.dwell) keys.push({ r: raw[i] / total, ms: m.dwell, kind: 'hold' });
    });
    return keys;
}

/* A shove: quick off the mark, then dragging to a stop against the wheel's
   own weight. Pure ease-out would jump from standstill to full speed in one
   frame, so a little smoothstep is blended in at the front. */
const gobSmooth  = u => u * u * (3 - 2 * u);
const gobShove   = u => 0.35 * gobSmooth(u) + 0.65 * (1 - Math.pow(1 - u, 2.4));
const gobSnatch  = u => 0.20 * gobSmooth(u) + 0.80 * (1 - Math.pow(1 - u, 1.9));
const gobRelease = u => 1 - Math.pow(1 - u, 3.2);
// The dying crawl. The long heavy tail is the whole point: the ticks stretch
// further and further apart and the wheel looks like it is giving up.
const gobFade    = u => 0.45 * gobSmooth(u) + 0.55 * (1 - Math.pow(1 - u, 4.2));

const GOB_EASE = { shove: gobShove, tease: gobShove, gotcha: gobSnatch,
                   fade:  gobFade,  release: gobRelease };

/* Size the creep so it ends exactly on the winner, then hand back an ease
   over the whole spin plus the beats the frame loop fires on. */
function buildGoblinRun(totalRot, creepArc, rounds, sliceArc) {
    const at       = 1 - creepArc / totalRot;       // rotation fraction at the false stop
    // Release: 1.05 slices, not 0.95, because a move longer than one slice
    // crosses a divider wherever in the slice it starts from. Drag: half a
    // slice is the least you can unmistakably see go the wrong way.
    const share = { release: Math.min(0.45, 1.05 * sliceArc / creepArc),
                    tease:   Math.min(0.16, 0.50 * sliceArc / creepArc) };
    const keys  = makeGoblinCreep(rounds, creepArc, share);
    const legA     = gobRnd(GOBLIN.legAMs);
    const creepMs  = keys.reduce((a, k) => a + k.ms, 0);
    const duration = legA + GOBLIN.climbMs + creepMs;

    const tA = legA / duration;                       // opening spin ends
    const tB = (legA + GOBLIN.climbMs) / duration;    // his hands are on it

    let ms = 0;
    const kf = keys.map(k => {
        ms += k.ms;
        return { t: tB + ms / duration, r: at + k.r * (1 - at), kind: k.kind };
    });

    const ease = t => {
        if (t <= tA) return easeOut(t / tA) * at;     // an ordinary spin, to an ordinary stop
        if (t <= tB) return at;                       // sat still while he climbs on
        for (let i = 1; i < kf.length; i++) {
            if (t <= kf[i].t || i === kf.length - 1) {
                const p = kf[i - 1], q = kf[i];
                if (q.kind === 'hold') return q.r;     // frozen, everyone looking at a name
                const u = Math.min(Math.max((t - p.t) / (q.t - p.t), 0), 1);
                return p.r + (q.r - p.r) * GOB_EASE[q.kind](u);
            }
        }
        return 1;
    };

    // Beats: he arrives just before the wheel dies, then one per move he makes.
    const beats = [{ t: Math.max(0, (legA - GOBLIN.arriveMs) / duration), kind: 'arrive' }];
    for (let i = 1; i < kf.length; i++) {
        if (kf[i].kind !== 'hold') beats.push({ t: kf[i - 1].t, kind: kf[i].kind });
    }
    return { duration, ease, beats, rounds };
}

/* Which slice a wheel offset falls in, and how far across it. */
function offsetSlice(off, segW, totalW) {
    const TAU = 2 * Math.PI;
    let acc = 0;
    for (let i = 0; i < segW.length; i++) {
        const a0 = (acc / totalW) * TAU; acc += segW[i];
        const a1 = (acc / totalW) * TAU;
        if (off < a1 || i === segW.length - 1) return { i, frac: (off - a0) / (a1 - a0), arc: a1 - a0 };
    }
}

/* How much arc to leave for the gremlin. Sized in SLICES, not radians, so a
   three-name wheel doesn't get hauled round six times and a twenty-name one
   still changes hands every round. Then it is nudged so the false stop
   doesn't land straddling a divider — a wheel that "stops" on a line reads
   as a bug, not a result. */
function goblinCreepArc(segW, totalW, winnerOffset, rounds) {
    const TAU    = 2 * Math.PI;
    const slices = GOBLIN.slicesBase + GOBLIN.slicesPer * rounds;
    let arc = Math.min(slices * TAU / segW.length, TAU * GOBLIN.maxLaps);
    const at = offsetSlice(((winnerOffset + arc) % TAU + TAU) % TAU, segW, totalW);
    if      (at.frac < 0.20) arc += (0.34 - at.frac) * at.arc;
    else if (at.frac > 0.80) arc -= (at.frac - 0.66) * at.arc;
    return arc;
}

/* ══════════════════════════════════════
   Spin easing
   ─────────────────────────────────────
   1 - (a*(1-t)^9 + (1-a)*(1-t)^1.7): a two-term decay whose opening slope
   is 9a + 1.7(1-a). Blending the two exponents lets a spin start at any
   speed between a lazy roll (1.7x) and a violent rip (9x) and still glide
   to the same gentle, tick-by-tick landing.
══════════════════════════════════════ */
const STOCK_SLOPE     = 5.715;   // opening slope of the stock button spin (a = 0.55)
const MIN_FLICK_SPINS = 3;       // even a limp flick owes you a few full laps

function easeOut(t) { return 1 - (0.55*Math.pow(1-t,9) + 0.45*Math.pow(1-t,1.7)); }

function decayEase(slope0) {
    const a = Math.min(Math.max((slope0 - 1.7) / 7.3, 0), 1);
    return t => 1 - (a*Math.pow(1-t,9) + (1-a)*Math.pow(1-t,1.7));
}

const SPRINT_BASE = 0.00048;                  // tuned: majority-safe quota fills in ~19-30s

/* -- The hurdle --
   One jump a quarter of the way in, with 75% of the track still to run.
   Every horse carries its own posted chance of clearing it, and the
   faster it is travelling relative to the rest of the field at the
   moment it takes off, the more of that chance it gives back: coming in
   hot is how you catch a rail. Clipping it costs momentum, not the race
   — a stumbler can still recover and finish safe. */
const HURDLE_FIRST  = 0.22;   // first rail, with most of the track still to run
const HURDLE_LAST   = 0.74;   // last one, leaving a run-in to the line
const HURDLE_LEAD   = 0.022;  // half-width of the leap, in track fraction
const HURDLE_RISK   = 0.30;   // how hard being quicker than the field bites
const HURDLE_RISKMAX= 0.25;   // ...capped, so a flier is never doomed
const HURDLE_FLOOR  = 0.25;   // ...and never worse than one-in-four
const STUMBLE_MS    = 1100;   // how long a clipped rail keeps you slow
// Two to four rails, evenly spread with a little jitter so no two races
// are laid out the same.
function makeHurdles() {
    const n = 2 + Math.floor(Math.random() * 3);
    const step = (HURDLE_LAST - HURDLE_FIRST) / (n - 1);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(HURDLE_FIRST + i * step + (Math.random() - 0.5) * 0.035);
    }
    return out;
}

// Posted chance, minus what the horse gives back for carrying more speed
// into the jump than the field around it.
function hurdleOdds(jump, speed, fieldSpeed) {
    const ratio   = speed / (fieldSpeed || SPRINT_BASE);     // 1 = field average
    const penalty = Math.min(Math.max((ratio - 1) * HURDLE_RISK, 0), HURDLE_RISKMAX);
    return Math.max(jump - penalty, HURDLE_FLOOR);
}

/* ══════════════════════════════════════
   Slot machines (PANIC's other game)
   ─────────────────────────────────────
   Every reel that spins stops on a 7 one time in SLOT_SEVEN — the same
   for every machine on every pull — and a 7 stays held once it lands.
   So the race to 7-7-7 is pure luck with a score you can watch: how many
   7s each machine is holding. Nothing is rigged.
══════════════════════════════════════ */
const SLOT_SYMBOLS   = ['7', '🍒', '🍋', '🔔', '💎', '🍇', '⭐', 'BAR'];   // index 0 is the 7
const SLOT_SEVEN     = 0.26;   // a spinning reel's chance of stopping on a 7
const SLOT_KICK_MS   = 150;    // the lever comes down before the reels go
const SLOT_SPIN_MS   = 950;    // the first reel's run, from the lever
const SLOT_REEL_GAP  = 300;    // each reel after it runs this much longer
const SLOT_JITTER_MS = 380;    // machines stop out of step, so ties break on the reels
const SLOT_TEASE_MS  = 1100;   // two 7s showing: the last reel takes its time
const SLOT_SETTLE_MS = 200;    // the bounce as a reel stops
const SLOT_REST_MS   = 560;    // the beat between pulls
const SLOT_MAX_PULLS = 40;     // failsafe: a table needs ~6-9

// One pull of one machine. held[i] is true for a reel already showing a 7.
// Per reel: null if held, else { sym, stop, tease } — the symbol it lands
// on, when it stops (ms after the lever), and whether it is the last reel
// with a 7 on both the others, which makes it take its time.
function slotPull(held, rnd) {
    const jitter = rnd() * SLOT_JITTER_MS;
    const out = held.map((h, i) => h ? null : {
        sym:  rnd() < SLOT_SEVEN ? 0 : 1 + Math.floor(rnd() * (SLOT_SYMBOLS.length - 1)),
        stop: SLOT_SPIN_MS + i * SLOT_REEL_GAP + jitter,
        tease: false,
    });
    const last = out.reduce((a, r, i) => r ? i : a, -1);
    if (last >= 0 && out.every((r, i) => i === last || !r || r.sym === 0)) {
        out[last].tease = true;
        out[last].stop += SLOT_TEASE_MS;
    }
    return out;
}

// Columns and rows that give n cells of the given shape (height over
// width) the most room in a w x h stage.
function slotGrid(n, w, h, aspect) {
    let best = { cols: 1, rows: Math.max(1, n), cellW: 0 };
    for (let cols = 1; cols <= Math.max(1, n); cols++) {
        const rows  = Math.ceil(n / cols);
        const cellW = Math.min(w / cols, h / rows / aspect);
        if (cellW > best.cellW + 0.01) best = { cols, rows, cellW };
    }
    return best;
}
