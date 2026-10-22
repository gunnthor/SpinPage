/* ══════════════════════════════════════
   Draw wheel
══════════════════════════════════════ */
function drawWheel() {
    ctx.clearRect(0,0,SIZE,SIZE);
    if (names.length===0) {
        const bg=ctx.createRadialGradient(cx,cy,0,cx,cy,R);
        bg.addColorStop(0,'#161022'); bg.addColorStop(1,'#08080e');
        ctx.beginPath(); ctx.arc(cx,cy,R,0,2*Math.PI); ctx.fillStyle=bg; ctx.fill();
        ctx.strokeStyle='rgba(212,175,55,0.42)'; ctx.lineWidth=3; ctx.stroke();
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle='#d4af37';
        ctx.font='700 18px Palatino Linotype, Palatino, Georgia, serif';
        ctx.fillText(stackedLayout() ? 'Add names below' : 'Add names on the left',cx,cy-10);
        ctx.fillStyle='#9b8d68';
        ctx.font='italic 13px Palatino Linotype, Palatino, Georgia, serif';
        ctx.fillText('to get started.',cx,cy+16);
        return;
    }
    if (names.length===1) {
        const bg=ctx.createRadialGradient(cx,cy,0,cx,cy,R);
        bg.addColorStop(0,'#161022'); bg.addColorStop(1,'#08080e');
        ctx.beginPath(); ctx.arc(cx,cy,R,0,2*Math.PI); ctx.fillStyle=bg; ctx.fill();
        ctx.strokeStyle='rgba(212,175,55,0.42)'; ctx.lineWidth=3; ctx.stroke();
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle='#d4af37';
        ctx.font='700 18px Palatino Linotype, Palatino, Georgia, serif';
        ctx.fillText('Add 1 more name',cx,cy-10);
        ctx.fillStyle='#9b8d68';
        ctx.font='italic 13px Palatino Linotype, Palatino, Georgia, serif';
        ctx.fillText('A duel needs two names to spin',cx,cy+16);
        return;
    }
    const seg     = buildSegments(getWeights());
    const weights = seg.weights;
    const count   = seg.labels.length;
    const totalW  = weights.reduce((a,b)=>a+b,0) || 1;
    const TAU     = 2*Math.PI;
    const base    = rotation - Math.PI/2;
    let   acc     = 0;
    const starts  = [];                       // local start offset per slice, for divider lines
    for (let i=0;i<count;i++) {
        const isPanic = i === seg.panicIndex;
        const a0 = (acc/totalW)*TAU;
        acc += weights[i];
        const a1 = (acc/totalW)*TAU;
        starts.push(a0);
        const sliceAng = a1 - a0;
        const start=base+a0, end=base+a1, mid=(start+end)/2;
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,R,start,end); ctx.closePath();
        ctx.fillStyle=seg.colors[i]; ctx.fill();
        if (!isSpinning) {
            const shine=ctx.createRadialGradient(cx,cy,0,cx,cy,R);
            shine.addColorStop(0,'rgba(255,255,255,0.10)'); shine.addColorStop(0.55,'rgba(255,255,255,0.03)'); shine.addColorStop(1,'rgba(0,0,0,0.25)');
            ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,R,start,end); ctx.closePath();
            ctx.fillStyle=shine; ctx.fill();
        }
        if (sliceAng > 0.13) {                 // skip labels on ultra-thin (cursed) slices
            ctx.save(); ctx.translate(cx,cy); ctx.rotate(mid);
            const fs=isPanic?15:count>14?10:count>9?12:count>5?14:16;
            ctx.font=`${isPanic?900:700} ${fs}px Segoe UI,system-ui,sans-serif`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillStyle = isPanic ? PANIC.textColor : 'rgba(255,255,255,0.95)';
            ctx.shadowColor= isPanic ? 'rgba(255,92,138,0.7)' : 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = isPanic ? 8 : 2;
            ctx.shadowOffsetY=1;
            let label=seg.labels[i];
            const maxW=R*0.52;
            while(ctx.measureText(label).width>maxW&&label.length>2) label=label.slice(0,-1);
            if(label!==seg.labels[i]) label+='…';
            ctx.fillText(isPanic ? '⚠ '+label : label,R*0.62,0); ctx.restore();
        }
    }
    for (let i=0;i<count;i++) {
        const angle=base+starts[i];
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(angle)*R,cy+Math.sin(angle)*R);
        ctx.strokeStyle='rgba(212,175,55,0.4)'; ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx,cy,R,0,2*Math.PI); ctx.strokeStyle='rgba(212,175,55,0.55)'; ctx.lineWidth=4; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,R-9,0,2*Math.PI); ctx.strokeStyle='rgba(212,175,55,0.12)'; ctx.lineWidth=1; ctx.stroke();
    const hub=ctx.createRadialGradient(cx,cy,0,cx,cy,22);
    hub.addColorStop(0,'#f5e070'); hub.addColorStop(0.45,'#d4af37'); hub.addColorStop(1,'#6b5010');
    ctx.beginPath(); ctx.arc(cx,cy,22,0,2*Math.PI); ctx.fillStyle=hub; ctx.fill();
    ctx.strokeStyle='rgba(255,230,100,0.3)'; ctx.lineWidth=1.5; ctx.stroke();
}

