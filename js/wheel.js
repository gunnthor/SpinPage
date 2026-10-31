/* ══════════════════════════════════════
   Draw wheel
   ─────────────────────────────────────
   Everything is drawn in 480-unit wheel space (SIZE, cx, cy, R) and scaled
   onto a backing store sized to the wheel's real on-screen pixels, so it is
   sharp on a phone and on a 4K monitor alike, and the gremlin and pop-off
   geometry — solved against R = 228 of 480 — never moves.

   Two cached layers, so a frame is two drawImage calls:
     face   slices, dividers, labels and pegs. Rotates with the wheel, and
            is only repainted when the table or the slice weights change.
     light  the room's lighting, the brass rim and the hub. It does not
            rotate — light comes from the room, not from the wheel — so the
            wheel looks the same at rest and at full speed.
══════════════════════════════════════ */
const faceCanvas  = document.createElement('canvas');
const faceCtx     = faceCanvas.getContext('2d');
const lightCanvas = document.createElement('canvas');
const lightCtx    = lightCanvas.getContext('2d');
let faceKey        = '';
let lightKey       = '';
let wheelScale     = 1;          // backing-store px per wheel unit
let wheelHighlight = null;       // name whose slice is spotlit after a landing
let spinSeg        = null;       // the slices a spin in flight was solved against
let seatWheel      = null;       // No One Is Safe: the drafted seats have the wheel

const HUB_R   = 31;              // hub radius, wheel units
const PEG_R   = R - 8;           // radius of the peg ring
const LABEL_R = R - 19;          // labels end here, just inside the pegs
const LABEL_FONT = '"Oswald Variable", "Bahnschrift SemiCondensed", "Avenir Next Condensed", "Roboto Condensed", "Arial Narrow", sans-serif';

// Size the backing store to the canvas's layout box (offsetWidth ignores the
// pop-off transform, so a flying wheel doesn't re-rasterise every frame).
function sizeWheelCanvas() {
    const css = canvas.offsetWidth || SIZE;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px  = Math.max(240, Math.min(2048, Math.round(css * dpr)));
    if (canvas.width === px && faceCanvas.width === px) return false;
    canvas.width = canvas.height = px;
    faceCanvas.width = faceCanvas.height = px;
    lightCanvas.width = lightCanvas.height = px;
    wheelScale = px / SIZE;
    faceKey = lightKey = '';
    return true;
}

function sliceArcs(weights) {
    const TAU = 2 * Math.PI;
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return weights.map(w => {
        const a0 = (acc / total) * TAU; acc += w;
        return { a0, a1: (acc / total) * TAU };
    });
}

/* ── Label sizing ──
   One type size for the whole wheel, solved from geometry rather than the
   name count: the largest size at which the thinnest ordinary slice still
   has room for a few letters. The thinnest slice is measured at the table's
   resting geometry, so a power-up warping the slices doesn't make every
   label jump. A crowded wheel steps down to 9px before it gives up on
   type, and then only the slices too thin for it go without — a slice a
   power-up has swollen still gets its name.

   A name too long for its slice takes the first of these that fits:
     1. the whole name, on one line
     2. the whole name over two lines, where the slice is wide enough
        ("Jean-Baptiste / Grenouille")
     3. first name and last initial ("Benedict C.")
     4. first name alone ("Benedict")
     5. as much as fits, then an ellipsis ("Rumpelst…")
   The whole name is tried at the wheel's size first, so a roomy wheel
   keeps one size throughout; after that each step may shrink to SHRINK of
   it, since a name a little too long reads better a touch smaller than
   shortened. 3 and 4 are passed over when they would leave two slices
   saying the same thing — Ben Smith and Ben Jones are never both "Ben". */
const LABEL_ROOM = 2.4;             // a label needs room for this many ems
const SHRINK     = 0.8;             // a long name may shrink to this share of the wheel's size
const LINE_GAP   = 1.05;            // two-line labels: baseline to baseline, in ems
function labelPlan(seg) {
    const css   = canvas.offsetWidth || SIZE;
    const unit  = SIZE / css;                                    // wheel units per CSS px
    const dpr   = window.devicePixelRatio || 1;
    const minFs = (dpr >= 2 ? 10 : 11) * unit;
    const maxFs = Math.max(14 * unit, 0.044 * SIZE);
    const players = seg.labels.length - (seg.panicIndex >= 0 ? 1 : 0);
    const restW = players + (seg.panicIndex >= 0 ? Math.min(PANIC.weight, players / 3) : 0);
    const angMin = 2 * Math.PI / Math.max(restW, 1);
    let fs = maxFs;
    while (fs > minFs && roomFor(fs, angMin) < fs * 4.5) fs -= 0.5;
    while (fs > 9 * unit && roomFor(fs, angMin) < fs * LABEL_ROOM) fs -= 0.5;
    return { fs, floor: Math.max(fs * SHRINK, Math.min(fs, 9 * unit)) };
}
// Radial room for a label of size fs in a slice of angle ang: from the rim
// inward until the slice is too narrow to hold the letters' height.
function roomFor(fs, ang, lines = 1) {
    const tall  = fs * (1 + (lines - 1) * LINE_GAP);
    const inner = Math.max(HUB_R + 10, tall / (0.8 * 2 * Math.sin(Math.min(ang, Math.PI) / 2)));
    return Math.min(R * 0.66, LABEL_R - inner);
}