function drawPointer() {
    const tipX=cx, tipY=22, halfW=15;
    ctx.shadowColor='rgba(212,175,55,0.8)'; ctx.shadowBlur=18;
    const pg=ctx.createLinearGradient(tipX-halfW,0,tipX+halfW,0);
    pg.addColorStop(0,'#6b5010'); pg.addColorStop(0.5,'#f5e070'); pg.addColorStop(1,'#6b5010');
    ctx.beginPath(); ctx.moveTo(tipX-halfW,3); ctx.lineTo(tipX+halfW,3); ctx.lineTo(tipX,tipY);
    ctx.closePath(); ctx.fillStyle=pg; ctx.fill(); ctx.shadowBlur=0;
    ctx.beginPath(); ctx.arc(tipX,tipY,4.5,0,2*Math.PI);
    ctx.fillStyle='#fff'; ctx.shadowColor='rgba(255,255,255,0.9)'; ctx.shadowBlur=6; ctx.fill(); ctx.shadowBlur=0;
}

// While the wheel is popped off, its pointer stays behind on the frame
// (a CSS ghost pinned to the empty socket) instead of flying with it.
function redraw() { drawWheel(); if (!popOff.active) drawPointer(); }

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
function goblinFires(namesLeft) { return Math.random() < goblinChance(namesLeft); }

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
   Spin
══════════════════════════════════════ */
spinBtn.addEventListener('click', spin);

function spin() { beginSpin(null); }

// launch === null  → button/spacebar spin (the wheel builds its own speed)
// launch === {...} → hand flick: { vel, dir, power, popOff } from the drag
function beginSpin(launch) {
    if (isSpinning||isBusy||names.length<2) return;
    // Hands on the wheel win: an autospin tick that lands mid-drag waits
    // its turn instead of fighting the player for the rotation.
    if (drag.active && !launch) { if (autoSpin) queueAutoSpin(900); return; }
    ensureAudio();

    isSpinning = true;
    updateButtons();

    // Maybe drop a power-up: a slice swells/shrinks before the spin, which
    // both looks dramatic AND shifts the real odds (winner is weighted).
    const pu = rollPowerUp();
    setPowerUpRail(pu);
    if (pu) {
        playPowerUpSound();
        showPowerUpPopup(pu);
        if (launch) {
            // A flick is already in motion — no time for the grow/shrink
            // tween, so the slices warp instantly while the wheel flies.
            sliceWeights = pu.weights.slice();
            redraw();
            startSpin(pu.weights, launch);
        } else {
            animateWeights(pu.weights, 650, () => {
                setTimeout(() => startSpin(pu.weights), 320);
            });
        }
    } else {
        sliceWeights = null;
        redraw();
        startSpin(names.map(() => 1), launch);
    }
}

/* ── Power-ups ── */
function rollPowerUp() {
    if (!powerUpsEnabled || names.length < 3 || Math.random() >= 0.35) return null;
    const pick = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
    if (pick.type === 'wildcard') {
        const weights = names.map(() => 0.35 + Math.random() * 2.65);
        return { ...pick, weights, name: 'Everyone' };
    }
    const idx = Math.floor(Math.random() * names.length);
    const weights = names.map(() => 1);
    weights[idx] = pick.factor;
    return { ...pick, idx, name: names[idx], weights };
}