// The short forms of a name: first name and last initial, first name.
function shortForms(name) {
    const words = name.split(' ');
    if (words.length < 2) return [];
    const first = words[0], initial = Array.from(words[words.length - 1])[0];
    return /\p{L}/u.test(initial) ? [first + ' ' + initial + '.', first] : [first];
}
// How many slices could end up saying each thing, so a short form is
// only used where it still names one person.
function labelClaims(labels) {
    const claims = new Map();
    for (const name of labels) {
        for (const t of new Set([name, ...shortForms(name)])) claims.set(t, (claims.get(t) || 0) + 1);
    }
    return claims;
}
// The most even break into two lines, at a space or just after a hyphen.
function twoLines(c, name) {
    let best = null, bestW = Infinity;
    for (let i = 1; i < name.length - 1; i++) {
        const ch = name[i];
        if (ch !== ' ' && ch !== '-') continue;
        const lines = ch === ' ' ? [name.slice(0, i), name.slice(i + 1)] : [name.slice(0, i + 1), name.slice(i + 1)];
        const w = Math.max(c.measureText(lines[0]).width, c.measureText(lines[1]).width);
        if (lines[0].trim() && lines[1].trim() && w < bestW) { best = lines; bestW = w; }
    }
    return best;
}
// The largest size between fs and floor at which these lines fit a slice
// of angle ang, or 0. The font must be set at fs: widths scale with it.
function fitSize(c, lines, fs, floor, ang) {
    const ems = Math.max(...lines.map(l => c.measureText(l).width)) / fs;
    for (let s = fs; s >= floor - 1e-6; s -= 0.25) {
        if (ems * s <= roomFor(s, ang, lines.length)) return s;
    }
    return 0;
}
// Whole characters, so never half an emoji; no space left before the dots.
function cutText(c, text, room) {
    const chars = Array.from(text);
    while (chars.length > 1 && c.measureText(chars.join('').trimEnd() + '…').width > room) chars.pop();
    return chars.length > 1 ? chars.join('').trimEnd() + '…' : '';
}
// What to write in a slice of angle ang, and how big: { lines, fs }.
function fitLabel(c, name, plan, ang, claims) {
    const whole = [[name]];
    const two = twoLines(c, name);
    if (two) whole.push(two);
    const short = shortForms(name).filter(t => !claims || claims.get(t) === 1).map(t => [t]);
    const tries = [...whole.map(lines => [lines, plan.fs]),
                   ...[...whole, ...short].map(lines => [lines, plan.floor])];
    for (const [lines, floor] of tries) {
        const fs = fitSize(c, lines, plan.fs, floor, ang);
        if (fs) return { lines, fs };
    }
    const k = plan.floor / plan.fs;               // measured at plan.fs: scale the room instead
    const cut = cutText(c, name, roomFor(plan.floor, ang) / k);
    return { lines: cut ? [cut] : [], fs: plan.floor };
}

let panicStripe = null;
function panicPattern(c) {
    if (!panicStripe) {
        panicStripe = document.createElement('canvas');
        panicStripe.width = panicStripe.height = 16;
        const p = panicStripe.getContext('2d');
        p.fillStyle = PANIC.color; p.fillRect(0, 0, 16, 16);
        p.strokeStyle = 'rgba(255,61,139,0.32)'; p.lineWidth = 4;
        p.beginPath();
        p.moveTo(-4, 20); p.lineTo(20, -4); p.moveTo(-12, 12); p.lineTo(12, -12); p.moveTo(4, 28); p.lineTo(28, 4);
        p.stroke();
    }
    return c.createPattern(panicStripe, 'repeat');
}

function paintPegs(c, count) {
    const ring = pegRing(count);
    const n = Math.max(count, 1) * ring.per;
    for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + k * ring.arc;
        const x = cx + Math.cos(a) * PEG_R, y = cy + Math.sin(a) * PEG_R;
        const r = isAccentPeg(k, ring.per) ? 3.2 : 2.3;
        const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
        g.addColorStop(0, '#fff6cf'); g.addColorStop(0.45, '#e2bd55'); g.addColorStop(1, '#6e5214');
        c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fillStyle = g; c.fill();
        c.lineWidth = 0.6; c.strokeStyle = 'rgba(0,0,0,0.45)'; c.stroke();
    }
}

function prepare(c, canvasEl) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvasEl.width, canvasEl.height);
    c.setTransform(wheelScale, 0, 0, wheelScale, 0, 0);
}

function paintFace(seg) {
    const c = faceCtx, base = -Math.PI / 2;
    prepare(c, faceCanvas);
    const arcs = sliceArcs(seg.weights);

    arcs.forEach(({ a0, a1 }, i) => {
        c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, base + a0, base + a1); c.closePath();
        c.fillStyle = i === seg.panicIndex ? panicPattern(c) : seg.colors[i];
        c.fill();
    });

    // Dividers: a dark groove with a brass hairline in it.
    arcs.forEach(({ a0 }) => {
        const x = cx + Math.cos(base + a0) * R, y = cy + Math.sin(base + a0) * R;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y);
        c.lineWidth = 2.4; c.strokeStyle = 'rgba(0,0,0,0.42)'; c.stroke();
        c.lineWidth = 0.9; c.strokeStyle = 'rgba(240,206,110,0.6)'; c.stroke();
    });

    const plan   = labelPlan(seg);
    const claims = labelClaims(seg.labels.filter((_, i) => i !== seg.panicIndex));
    arcs.forEach(({ a0, a1 }, i) => {
        const panic = i === seg.panicIndex;
        const weight = panic ? 700 : 600;
        if (roomFor(plan.floor, a1 - a0) < plan.floor * LABEL_ROOM) return;   // a sliver: colour only
        c.save();
        c.translate(cx, cy); c.rotate(base + (a0 + a1) / 2);
        c.font = `${weight} ${plan.fs.toFixed(2)}px ${LABEL_FONT}`;
        c.textAlign = 'right'; c.textBaseline = 'middle';
        const { lines, fs } = fitLabel(c, panic ? PANIC.label : seg.labels[i], plan, a1 - a0, panic ? null : claims);
        if (lines.length) {
            c.font = `${weight} ${fs.toFixed(2)}px ${LABEL_FONT}`;
            if (panic) { c.shadowColor = 'rgba(255,61,139,0.75)'; c.shadowBlur = 6; }
            c.fillStyle = panic ? PANIC.textColor : inkOn(seg.colors[i]);
            lines.forEach((line, k) => c.fillText(line, LABEL_R, fs * 0.04 + (k - (lines.length - 1) / 2) * fs * LINE_GAP));
        }
        c.restore();
    });
    paintPegs(c, seg.labels.length);
}

// The wheel with nothing on it yet: a dim, gilded blank — clearly a wheel,
// clearly waiting. The words sit in the DOM over it (see .wheel-empty).
function paintBlankFace() {
    const c = faceCtx, TAU = 2 * Math.PI, base = -Math.PI / 2, n = 12;
    prepare(c, faceCanvas);
    for (let i = 0; i < n; i++) {
        c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, base + i * TAU / n, base + (i + 1) * TAU / n); c.closePath();
        c.fillStyle = i % 2 ? '#15121d' : '#1c1826'; c.fill();
    }
    for (let i = 0; i < n; i++) {
        const a = base + i * TAU / n;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        c.lineWidth = 1; c.strokeStyle = 'rgba(240,206,110,0.16)'; c.stroke();
    }
    paintPegs(c, n);
}

// danger: No One Is Safe — the same wheel under a red light.
function paintLight(blank, danger) {
    const c = lightCtx;
    prepare(c, lightCanvas);
    // Fall-off: brighter toward the hub, darker into the rim...
    const fall = c.createRadialGradient(cx, cy, HUB_R, cx, cy, R);
    fall.addColorStop(0, 'rgba(255,255,255,0.10)');
    fall.addColorStop(0.55, 'rgba(255,255,255,0.02)');
    fall.addColorStop(0.86, 'rgba(0,0,0,0.10)');
    fall.addColorStop(1, 'rgba(0,0,0,0.34)');
    c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.fillStyle = fall; c.fill();
    // ...and a soft key light from the upper left.
    const kx = cx - R * 0.42, ky = cy - R * 0.55;
    const key = c.createRadialGradient(kx, ky, 0, kx, ky, R * 1.15);
    key.addColorStop(0, 'rgba(255,246,220,0.17)');
    key.addColorStop(0.45, 'rgba(255,246,220,0.05)');
    key.addColorStop(1, 'rgba(0,0,0,0.06)');
    c.fill(); c.fillStyle = key; c.fill();
    if (danger) {
        const wash = c.createRadialGradient(cx, cy, R * 0.3, cx, cy, R);
        wash.addColorStop(0, 'rgba(190,16,28,0)');
        wash.addColorStop(0.7, 'rgba(190,16,28,0.14)');
        wash.addColorStop(1, 'rgba(150,8,20,0.42)');
        c.fillStyle = wash; c.fill();
    }

    // The rim: dark seat, bright lip lit from above, shadow groove. Brass,
    // or blood-red lacquer while the seats are up.
    const rim = danger ? ['#3d0b0a', '#ffd4cc', '#e0463a', '#6e1410', '#d0473a']
                       : ['#3d2d09', '#fff1b8', '#e2b94a', '#7c5c16', '#d9b04a'];
    c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI);
    c.lineWidth = 7; c.strokeStyle = rim[0]; c.stroke();
    const lip = c.createLinearGradient(0, cy - R, 0, cy + R);
    lip.addColorStop(0, rim[1]); lip.addColorStop(0.3, rim[2]); lip.addColorStop(0.68, rim[3]); lip.addColorStop(1, rim[4]);
    c.beginPath(); c.arc(cx, cy, R - 1.2, 0, 2 * Math.PI);
    c.lineWidth = 3.6; c.strokeStyle = lip; c.stroke();
    c.beginPath(); c.arc(cx, cy, R - 4.8, 0, 2 * Math.PI);
    c.lineWidth = 1.2; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke();

    // The hub: domed brass, an engraved well and the house mark. An empty
    // wheel has words where the hub would be, so it goes without.
    if (blank) return;
    const ring = c.createLinearGradient(cx - HUB_R, cy - HUB_R, cx + HUB_R, cy + HUB_R);
    const hub = danger ? ['#ffd4cc', '#d8443a', '#6e1410', '#f08a7c'] : ['#fff3c2', '#e0b84e', '#7c5c16', '#f2d77c'];
    ring.addColorStop(0, hub[0]); ring.addColorStop(0.32, hub[1]); ring.addColorStop(0.64, hub[2]); ring.addColorStop(1, hub[3]);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
    c.beginPath(); c.arc(cx, cy, HUB_R, 0, 2 * Math.PI); c.fillStyle = ring; c.fill();
    c.restore();
    const well = c.createRadialGradient(cx, cy - 6, 2, cx, cy, HUB_R - 7);
    well.addColorStop(0, '#2a2236'); well.addColorStop(1, '#09080e');
    c.beginPath(); c.arc(cx, cy, HUB_R - 7, 0, 2 * Math.PI); c.fillStyle = well; c.fill();
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,236,170,0.35)'; c.stroke();
    const gem = c.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 12);
    gem.addColorStop(0, '#ffd9de'); gem.addColorStop(0.45, '#d8344a'); gem.addColorStop(1, '#5a0d1b');
    c.beginPath(); c.moveTo(cx, cy - 12); c.lineTo(cx + 9, cy); c.lineTo(cx, cy + 12); c.lineTo(cx - 9, cy); c.closePath();
    c.fillStyle = gem; c.fill();
    c.lineWidth = 1.2; c.strokeStyle = '#c9a23c'; c.stroke();
}