// Tween slice sizes from their current values to the power-up target,
// redrawing each frame so the pies visibly grow/shrink before the spin.
function animateWeights(targetW, duration, done) {
    const startW = getWeights().slice();
    const t0 = performance.now();
    (function step(now) {
        const t = Math.min((now - t0) / duration, 1);
        const e = 1 - Math.pow(1 - t, 3);
        sliceWeights = startW.map((s, i) => s + (targetW[i] - s) * e);
        redraw();
        if (t < 1) requestAnimationFrame(step);
        else { sliceWeights = targetW.slice(); redraw(); done && done(); }
    })(performance.now());
}

/* ------------------------------------------------------------------
   Power-up rail
   ------------------------------------------------------------------
   The drop popup is gone in a second and the slice it warped is a blur
   once the wheel is moving, so the rail keeps the active power-up — and
   what it did to the real odds — on screen beside the wheel until the
   next spin. Desktop only; a phone has no side to put it on.
------------------------------------------------------------------ */

// Actual chance for one player, straight off the same segment weights the
// draw uses — so it accounts for the PANIC wedge eating into the wheel.
function chanceOf(weights, idx) {
    const seg   = buildSegments(weights);
    const total = seg.weights.reduce((a, b) => a + b, 0) || 1;
    return seg.weights[idx] / total;
}
const pct = v => Math.round(v * 100) + '%';

function setPowerUpRail(pu) {
    railTitle.textContent = pu ? 'Active this spin' : 'Power-ups';
    if (!pu) { powerUpRail.classList.remove('live'); syncPowerUpRail(); return; }

    powerUpRail.style.setProperty('--pu-color', pu.color);
    railEmoji.textContent = pu.emoji;
    railLabel.textContent = pu.label;
    railName.textContent  = pu.name;

    if (pu.type === 'wildcard') {
        const flat = names.map(() => 1);
        const best = pu.weights.indexOf(Math.max(...pu.weights));
        railOdds.innerHTML = 'Every slice re-rolled. Best odds: <b>' +
            names[best] + ' ' + pct(chanceOf(pu.weights, best)) + '</b> (was ' +
            pct(chanceOf(flat, best)) + ')';
    } else {
        const flat = names.map(() => 1);
        railOdds.innerHTML = 'Odds <b>' + pct(chanceOf(flat, pu.idx)) + ' → ' +
            pct(chanceOf(pu.weights, pu.idx)) + '</b> to win this spin';
    }
    powerUpRail.classList.add('live');
    syncPowerUpRail();
}

function syncPowerUpRail() {
    // Hidden outright when the feature is off — one steady state, so
    // nothing below it ever jumps around mid-draft.
    powerUpRail.classList.toggle('on', powerUpsEnabled);
}

function showPowerUpPopup(pu) {
    powerUpPopup.querySelector('.pu-emoji').textContent = pu.emoji;
    powerUpPopup.querySelector('.pu-label').textContent = pu.label;
    powerUpPopup.querySelector('.pu-name').textContent  = pu.name;
    powerUpPopup.style.setProperty('--pu-color', pu.color);
    powerUpPopup.classList.remove('in', 'out');
    void powerUpPopup.offsetWidth;
    powerUpPopup.classList.add('in');
    setTimeout(() => {
        powerUpPopup.classList.remove('in');
        powerUpPopup.classList.add('out');
        setTimeout(() => powerUpPopup.classList.remove('out'), 320);
    }, 1150);
}