// Dim everything but the winner and ring the winning slice in light.
function paintHighlight(seg) {
    const i = seg.labels.indexOf(wheelHighlight);
    if (i < 0) return;
    const { a0, a1 } = sliceArcs(seg.weights)[i];
    const base = rotation - Math.PI / 2, TAU = 2 * Math.PI;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R - 3, base + a1, base + a0 + TAU); ctx.closePath();
    ctx.fillStyle = 'rgba(4,3,9,0.6)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R - 3, base + a0, base + a1); ctx.closePath();
    ctx.lineJoin = 'round';
    const lamp = seatWheel ? ['rgba(255,70,60,0.95)', '#ff6b5f', '#ffe3df']      // the seat that is lost
                           : ['rgba(255,214,102,0.9)', '#ffe07a', '#fffbe8'];
    ctx.shadowColor = lamp[0]; ctx.shadowBlur = 22;
    ctx.lineWidth = 4; ctx.strokeStyle = lamp[1]; ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = lamp[2]; ctx.stroke();
    ctx.restore();
}

function drawWheel() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const seats = !!seatWheel;
    const blank = !seats && names.length < 2;
    const seg = blank ? null : seats ? seatWheel.seg : (spinSeg || buildSegments(getWeights()));
    const key = blank ? 'blank|' + canvas.width
        : [canvas.width, canvas.offsetWidth, seg.panicIndex, seg.labels.join('\u0001'), seg.colors.join(','),
           seg.weights.map(w => w.toFixed(4)).join(',')].join('|');
    if (key !== faceKey) { blank ? paintBlankFace() : paintFace(seg); faceKey = key; }
    const lk = canvas.width + (blank ? '|blank' : '') + (seats ? '|seats' : '');
    if (lightKey !== lk) { paintLight(blank, seats); lightKey = lk; }

    const W = canvas.width;
    const turn = blank ? 0 : rotation + strobe.off;
    ctx.translate(W / 2, W / 2);
    ctx.rotate(turn);
    ctx.drawImage(faceCanvas, -W / 2, -W / 2);
    // Strobing: faint extra exposures smeared the way the wheel is really
    // going, however it seems to be turning.
    if (strobe.mix > 0) {
        ctx.globalAlpha = STROBE.ghostAlpha * strobe.mix;
        for (let i = 1; i <= STROBE.ghosts; i++) {
            ctx.rotate(-strobe.dir * STROBE.smear * strobe.mix);
            ctx.drawImage(faceCanvas, -W / 2, -W / 2);
        }
        ctx.globalAlpha = 1;
    }
    ctx.setTransform(wheelScale, 0, 0, wheelScale, 0, 0);
    if (!blank && wheelHighlight) paintHighlight(seg);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightCanvas, 0, 0);
}

/* ── The flapper ──
   The pointer is a leather flapper on the frame, so it rides the pegs: each
   one pushes it aside as it comes up and lets it snap back as it passes.
   Driven from the same peg ring the click sound uses, so you see each tick
   you hear. At speed the swing shrinks to a shiver; calm effects keep it still. */
const wheelPointer = document.getElementById('wheelPointer');
let flapRot = 0, flapT = 0;
function flapPointer() {
    if (!wheelPointer) return;
    if (calmEffects()) { wheelPointer.style.transform = ''; return; }
    const now = performance.now();
    const ring = pegRing(seatWheel ? seatWheel.seg.labels.length : names.length < 2 ? 12 : segCount());
    const moved = rotation - flapRot;
    const speed = Math.abs(moved) / Math.max(now - flapT, 1);
    flapRot = rotation; flapT = now;
    const phase = ((rotation / ring.arc) % 1 + 1) % 1;            // 0 at a peg, 1 at the next
    const push  = moved >= 0 ? Math.max(0, (phase - 0.55) / 0.45)  // the next peg is coming up
                             : Math.max(0, (0.45 - phase) / 0.45);
    const amp   = 18 * Math.min(1, Math.max(0.12, 1 - speed / 0.016));
    const deg   = (moved >= 0 ? -1 : 1) * amp * push * push;
    wheelPointer.style.transform = `rotate(${deg.toFixed(2)}deg)`;
}

function redraw() { drawWheel(); flapPointer(); }

/* ══════════════════════════════════════
   Spin
══════════════════════════════════════ */
spinBtn.addEventListener('click', () => {
    // Mid-event the wheel can briefly hold one name: busy comes first, so
    // a press while No One Is Safe plays isn't reported as a problem.
    if (isSpinning || isBusy) return;
    if (names.length < 2) { alertNow(names.length ? 'Add one more name to spin.' : 'Add at least 2 names to spin.'); return; }
    spin();
});

function spin() { beginSpin(null); }