function startSpin(spinWeights, launch) {
    const TAU    = 2 * Math.PI;
    const seg    = buildSegments(spinWeights);   // players (+ PANIC wedge when active)
    const segW   = seg.weights;
    const totalW = segW.reduce((a, b) => a + b, 0) || 1;

    const riggedKey = riggedValue.trim().toLowerCase();
    const riggedIdx = (riggedEnabled && riggedKey)
        ? names.findIndex(n => n.toLowerCase().startsWith(riggedKey))
        : -1;
    // Rigged always forces a player; otherwise any segment can win — including PANIC.
    const winnerIdx = riggedIdx >= 0 ? riggedIdx : weightedPick(segW);

    // Land somewhere inside the winning slice (kept clear of the edges so a
    // thin cursed slice still lands cleanly under the pointer).
    let before = 0;
    for (let i = 0; i < winnerIdx; i++) before += segW[i];
    const sliceArc     = (segW[winnerIdx] / totalW) * TAU;
    const landingPos   = 0.12 + Math.random() * 0.76;
    const winnerOffset = (before / totalW) * TAU + landingPos * sliceArc;
    const targetNorm   = ((TAU - winnerOffset % TAU) + TAU) % TAU;
    const currentNorm  = ((rotation % TAU) + TAU) % TAU;

    const isIllegal = Math.random() < 0.05;
    const manual    = launch || null;
    // The reverse-twist choreography assumes a forward, machine-paced spin,
    // so it sits out backwards flicks, hard flicks and pop-offs.
    const stuntOk = !isIllegal &&
                    !(manual && (manual.popOff || manual.power >= 0.6 || manual.dir < 0));
    const windBack = stuntOk && windBackEnabled && Math.random() < 0.20;
    // The gremlin wants that same kind of spin, and enough names either side
    // of the landing that the creep genuinely changes hands a few times.
    const goblin   = stuntOk && !windBack && goblinEnabled &&
                     !prefersReducedMotion() && seg.labels.length >= 3 &&
                     goblinFires(names.length);

    const dir = (manual && !windBack && !goblin) ? manual.dir : 1;

    // Shortest trip to the landing angle, taken the way the wheel is turning.
    let delta = targetNorm - currentNorm;
    if (dir > 0) { if (delta < 0) delta += TAU; }
    else         { if (delta > 0) delta -= TAU; }

    let extraSpins, duration, ease, wbOver = 0, goblinRun = null;
    if (goblin) {
        // The creep is sized first, then the laps are chosen to sit on top of
        // it, so the opening leg is always ~4-5 laps however long the gremlin
        // then hangs around. Scale the laps with the creep instead and a long
        // gremlin would give itself away by how lazily the spin started.
        const rounds = goblinRounds();
        const arc    = goblinCreepArc(segW, totalW, winnerOffset, rounds);
        extraSpins   = 4 + Math.ceil(arc / TAU);
        goblinRun    = buildGoblinRun(extraSpins * TAU + delta, arc, rounds,
                                      TAU / seg.labels.length);
        duration     = goblinRun.duration;
        ease         = goblinRun.ease;
    } else if (windBack) {
        // Two ordinary-looking spins back to back: ~3.5 laps out, a beat of
        // stillness, then a couple of laps the other way. The laps are split
        // that way round so the first leg alone reads as a normal spin —
        // ~3.5 laps over ~4.6s — and the backwards one is no faster.
        extraSpins = 1 + Math.floor(Math.random()*2);
        wbOver     = (2 + Math.random()*1.2) * TAU;
        duration   = 9800 + Math.random()*1400;
    } else if (manual) {
        // Hand-off: the animation must leave your fingers at the speed you
        // let go. Pick a lap count from the flick strength, then solve the
        // decay curve whose opening slope equals that release speed — so a
        // lazy nudge crawls and a hard flick genuinely rips.
        extraSpins = MIN_FLICK_SPINS + Math.round(Math.pow(manual.power, 1.6) * 17)
                                     + Math.floor(Math.random()*2);
        const rot  = Math.abs(dir*extraSpins*TAU + delta);
        const w    = manual.vel;
        duration   = Math.max(2600, Math.min(4500 + manual.power*3300, rot*STOCK_SLOPE/w));
        let slope  = w*duration/rot;
        if (slope < 1.75) {                          // more laps than that speed buys:
            duration = Math.min(7400, rot*1.75/w);   // let it coast longer instead
            slope    = w*duration/rot;
        }
        ease = decayEase(slope);
    } else {
        extraSpins = 4 + Math.floor(Math.random()*5);
        duration   = 6500 + Math.random()*2500;
        ease       = easeOut;
    }
    const totalRot = dir*extraSpins*TAU + delta;
    // The overshoot is only knowable once the trip is, so the curve is
    // solved here rather than above with the rest of them.
    if (windBack) ease = makeWindBackEase(wbOver / Math.abs(totalRot), totalRot);

    const startRot  = rotation;
    const endRot    = rotation + totalRot;
    const startTime = performance.now();

    // Tick cadence uses an even arc — a believable peg click rate that's
    // independent of the (possibly uneven) slice geometry.
    const ring    = pegRing(seg.labels.length);
    const tickArc = ring.arc;
    lastTickSection = Math.floor(rotation/tickArc);
    let tickPrevTime = startTime, tickPrevRot = rotation;

    let wbFired = false, gobBeat = 0;

    // Whole wheel torn off its hub — bounces around the viewport, drops back
    // on and finishes the very same spin, landing exactly where it would have.
    if (manual && manual.popOff) startPopOff(duration, { stunt: manual.stunt, dir });

    function frame(now) {
        const t = Math.min((now-startTime)/duration, 1);
        rotation = startRot + (endRot-startRot) * ease(t);
        redraw();

        // Peg clicks — brighter and tighter the faster the wheel is going
        const frameMs = Math.max(now - tickPrevTime, 1);
        setTickSpeed((rotation - tickPrevRot) / frameMs);
        tickPrevTime = now; tickPrevRot = rotation;

        const sectionIdx = Math.floor(rotation/tickArc);
        if (sectionIdx !== lastTickSection) {
            const crossed = Math.min(Math.abs(sectionIdx-lastTickSection), 2);
            for (let i=0;i<crossed;i++) playTick(i === 0 && isAccentPeg(sectionIdx, ring.per));
            lastTickSection = sectionIdx;
        }

        // WIND-BACK — one beat: the shove that sends it the other way
        if (windBack && !wbFired && t >= WB.hold) {
            wbFired = true;
            triggerWindBack();
        }

        // GREMLIN — he turns up, then jerks once per shove he gives it
        while (goblinRun && gobBeat < goblinRun.beats.length && t >= goblinRun.beats[gobBeat].t) {
            triggerGoblinBeat(goblinRun.beats[gobBeat++].kind);
        }

        if (t<1) {
            requestAnimationFrame(frame);
        } else {
            if (popOff.active) endPopOff();       // safety: never finish mid-flight
            if (goblinRun) hideGoblin();          // ...and never leave him on the rim
            rotation = endRot; redraw();
            if (isIllegal) { showIllegalStamp(); }
            else if (winnerIdx === seg.panicIndex) { onPanicLanded(); }
            else { onSpinEnd(winnerIdx); }
        }
    }

    requestAnimationFrame(frame);
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

/* ══════════════════════════════════════
   Grab-to-spin
   ─────────────────────────────────────
   Drag the wheel with a pointer and let go. The release speed drives the
   SHOW - lap count, run time, how hard it launches, whether it pops off -
   but never the RESULT: the winner is still drawn by weightedPick() inside
   startSpin(), after your hand is off the wheel. You cannot aim it.
══════════════════════════════════════ */
const TAU_FULL = 2 * Math.PI;

const FLICK = {
    minVel:   0.0025,   // rad/ms - a release slower than this is just a nudge
    maxVel:   0.030,    // rad/ms - a full-arm flick (~5 turns a second)
    tapArc:   0.05,     // rad - barely moved? treat the press as a tap-to-spin
    popPower: 0.88      // power above which the wheel can rip off its hub
};

const drag = { active: false, id: null, last: 0, moved: 0, samples: [] };

function segCount() { return names.length + (panicSliceActive() ? 1 : 0); }
function canGrab()  { return !isSpinning && !isBusy && !drag.active && names.length >= 2; }

function pointerAngle(e) {
    const r = canvas.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height/2), e.clientX - (r.left + r.width/2));
}

// Peg clicks while you drag, capped so a frantic sweep doesn't machine-gun.
function dragTicks() {
    const ring = pegRing(segCount());
    const idx  = Math.floor(rotation / ring.arc);
    if (idx !== lastTickSection) {
        const crossed = Math.min(Math.abs(idx - lastTickSection), 2);
        for (let i = 0; i < crossed; i++) playTick(i === 0 && isAccentPeg(idx, ring.per));
        lastTickSection = idx;
    }
}

canvas.addEventListener('pointerdown', e => {
    if (!canGrab()) return;
    ensureAudio();
    e.preventDefault();
    drag.active  = true;
    drag.id      = e.pointerId;
    drag.last    = pointerAngle(e);
    drag.moved   = 0;
    drag.samples = [{ t: performance.now(), a: rotation }];
    lastTickSection = Math.floor(rotation / pegRing(segCount()).arc);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    wheelWrap.classList.add('grabbing');
});

canvas.addEventListener('pointermove', e => {
    if (!drag.active || e.pointerId !== drag.id) return;
    const a = pointerAngle(e);
    let d = a - drag.last;                       // unwrap across the +/-PI seam
    if (d >  Math.PI) d -= TAU_FULL;
    if (d < -Math.PI) d += TAU_FULL;
    drag.last   = a;
    drag.moved += Math.abs(d);
    rotation   += d;
    const now  = performance.now();
    const prev = drag.samples[drag.samples.length - 1];
    setTickSpeed(d / Math.max(now - prev.t, 1));
    drag.samples.push({ t: now, a: rotation });
    if (drag.samples.length > 12) drag.samples.shift();
    redraw();
    dragTicks();
});