// launch === null  → button/spacebar spin (the wheel builds its own speed)
// launch === {...} → hand flick: { vel, dir, power, popOff } from the drag
// auto             → queued by autospin, not asked for by a person
function beginSpin(launch, auto) {
    if (isSpinning||isBusy||names.length<2) return;
    // Hands on the wheel win: an autospin tick that lands mid-drag waits
    // its turn instead of fighting the player for the rotation.
    if (drag.active && !launch) { if (autoSpin) queueAutoSpin(900); return; }
    ensureAudio();

    endWinnerMoment();
    hideToast();
    isSpinning = true;
    phase = 'spinning';
    stunt = null;
    wheelHighlight = null;
    spinSeg = null;
    hideWinCallout();
    // A spin you asked for puts the panels away so you see it land; one
    // autospin queued leaves alone a sheet you have just opened to look.
    if (!auto) closeSheets();
    // Put the phone keyboard away: the landing is the thing to watch.
    if (document.activeElement && document.activeElement.matches('input')) document.activeElement.blur();

    // Maybe drop a power-up: a slice swells/shrinks before the spin, which
    // both looks dramatic AND shifts the real odds (winner is weighted).
    const pu = rollPowerUp();
    activePowerUp = pu ? describePowerUp(pu) : null;
    if (activePowerUp) announce(activePowerUp.say, 'spin');
    else if (!autoSpin) announce('Spinning.', 'spin');
    commit({ save: false });
    if (pu) {
        phase = 'warping';
        playPowerUpSound(pu.type);
        showPowerUpPopup(pu);
        if (launch) {
            // A flick is already in motion — no time for the grow/shrink
            // tween, so the slices warp instantly while the wheel flies.
            sliceWeights = pu.weights.slice();
            redraw();
            startSpin(pu.weights, launch);
        } else {
            animateWeights(pu.weights, 650, () => {
                setTimeout(guarded(() => startSpin(pu.weights)), 320);
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
    if (!powerUpsEnabled || names.length < 3 || Math.random() >= chaosOdds('powerup')) return null;
    noteChaos('powerup');
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
    const step = guarded(function (now) {
        const t = Math.min((now - t0) / duration, 1);
        const e = 1 - Math.pow(1 - t, 3);
        sliceWeights = startW.map((s, i) => s + (targetW[i] - s) * e);
        redraw();
        if (t < 1) requestAnimationFrame(step);
        else { sliceWeights = targetW.slice(); redraw(); done && done(); }
    });
    step(performance.now());
}

/* ── What a power-up did to the odds ──
   The drop popup is gone in a second and the slice it warped is a blur
   once the wheel is moving, so the status line keeps the power-up and its
   effect on the real odds on screen for the whole spin, on every screen. */

// Actual chance for one player, straight off the same segment weights the
// draw uses — so it accounts for the PANIC wedge eating into the wheel.
function chanceOf(weights, idx) {
    const seg   = buildSegments(weights);
    const total = seg.weights.reduce((a, b) => a + b, 0) || 1;
    return seg.weights[idx] / total;
}
const pct = v => Math.round(v * 100) + '%';

function describePowerUp(pu) {
    const flat = names.map(() => 1);
    const idx  = pu.type === 'wildcard' ? pu.weights.indexOf(Math.max(...pu.weights)) : pu.idx;
    const from = chanceOf(flat, idx), to = chanceOf(pu.weights, idx);
    const who  = names[idx];
    const say  = pu.type === 'wildcard'
        ? `Wildcard: every slice re-rolled. Best odds: ${who}, ${pct(to)}.`
        : `${pu.type === 'cursed' ? 'Cursed:' : 'Power-up: ' + pu.label + ' on'} ${who}. Odds ${pct(from)} to ${pct(to)} this spin.`;
    return { ...pu, who, from, to, say };
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
    // The landing is solved against these slices, so the wheel is drawn from
    // them until it stops: flipping a setting mid-spin can't move the target.
    spinSeg  = seg;
    phase    = 'spinning';
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

    const isIllegal = Math.random() < chaosOdds('illegal');
    const manual    = launch || null;
    // The reverse-twist choreography assumes a forward, machine-paced spin,
    // so it sits out backwards flicks, hard flicks and pop-offs.
    const stuntOk = !isIllegal &&
                    !(manual && (manual.popOff || manual.power >= 0.6 || manual.dir < 0));
    const windBack = stuntOk && windBackEnabled && Math.random() < chaosOdds('windback');
    // The gremlin wants that same kind of spin, and enough names either side
    // of the landing that the creep genuinely changes hands a few times.
    const goblin   = stuntOk && !windBack && goblinEnabled &&
                     !prefersReducedMotion() && seg.labels.length >= 3 &&
                     goblinFires(names.length, goblinSeen, chaos('gremlin'));
    if (isIllegal) noteChaos('illegal');
    if (windBack)  noteChaos('windback');
    if (goblin)    noteChaos('gremlin');

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
        // Calm effects: the same draw, the same landing and the same curve,
        // in one lap and three seconds. The dice above are still rolled, so
        // nothing downstream sees a different sequence.
        if (calmEffects()) { extraSpins = 1; duration = 3000; }
    }
    const totalRot = dir*extraSpins*TAU + delta;
    // The overshoot is only knowable once the trip is, so the curve is
    // solved here rather than above with the rest of them.
    if (windBack) ease = makeWindBackEase(wbOver / Math.abs(totalRot), totalRot);

    const startRot  = rotation;
    const endRot    = rotation + totalRot;
    let   startTime = performance.now(), lastNow = startTime;

    // Tick cadence uses an even arc — a believable peg click rate that's
    // independent of the (possibly uneven) slice geometry.
    const ring    = pegRing(seg.labels.length);
    const tickArc = ring.arc;
    lastTickSection = Math.floor(rotation/tickArc);
    let tickPrevTime = startTime, tickPrevRot = rotation;

    let wbFired = false, gobBeat = 0;

    // Whole wheel torn off its hub — bounces around the viewport, drops back
    // on and finishes the very same spin, landing exactly where it would have.
    // Or it stays on and strobes; a flick that can't hold the speed long
    // enough to strobe pops off instead.
    const strobeRun = manual && manual.popOff && manual.stunt === 'strobe'
        ? planStrobe(totalRot, duration, ease, dir) : null;
    if (manual && manual.popOff && !strobeRun) startPopOff(duration, { stunt: manual.stunt, dir });
    commit({ save: false });

    function frame(now) {
      try {
        // A hidden tab stops sending frames. Pick up where it left off rather
        // than jumping to the end and firing every gremlin beat at once.
        if (now - lastNow > 250) startTime += now - lastNow - 16;
        lastNow = now;
        const t = Math.min((now-startTime)/duration, 1);
        rotation = startRot + (endRot-startRot) * ease(t);
        if (strobeRun) stepStrobe(strobeRun, t);
        redraw();
        chaseBulbs();
        showUnderPointer(seg);

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
            if (strobeRun) endStrobe();           // ...or still strobing
            if (goblinRun) hideGoblin();          // ...and never leave him on the rim
            rotation = endRot; redraw();
            // spinSeg stays: the landing is shown on the very slices it was
            // solved against until the pick is seated (or the void stamp
            // clears, or the race opens). Power-up sizes and the PANIC wedge
            // change back only after that, so the pointer never sits on a
            // different name from the one announced.
            const panicked = !isIllegal && winnerIdx === seg.panicIndex;
            if (panicked) noteChaos('panic', panicHeat(draftOrder.length));
            chaosLog.spins++;                     // saved by whichever of these comes next
            if (isIllegal) { showIllegalStamp(); }
            else if (panicked) { onPanicLanded(); }
            else { onSpinEnd(winnerIdx); }
        }
      } catch (err) { recoverFromError(err); }
    }

    requestAnimationFrame(frame);
}

/* If anything throws mid-event, put the table back in a usable state instead
   of leaving every control locked until a reload: takeovers closed, the
   nameplate down, and a winner caught between the wheel and a seat put
   back on the wheel. */
function recoverFromError(err) {
    console.error(err);
    spinSeg = null; wheelHighlight = null; landed = null; plateHold = null;
    try { if (popOff.active) endPopOff(); endStrobe(); hideGoblin(); hideWinCallout(); } catch (e) {}
    try { if (marbleOverlay.classList.contains('show')) closeTakeover(marbleOverlay); } catch (e) {}
    try { endSeatStage(); canvas.classList.remove('flip'); } catch (e) {}
    if (pendingPick) {
        if (!onWheel(pendingPick.name) && !draftOrder.some(p => p.name === pendingPick.name)) names.push(pendingPick.name);
        pendingPick = null;
    }
    app.inert = false;
    isSpinning = false; isBusy = false; phase = 'ready'; activePowerUp = null; stunt = null;
    sliceWeights = null;
    commit();
}
// Every timer and frame of an event runs through this, so one exception
// anywhere in a takeover recovers instead of locking the app.
function guarded(fn) {
    return function () { try { return fn.apply(this, arguments); } catch (err) { recoverFromError(err); } };
}

/* ── Marquee bulbs ──
   They chase in step with the wheel, one bulb per few degrees of travel, so
   they race at full speed and crawl with the final ticks. */
let chaseStep = -1;
function chaseBulbs() {
    if (calmEffects()) return;
    const step = ((Math.floor(rotation / (Math.PI / 14)) % 3) + 3) % 3;
    if (step !== chaseStep) { chaseStep = step; wheelFrame.dataset.chase = step; }
}

/* ── Under the pointer ──
   The slice under the pointer, named in the status line every frame, so
   any wheel stays readable however thin its slices are. */
let readoutAt = -1;
function underPointer(seg) {
    const TAU = 2 * Math.PI;
    const off = ((-(rotation + strobe.off) % TAU) + TAU) % TAU;   // the slice you can see there
    const arcs = sliceArcs(seg.weights);
    for (let i = 0; i < arcs.length; i++) if (off < arcs[i].a1) return i;
    return arcs.length - 1;
}
function showUnderPointer(seg) {
    const i = underPointer(seg);
    if (i === readoutAt) return;
    readoutAt = i;
    setReadout(seg.labels[i], i === seg.panicIndex ? PANIC.textColor : seg.colors[i]);
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

const drag = { active: false, id: null, last: 0, moved: 0, samples: [], t0: 0 };

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

// Only the drawn disc is grabbable: the canvas corners are empty space.
function onDisc(e) {
    const r = canvas.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    return Math.hypot(dx, dy) <= (r.width / 2) * (R / (SIZE / 2));
}

function dropDrag() {
    drag.active = false;
    wheelWrap.classList.remove('grabbing');
    try { canvas.releasePointerCapture(drag.id); } catch (err) {}
}

canvas.addEventListener('pointerdown', e => {
    // A second finger means a pinch or a fumble, not a spin: let go of the
    // wheel where it is.
    if (drag.active && e.pointerId !== drag.id) { dropDrag(); return; }
    if (!canGrab() || !onDisc(e)) return;
    ensureAudio();
    e.preventDefault();
    drag.t0      = performance.now();
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

    // Pressed without really turning it? A quick tap spins it for them; a
    // finger left resting on the wheel does nothing.
    if (drag.moved < FLICK.tapArc && speed < FLICK.minVel) {
        if (now - drag.t0 <= 450) spin();
        return;
    }

    const power = Math.min(Math.max((speed - FLICK.minVel) / (FLICK.maxVel - FLICK.minVel), 0), 1);
    // Only a genuinely violent flick can tear the wheel loose, and even then
    // it's close to a coin flip - so it stays a surprise, not a routine.
    const pop = popOffEnabled && !prefersReducedMotion() && power >= FLICK.popPower &&
                Math.random() < chaosOdds('popoff', 0.35 + (power - FLICK.popPower) * 4);
    if (pop) noteChaos('popoff');

    const roll = Math.random();
    beginSpin({
        vel:    Math.max(speed, FLICK.minVel),
        dir:    vel < 0 ? -1 : 1,
        power,
        popOff: pop,
        stunt:  roll < 0.5 ? 'strobe' : roll < 0.75 ? 'roll' : 'bounce'
    });
}

canvas.addEventListener('pointerup', releaseDrag);
// A cancelled pointer (system gesture, lost contact) just drops the wheel
// where it is — an interrupted touch shouldn't fling it.
canvas.addEventListener('pointercancel', e => {
    if (!drag.active || e.pointerId !== drag.id) return;
    dropDrag();
});
// If the browser takes the pointer away without a pointerup, the drag must
// not stay stuck on: that would leave SPIN silently doing nothing.
canvas.addEventListener('lostpointercapture', e => {
    if (drag.active && e.pointerId === drag.id) dropDrag();
});

/* ══════════════════════════════════════
   Pop-off - the wheel leaves the building
   ─────────────────────────────────────
   Only the presentation flies: `rotation` keeps ticking down the exact same
   curve underneath, so the wheel re-seats and lands on the winner that was
   already drawn. Bounces are viewport-bounded, so it can't sail off-screen.
══════════════════════════════════════ */
const popOff = { active: false };
const DISC   = R / (SIZE / 2);      // the drawn wheel's share of the canvas box

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
    app.classList.add('popping');
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
    const halfW = (r.width  / 2) * DISC * popOff.sx;
    const halfH = (r.height / 2) * DISC * popOff.sy;
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

        const halfW = (r.width  / 2) * DISC * popOff.scale;
        const halfH = (r.height / 2) * DISC * popOff.scale;
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
    app.classList.remove('popping');
    const ring = document.createElement('div');
    ring.className = 'reseat-ring';
    wheelWrap.appendChild(ring);
    setTimeout(() => ring.remove(), 520);
    playReseatSound();
    shakeWheel();
    redraw();                                  // the pointer comes back
}

/* ══════════════════════════════════════
   Strobe - too fast to see straight
   ─────────────────────────────────────
   The other way a monster flick can go: the wheel stays on its hub and
   turns so fast it strobes, like a car wheel on film. It seems to slow,
   stop, crawl backwards and surge forwards again, while the pegs scream,
   the bulbs race and a whine tells you how fast it is really going.

   Only the picture lies. `rotation` runs the same curve underneath, and
   the picture's lag behind it is solved up front to come out a whole
   number of turns, so the moment the strobe lets go the wheel you see is
   exactly the wheel that was drawn. Like a real strobe, how often it seems
   to change direction follows how fast the real wheel is slowing.
══════════════════════════════════════ */
const STROBE = {
    delay:      280,     // ms of honest flat-out spin before the eye loses it
    rampIn:     450,     // ms from a blur to the strobe
    rampOut:    600,     // ms for the eye to catch the real wheel again
    letGo:      0.012,   // rad/ms - slower than this and it can't strobe (~2 turns a second)
    minHold:    1600,    // ms - a flick that can't strobe this long pops off instead
    drift:      0.0045,  // rad/ms - how fast it seems to crawl, either way (~0.7 turns a second)
    cycles:     [3, 4],  // forward-back-forward swings: one of these, at random
    ghosts:     3,       // extra exposures smeared along the real direction
    smear:      0.035,   // rad between exposures
    ghostAlpha: 0.2,
    step:       4        // ms - resolution of the solved picture
};
const strobe = { off: 0, mix: 0, dir: 1, whine: null };

// The picture for a whole spin, or null if this flick can't hold the
// speed long enough to strobe.
function planStrobe(totalRot, duration, ease, dir) {
    const TAU  = 2 * Math.PI, h = 1e-4;
    const real = ms => {                                       // signed rad/ms at ms
        const t = Math.min(Math.max(ms / duration, h), 1 - h);
        return totalRot * (ease(t + h) - ease(t - h)) / (2 * h) / duration;
    };
    const holdAt = STROBE.delay + STROBE.rampIn;
    let letGoAt = holdAt;
    while (letGoAt < duration && Math.abs(real(letGoAt)) > STROBE.letGo) letGoAt += STROBE.step;
    letGoAt = Math.min(letGoAt, duration - STROBE.rampOut - 900);
    if (letGoAt - holdAt < STROBE.minHold) return null;

    const fast = Math.abs(real(holdAt)), slow = Math.abs(real(letGoAt));
    const cycles = STROBE.cycles[Math.floor(Math.random() * STROBE.cycles.length)];
    const endAt  = letGoAt + STROBE.rampOut;
    const smooth = u => { u = Math.min(Math.max(u, 0), 1); return u * u * (3 - 2 * u); };
    const mixAt  = ms => smooth((ms - STROBE.delay) / STROBE.rampIn) * (1 - smooth((ms - letGoAt) / STROBE.rampOut));
    // The swing is keyed to the real speed, not the clock: forwards at the
    // start and the finish, and through every stop and reversal between.
    const swing  = ms => Math.cos(2 * Math.PI * cycles * (fast - Math.abs(real(ms))) / (fast - slow));

    // March the picture's lag behind the real wheel across the strobe...
    const n = Math.ceil(endAt / STROBE.step) + 1;
    const lag = new Float64Array(n), weight = new Float64Array(n), sw = new Float64Array(n);
    for (let i = 1; i < n; i++) {
        const mid = (i - 0.5) * STROBE.step, m = mixAt(mid);
        lag[i]    = lag[i - 1] + m * (dir * STROBE.drift * swing(mid) - real(mid)) * STROBE.step;
        weight[i] = weight[i - 1] + m * STROBE.step;
        sw[i]     = swing(i * STROBE.step);
    }
    // ...then lean on it, a hair at a time, until it ends on whole turns.
    const fix = (Math.round(lag[n - 1] / TAU) * TAU - lag[n - 1]) / weight[n - 1];
    for (let i = 0; i < n; i++) lag[i] += fix * weight[i];

    return { duration, endAt, dir, lag, sw, mixAt, real, started: false };
}

function stepStrobe(run, t) {
    const ms = t * run.duration;
    if (ms >= run.endAt) { endStrobe(); return; }
    const u = ms / STROBE.step, i = Math.floor(u), k = u - i;
    strobe.off = run.lag[i] + (run.lag[i + 1] - run.lag[i]) * k;
    strobe.mix = run.mixAt(ms);
    strobe.dir = run.dir;
    if (!run.started && strobe.mix > 0) { run.started = true; startWhine(); }
    setWhine(Math.abs(run.real(ms)), strobe.mix, run.sw[i]);
}

function endStrobe() {
    strobe.off = 0; strobe.mix = 0;
    stopWhine();
}