function releaseDrag(e) {
    if (!drag.active || (e && e.pointerId !== drag.id)) return;
    drag.active = false;
    wheelWrap.classList.remove('grabbing');
    try { canvas.releasePointerCapture(drag.id); } catch (err) {}

    // Release speed = angle covered over the last ~140ms, so a flick that
    // ends in a stall reads as a stall, not as the whole drag's average.
    const now = performance.now();
    const win = drag.samples.filter(pt => now - pt.t < 140);
    let vel = 0;
    if (win.length >= 2) {
        const dt = win[win.length-1].t - win[0].t;
        if (dt > 6) vel = (win[win.length-1].a - win[0].a) / dt;
    }
    const speed = Math.abs(vel);

    // Pressed without really turning it? That's a tap - spin it for them.
    if (drag.moved < FLICK.tapArc && speed < FLICK.minVel) { spin(); return; }

    const power = Math.min(Math.max((speed - FLICK.minVel) / (FLICK.maxVel - FLICK.minVel), 0), 1);
    // Only a genuinely violent flick can tear the wheel loose, and even then
    // it's close to a coin flip - so it stays a surprise, not a routine.
    const pop = popOffEnabled && !prefersReducedMotion() && power >= FLICK.popPower &&
                Math.random() < 0.35 + (power - FLICK.popPower) * 4;

    beginSpin({
        vel:    Math.max(speed, FLICK.minVel),
        dir:    vel < 0 ? -1 : 1,
        power,
        popOff: pop,
        stunt:  Math.random() < 0.5 ? 'roll' : 'bounce'
    });
}

canvas.addEventListener('pointerup', releaseDrag);
// A cancelled pointer (system gesture, lost contact) just drops the wheel
// where it is — an interrupted touch shouldn't fling it.
canvas.addEventListener('pointercancel', e => {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    wheelWrap.classList.remove('grabbing');
    try { canvas.releasePointerCapture(drag.id); } catch (err) {}
});

/* ══════════════════════════════════════
   Pop-off - the wheel leaves the building
   ─────────────────────────────────────
   Only the presentation flies: `rotation` keeps ticking down the exact same
   curve underneath, so the wheel re-seats and lands on the winner that was
   already drawn. Bounces are viewport-bounded, so it can't sail off-screen.
══════════════════════════════════════ */
const popOff = { active: false };

// Two ways off the hub, picked at the moment of release:
//   bounce - the wheel pinballs around the viewport
//   roll   - it drops to the floor and rolls away the way it was spinning
function startPopOff(spinDuration, opts) {
    if (popOff.active) return;
    const stunt = (opts && opts.stunt) === 'roll' ? 'roll' : 'bounce';
    const now   = performance.now();
    const base  = {
        active: true, stunt,
        x: 0, y: 0, scale: 1, sx: 1, sy: 1,
        tilt: 0, squashT: 0,
        rect: wheelWrap.getBoundingClientRect(),
        t0: now, last: now,
        flight: Math.min(2300, Math.max(1200, spinDuration * 0.34))
    };

    if (stunt === 'roll') {
        const dir = (opts && opts.dir < 0) ? -1 : 1;   // rolls the way it spins
        Object.assign(popOff, base, {
            phase: 'drop',
            vx: dir * (0.85 + Math.random() * 0.55),
            vy: 0.05,
            baseScale: 0.74 + Math.random() * 0.08,
            vtilt: 0
        });
    } else {
        const ang   = -Math.PI/2 + (Math.random() - 0.5) * 2.2;  // mostly upward
        const speed = 1.15 + Math.random() * 0.75;               // px/ms
        Object.assign(popOff, base, {
            phase: 'fly',
            vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
            baseScale: 0.6 + Math.random() * 0.14,
            vtilt: (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.05)
        });
    }

    wheelWrap.classList.add('flying');
    canvas.style.willChange = 'transform';
    playPopSound();
    shakeWheel();
    requestAnimationFrame(popFrame);
}

// Where the wheel's edges are right now, in transform-offset space, so both
// stunts can be kept inside the viewport.
function popBounds() {
    const r = popOff.rect, m = 12;
    // The wheel is a circle inside a square canvas, so the transparent
    // corners are not part of it — bound the drawn radius instead, or it
    // stops short of every edge and tilting makes it worse.
    const halfW = (r.width  / 2 - 12) * popOff.sx;
    const halfH = (r.height / 2 - 12) * popOff.sy;
    return {
        halfW, halfH,
        left:  m + halfW - (r.left + r.width/2),
        right: window.innerWidth  - m - halfW - (r.left + r.width/2),
        floor: window.innerHeight - m - halfH - (r.top  + r.height/2)
    };
}

// A decaying squash on impact: fat and short, springing back to round.
function popSquash(now) {
    if (!popOff.squashT) return 0;
    const u = (now - popOff.squashT) / 220;
    if (u >= 1) return 0;
    return Math.sin(Math.PI * u) * Math.exp(-2.4 * u) * 0.17;
}

function popFrame(now) {
    if (!popOff.active) return;
    const dt = Math.min(now - popOff.last, 34);   // clamp so a stalled tab can't teleport it
    popOff.last = now;

    if (popOff.stunt === 'roll') stepRoll(now, dt);
    else                         stepBounce(now, dt);
    if (!popOff.active) return;                   // the step may have finished it

    canvas.style.transform =
        'translate3d(' + popOff.x.toFixed(2) + 'px,' + popOff.y.toFixed(2) + 'px,0) ' +
        'rotate(' + popOff.tilt.toFixed(2) + 'deg) ' +
        'scale(' + popOff.sx.toFixed(3) + ',' + popOff.sy.toFixed(3) + ')';
    requestAnimationFrame(popFrame);
}

/* -- Stunt: roll --
   The wheel is already spinning flat out, so a wheel-shaped thing running
   along the floor reads as rolling without faking any wheel rotation. It
   rolls out, runs out of momentum, and comes back the way it came, which
   is also what carries it home. */
function stepRoll(now, dt) {
    const b = popBounds();

    if (popOff.phase === 'drop') {
        popOff.vy    += 0.0055 * dt;              // real gravity this time
        popOff.y     += popOff.vy * dt;
        popOff.scale += (popOff.baseScale - popOff.scale) * 0.08;
        if (popOff.y >= b.floor) {                // touchdown
            popOff.y       = b.floor;
            popOff.phase   = 'roll';
            popOff.rollT0  = now;
            popOff.squashT = now;
            playThud();
            shakeWheel();
            startRumble();
        }
    } else if (popOff.phase === 'roll') {
        popOff.x     += popOff.vx * dt;
        popOff.scale += (popOff.baseScale - popOff.scale) * 0.08;
        // Rolling friction, so it visibly runs out of steam.
        const drag = 0.00042 * dt;
        popOff.vx = Math.abs(popOff.vx) <= drag ? 0 : popOff.vx - Math.sign(popOff.vx) * drag;
        if (popOff.x < b.left)  { popOff.x = b.left;  popOff.vx =  Math.abs(popOff.vx) * 0.6; popOff.squashT = now; playClank(); }
        if (popOff.x > b.right) { popOff.x = b.right; popOff.vx = -Math.abs(popOff.vx) * 0.6; popOff.squashT = now; playClank(); }
        popOff.y = b.floor;
        setRumble(popOff.vx);
        if (popOff.vx === 0 || now - popOff.rollT0 > popOff.flight) {
            popOff.phase = 'home';
            popOff.rt0   = now;
            popOff.from  = { x: popOff.x, y: popOff.y, s: popOff.scale };
            stopRumble();
        }
    } else {                                      // home - one hop back on
        const t = Math.min((now - popOff.rt0) / 540, 1);
        const e = t * t * (3 - 2 * t);
        popOff.x     = popOff.from.x * (1 - e);
        popOff.y     = popOff.from.y * (1 - e) - Math.sin(Math.PI * t) * 110;   // arcs over
        popOff.scale = popOff.from.s + (1 - popOff.from.s) * e;
        popOff.tilt  = 0;
        popOff.sx    = popOff.sy = popOff.scale;
        if (t >= 1) endPopOff();
        return;
    }

    const k = popSquash(now);
    popOff.sx = popOff.scale * (1 + k * 0.75);
    popOff.sy = popOff.scale * (1 - k);
}

/* -- Stunt: bounce -- */
function stepBounce(now, dt) {
    const r = popOff.rect;

    if (popOff.phase === 'fly') {
        popOff.x     += popOff.vx * dt;
        popOff.y     += popOff.vy * dt;
        popOff.vy    += 0.0014 * dt;              // a whisper of gravity, just to arc it
        popOff.scale += (popOff.baseScale - popOff.scale) * 0.06;
        popOff.tilt  += popOff.vtilt * dt;

        const halfW = (r.width  / 2 - 12) * popOff.scale;
        const halfH = (r.height / 2 - 12) * popOff.scale;
        const px    = r.left + r.width/2  + popOff.x;
        const py    = r.top  + r.height/2 + popOff.y;
        const m     = 12;
        let hit = false;
        if (px - halfW < m) {
            popOff.x += m - (px - halfW);
            popOff.vx =  Math.abs(popOff.vx) * 0.94; hit = true;
        } else if (px + halfW > window.innerWidth - m) {
            popOff.x -= (px + halfW) - (window.innerWidth - m);
            popOff.vx = -Math.abs(popOff.vx) * 0.94; hit = true;
        }
        if (py - halfH < m) {
            popOff.y += m - (py - halfH);
            popOff.vy =  Math.abs(popOff.vy) * 0.94; hit = true;
        } else if (py + halfH > window.innerHeight - m) {
            popOff.y -= (py + halfH) - (window.innerHeight - m);
            popOff.vy = -Math.abs(popOff.vy) * 0.94; hit = true;
        }
        if (hit) { popOff.vtilt *= -0.85; playClank(); }

        if (now - popOff.t0 > popOff.flight) {
            popOff.phase = 'return';
            popOff.rt0   = now;
            popOff.from  = { x: popOff.x, y: popOff.y, s: popOff.scale, tilt: popOff.tilt };
        }
    } else {
        const t = Math.min((now - popOff.rt0) / 380, 1);
        const e = 1 - Math.pow(1 - t, 3);
        popOff.x     = popOff.from.x * (1 - e);
        popOff.y     = popOff.from.y * (1 - e);
        popOff.scale = popOff.from.s + (1 - popOff.from.s) * e;
        popOff.tilt  = popOff.from.tilt * (1 - e);
        if (t >= 1) { endPopOff(); return; }
    }
    popOff.sx = popOff.sy = popOff.scale;
}

function endPopOff() {
    if (!popOff.active) return;
    popOff.active = false;
    stopRumble();
    canvas.style.transform  = '';
    canvas.style.willChange = '';
    wheelWrap.classList.remove('flying');
    const ring = document.createElement('div');
    ring.className = 'reseat-ring';
    wheelWrap.appendChild(ring);
    setTimeout(() => ring.remove(), 520);
    playReseatSound();
    shakeWheel();
    redraw();                                  // the pointer comes back
}
