function showIllegalStamp() {
    const stamp = document.getElementById('illegalStamp');
    stamp.classList.remove('out');
    stamp.classList.add('show');
    playBuzzer();
    playStampSound();
    // It counts as a spin — it happened — but it never touches the draft.
    spinLog.spins++; spinLog.illegal++;
    phase = 'illegal'; activePowerUp = null; stunt = null;
    announce(autoSpin ? 'Illegal spin. Re-spinning.' : 'Illegal spin. No pick. Spin again.', 'spin');
    commit();
    setTimeout(guarded(() => {
        stamp.classList.remove('show');
        stamp.classList.add('out');
        setTimeout(guarded(() => {
            stamp.classList.remove('out');
            isSpinning = false;
            sliceWeights = null;          // clear any power-up sizing before the retry
            spinSeg = null;               // ...and the slices the void spin was drawn on
            phase = 'ready';
            redraw();
            commit({ save: false });
            // Illegal spins are a no-op retry — keep an active autospin alive
            if (autoSpin && names.length >= 2) queueAutoSpin(600);
        }), 480);
    }), 2600);
}

/* ── Takeovers ──
   The PANIC games take the whole screen. While one is up the app behind it
   is inert, focus sits on the takeover itself, and it goes back where it
   was afterwards. (No One Is Safe plays on the stage instead: see below.)
   Focus is NOT put on Skip: the Space or Enter that spun the wheel, or the
   click meant for SPIN a moment too late, would skip the game the instant
   it opened. For the same reason Skip ignores presses for its first beat. */
const SKIP_GRACE_MS = 1000;
let takeoverReturn = null, takeoverAt = 0;
function openTakeover(el) {
    endWinnerMoment();
    // A dialog opened mid-spin would sit in the top layer, over the takeover
    // and its Skip button.
    document.querySelectorAll('dialog[open]').forEach(closeDialog);
    takeoverReturn = document.activeElement;
    takeoverAt = performance.now();
    app.inert = true;
    el.classList.add('show');
    const skip = el.querySelector('.skip-btn');
    if (skip) skip.hidden = false;
    try { el.focus({ preventScroll: true }); } catch (e) {}
}
function skipReady() { return performance.now() - takeoverAt >= SKIP_GRACE_MS; }
function closeTakeover(el) {
    el.classList.remove('show');
    app.inert = false;
    const back = takeoverReturn && document.contains(takeoverReturn) ? takeoverReturn : spinBtn;
    takeoverReturn = null;
    try { back.focus({ preventScroll: true }); } catch (e) {}
}


/* ══════════════════════════════════════
   Boost FX
══════════════════════════════════════ */

/* ── No One Is Safe ──
   Plays on the stage, not over it. The wheel turns over to show the
   drafted seats, under a red light, and spins once for one of them; the
   scoreboard, the board and the console stay up the whole time, so
   autospin can be switched on or off mid-event. The victim is drawn
   before the wheel moves: Esc only cuts the wait. SPIN is not Skip: it
   is the button everyone reaches for to spin again, and it was cutting
   the event short the moment it began. */
const SEAT_HOLD_MS = 1400;          // the seats on show before the spin
let noisSkipped = false;

function canSkipSeats() { return !!seatWheel && !seatWheel.victim && !noisSkipped; }
function skipSeats() {
    if (!canSkipSeats()) return;
    noisSkipped = true;
    commit({ save: false });
}

// Turn the wheel over, swapping what is on its face at the edge-on moment.
let flipTimer = null;
function flipWheel(swap) {
    clearTimeout(flipTimer);
    if (calmEffects()) { swap(); redraw(); return; }
    canvas.classList.remove('flip');
    void canvas.offsetWidth;
    canvas.classList.add('flip');
    flipTimer = setTimeout(guarded(() => { swap(); redraw(); }), 260);
}
canvas.addEventListener('animationend', e => { if (e.animationName === 'wheelFlip') canvas.classList.remove('flip'); });

// Clears the stage after the event, or after an error mid-event.
function endSeatStage() {
    seatWheel = null;
    wheelHighlight = null;
    delete app.dataset.event;
    winCallout.classList.remove('danger');
}

function showNoisWheel(replacementPick, onDone) {
    if (!draftOrder.length) { onDone&&onDone(); return; }
    isBusy = true;
    phase = 'nois';
    endWinnerMoment();
    // The event is the thing to watch: nothing stays in front of the wheel.
    document.querySelectorAll('dialog[open]').forEach(closeDialog);
    closeSheets(false);

    const candidates = draftOrder.map(p=>({name:p.name, color:p.color}));
    const seg = { labels: candidates.map(c => c.name), colors: candidates.map(c => c.color),
                  weights: candidates.map(() => 1), panicIndex: -1 };
    noisSkipped = false;
    app.dataset.event = 'nois';
    flipWheel(() => {
        seatWheel = { seg, by: replacementPick, victim: null, seat: 0, spinning: false };
        commit({ save: false });            // SPIN becomes Skip, the board's seats go at risk
    });
    runBanner('Plot twist', 'No one is safe', 1500, 'danger');
    playSeatAlarm();
    announce('No one is safe. Spinning for a drafted seat.');
    commit({ save: false });

    setTimeout(guarded(() => spinSeats(candidates, replacementPick, onDone)), calmEffects() ? 900 : SEAT_HOLD_MS);
}

function spinSeats(candidates, replacementPick, onDone) {
    const TAU        = 2*Math.PI;
    const victimIdx  = Math.floor(Math.random()*candidates.length);
    const arc        = TAU/candidates.length;
    // Kept off the dividers, like the main wheel, so the pointer is
    // never on the line between two seats.
    const landingPos = 0.12 + Math.random()*0.76;
    const victimMid  = (victimIdx + landingPos)*arc;
    const targetNorm = ((TAU - victimMid%TAU)+TAU)%TAU;
    const curNorm    = ((rotation%TAU)+TAU)%TAU;
    let delta = targetNorm - curNorm;
    if (delta<0) delta += TAU;

    const extraSpins = 5 + Math.floor(Math.random()*4);
    const totalRot   = extraSpins*TAU + delta;
    let   duration   = 4200 + Math.random()*2000;
    if (calmEffects()) duration = 2000;
    const startRot   = rotation, endRot = rotation+totalRot;
    const startTime  = performance.now();
    const ring       = pegRing(candidates.length);
    let lastTick     = Math.floor(rotation/ring.arc);
    let prevT        = startTime, prevRot = rotation;

    seatWheel.spinning = true;
    readoutAt = -1;                     // the readout names seats now, not wheel slots
    commit({ save: false });

    const frame = guarded(function (now) {
        const t = noisSkipped ? 1 : Math.min((now-startTime)/duration, 1);
        rotation = startRot + (endRot-startRot)*easeOut(t);
        redraw();
        chaseBulbs();
        showUnderPointer(seatWheel.seg);

        setTickSpeed((rotation - prevRot) / Math.max(now - prevT, 1));
        prevT = now; prevRot = rotation;

        const sIdx = Math.floor(rotation/ring.arc);
        if (sIdx!==lastTick) {
            const crossed = Math.min(Math.abs(sIdx-lastTick),2);
            for(let i=0;i<crossed;i++) playTick(i === 0 && isAccentPeg(sIdx, ring.per));
            lastTick=sIdx;
        }

        if (t<1) { requestAnimationFrame(frame); return; }
        rotation = endRot;
        seatLanded(candidates[victimIdx], replacementPick, onDone);
    });
    requestAnimationFrame(frame);
}

function seatLanded(victim, replacementPick, onDone) {
    const seatNo = draftOrder.findIndex(p => p.name === victim.name) + 1;
    Object.assign(seatWheel, { spinning: false, victim: victim.name, seat: seatNo });
    wheelHighlight = victim.name;
    redraw();

    setParts(winKicker, [`${ordinal(seatNo)} pick · `, { text: 'Undrafted', tag: 'span', cls: 'tag-out' }]);
    winName.textContent = victim.name;
    winSub.textContent  = replacementPick ? `${replacementPick.name} takes the seat` : 'Back on the wheel';
    winCallout.style.setProperty('--win', victim.color);
    winCallout.classList.add('danger', 'show');
    flashBulbs(victim.color);
    playStampSound();
    if (!calmEffects()) shakeWheel();
    announce(replacementPick
        ? `${victim.name} is undrafted. ${replacementPick.name} takes pick ${seatNo}.`
        : `${victim.name} is undrafted and back on the wheel.`);
    commit({ save: false });

    setTimeout(guarded(() => {
        const di=draftOrder.findIndex(p=>p.name===victim.name);
        if (di>=0) {
            if (replacementPick) draftOrder[di] = replacementPick;
            else draftOrder.splice(di,1);
        }
        names.push(victim.name);
        pendingPick = null;             // seated: saves no longer need to hold them
        draftHistory.push({ t: 'steal', seat: Math.max(di, 0), stealer: replacementPick ? replacementPick.name : null, victim: victim.name });
        spinLog.steals++;
        if (replacementPick) { lastPick = replacementPick.name; freshPick = replacementPick.name; }
        if (names.length < 2 && autoSpin) setAutoSpin(false);
        commit();

        // Back over to the table, with the victim on it. The console waits
        // for the face to change, so a spin can't start on the seats.
        hideWinCallout();
        flipWheel(() => {
            endSeatStage();
            isBusy = false;
            phase = 'ready';
            commit();
            onDone&&onDone();
        });
    }), noisSkipped ? 1200 : 2600);
}

/* ══════════════════════════════════════
   Marble race (PANIC slice)
   ─────────────────────────────────────
   Every drafted name becomes a marble dropped down a peg board. The first
   floor(n/2) to cross the finish are SAFE; the rest are undrafted back onto
   the wheel. Order is emergent from the physics — no rigging.
══════════════════════════════════════ */
const marbleOverlay  = document.getElementById('marbleOverlay');
const marbleCanvas   = document.getElementById('marbleCanvas');
const mctx           = marbleCanvas.getContext('2d');
const marbleRankList = document.getElementById('marbleRankList');
const marbleResultEl = document.getElementById('marbleResult');
const marbleSubtitle = document.getElementById('marbleSubtitle');
const marbleBoard    = marbleRankList.parentElement;
const marbleBoardTitle = document.getElementById('marbleBoardTitle');

// The race is a full-screen takeover, so the track is sized to the screen
// rather than pinned to the markup's 388x560 — on a wide monitor that left
// the field crammed into a strip down the middle.
let CANVAS_W = marbleCanvas.width;
let MH = marbleCanvas.height;
let SPRINT_PAD_L = 102;
const SPRINT_PAD_R = 24;                      // right margin past the finish
let TRACK_X0 = SPRINT_PAD_L, FINISH_X = CANVAS_W - SPRINT_PAD_R;
let lastRunners = null, lastSafeCount = 0;    // so a resize can redraw a finished race

let raceScale = 1;
// fit(w, h), if given, says how much of the h on offer the game wants.
function sizeMarbleCanvas(runnerCount, fit) {
    // Fit the track to whatever the takeover's middle row has room for, with
    // the finish board beside it on a wide screen and above it on a phone.
    // Whether the finish board sits beside the track or above it, and how
    // big it is, is the stylesheet's call: measure it rather than guess.
    const stageEl = marbleCanvas.parentElement;
    const stage  = stageEl.getBoundingClientRect();
    const sc     = getComputedStyle(stageEl);
    const wide   = sc.flexDirection.startsWith('row');
    const gap    = parseFloat(wide ? sc.columnGap : sc.rowGap) || 12;
    const boardW = wide ? marbleBoard.getBoundingClientRect().width + gap : 0;
    const boardH = wide ? 0 : (parseFloat(getComputedStyle(marbleBoard).maxHeight) || 96) + gap;
    // Lanes want about 95px each — past that a small field is just spread
    // thin down a tall canvas.
    const want = fit ? 900 : runnerCount ? runnerCount * 95 + 60 : 700;
    const w = Math.round(Math.max(280, Math.min((stage.width || window.innerWidth) - boardW, 1200)));
    let   h = Math.round(Math.max(200, Math.min((stage.height || window.innerHeight - 200) - boardH, want, 900)));
    if (fit) h = Math.round(Math.max(160, Math.min(h, fit(w, h))));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    raceScale = dpr;
    marbleCanvas.style.width = w + 'px';
    marbleCanvas.style.height = h + 'px';
    if (marbleCanvas.width === Math.round(w * dpr) && marbleCanvas.height === Math.round(h * dpr)) return;
    marbleCanvas.width  = Math.round(w * dpr);
    marbleCanvas.height = Math.round(h * dpr);
    CANVAS_W = w; MH = h;
    // Name column keeps its share of the width, so long names still fit.
    SPRINT_PAD_L = Math.round(Math.min(170, Math.max(96, w * 0.2)));
    TRACK_X0 = SPRINT_PAD_L;
    FINISH_X = w - SPRINT_PAD_R;
    if (wide) marbleBoard.style.maxHeight = h + 'px';
    else marbleBoard.style.maxHeight = '';
}

let   raceHurdles   = [];     // this race's rail positions along the track
let   hurdleFlash   = null;   // {name, color, at} for the on-canvas callout

function onPanicLanded() {
    sliceWeights = null;
    panicCooldown = true;       // no PANIC again until the next non-panic spin
    isSpinning = false;
    isBusy = true;              // block input through the whole event
    spinLog.spins++; spinLog.panics++;
    phase = 'panic'; activePowerUp = null; stunt = null;
    redraw();
    commit();                   // the cooldown is saved: a reload can't re-arm PANIC
    playPanicSound();
    setTimeout(guarded(startPanicGame), 650);
}

// PANIC plays one of two games, on a coin flip: the horse race, or the
// slot machines (js/slots.js). Same stakes, same takeover, same undo.
let panicGame = 'race';
function startPanicGame() {
    if (Math.random() < 0.5) startSlotRace(); else startMarbleRace();
}
// The takeover's furniture, set for whichever game is on.
function dressPanicGame(game, subtitle, boardTitle) {
    panicGame = game;
    marbleOverlay.dataset.game = game;
    marbleSubtitle.textContent = subtitle;
    marbleBoardTitle.textContent = boardTitle;
    marbleRankList.innerHTML = '';
    marbleResultEl.textContent = '';
    marbleOverlay.classList.remove('done');
    raceSkipped = false;
}


function mRoundRect(x, y, w, h, r) {
    mctx.beginPath();
    mctx.moveTo(x + r, y);
    mctx.arcTo(x + w, y, x + w, y + h, r); mctx.arcTo(x + w, y + h, x, y + h, r);
    mctx.arcTo(x, y + h, x, y, r);         mctx.arcTo(x, y, x + w, y, r);
    mctx.closePath();
}

// Sprint race: lanes drawn from scripted progress (r.p in 0..1). No physics,
// so runners always advance and always finish — nothing can stall or shaft.
function drawSprint(runners, safeCount, now) {
    mctx.setTransform(raceScale, 0, 0, raceScale, 0, 0);
    const n = runners.length;
    const laneTop = 16, laneH = (MH - 32) / n;
    const trackLen = FINISH_X - TRACK_X0;
    const hurdleXs = raceHurdles.map(h => TRACK_X0 + h * trackLen);
    now = now || performance.now();
    lastRunners = runners; lastSafeCount = safeCount;
    // Type and sprites grow with the track so a big screen isn't a small
    // race drawn far apart.
    const k = Math.min(Math.max(CANVAS_W / 388, 1), 1.7);

    const bg = mctx.createLinearGradient(0, 0, 0, MH);
    bg.addColorStop(0, '#0c0716'); bg.addColorStop(1, '#1a0f2a');
    mctx.fillStyle = bg; mctx.fillRect(0, 0, CANVAS_W, MH);

    // checkered finish line + glow band
    const sq = Math.round(10 * k);
    for (let yy = 0; yy < MH; yy += sq) {
        mctx.fillStyle = (Math.floor(yy / sq) % 2) ? '#e8e8e8' : '#15151c';
        mctx.fillRect(FINISH_X, yy, 6 * k, sq);
    }
    mctx.fillStyle = 'rgba(46,204,113,0.10)';
    mctx.fillRect(FINISH_X + 6 * k, 0, CANVAS_W - FINISH_X - 6 * k, MH);

    // hurdle markers running the height of the track
    mctx.save();
    mctx.setLineDash([5, 5]);
    mctx.strokeStyle = 'rgba(212,175,55,0.35)'; mctx.lineWidth = 1;
    hurdleXs.forEach(hx => {
        mctx.beginPath(); mctx.moveTo(hx, 0); mctx.lineTo(hx, MH); mctx.stroke();
    });
    mctx.restore();

    for (let i = 0; i < n; i++) {
        const r = runners[i];
        const yc = laneTop + (i + 0.5) * laneH;
        const hs = Math.max(15, Math.min(laneH * 0.85, 30 + CANVAS_W * 0.03));   // horse sprite size

        // lane guide
        mctx.strokeStyle = 'rgba(168,111,207,0.12)'; mctx.lineWidth = 1;
        mctx.beginPath(); mctx.moveTo(TRACK_X0, yc); mctx.lineTo(FINISH_X, yc); mctx.stroke();

        // pinned name chip on the left
        const chipH = Math.min(18 * k, laneH - 3);
        const fs = Math.max(8, Math.min(Math.round(12 * k), Math.floor(chipH - 2)));
        const maxChars = Math.round(9 * k);
        const nm = Array.from(r.pick.name).length > maxChars ? clip(r.pick.name, maxChars - 1) + '…' : r.pick.name;
        mctx.fillStyle = 'rgba(8,4,16,0.7)';
        mRoundRect(6, yc - chipH / 2, TRACK_X0 - 14, chipH, 4); mctx.fill();
        mctx.strokeStyle = now < r.stumbleUntil ? '#e74c3c' : r.color;
        mctx.lineWidth = now < r.stumbleUntil ? 2.5 : 1.5; mctx.stroke();
        mctx.fillStyle = '#e8dfc8'; mctx.font = `600 ${fs}px ${LABEL_FONT}`;
        mctx.textAlign = 'left'; mctx.textBaseline = 'middle';
        mctx.fillText(nm, 12, yc + 0.5);

        // posted jump odds — red the moment this horse clips anything
        const anyFell = r.results.indexOf('fell') >= 0;
        const allDone = r.next >= raceHurdles.length;
        mctx.fillStyle = anyFell ? 'rgba(192,57,43,0.95)'
                       : allDone ? 'rgba(46,204,113,0.75)'
                       : 'rgba(212,175,55,0.9)';
        mctx.font = `600 ${fs}px ${LABEL_FONT}`;
        mctx.textAlign = 'right';
        mctx.fillText(Math.round(r.jump * 100) + '%', TRACK_X0 - 10, yc + 0.5);
        mctx.textAlign = 'left';

        const ox = TRACK_X0 + Math.min(1, r.p) * trackLen;

        // This lane's rails: upright until this horse knocks one flat.
        const railH = Math.min(laneH * 0.5, 18 * k);
        hurdleXs.forEach((hx, hi) => {
            const res = r.results[hi];
            mctx.save();
            mctx.translate(hx, yc + railH * 0.35);
            if (res === 'fell') mctx.rotate(1.12);                // knocked over
            mctx.fillStyle = res === 'fell' ? '#7a2a22' : '#c9a227';
            mctx.fillRect(-1.5 * k, -railH, 3 * k, railH);        // post
            mctx.fillStyle = res === 'fell' ? '#a33a2c' : '#f0e6c0';
            mctx.fillRect(-6 * k, -railH, 12 * k, 3 * k);         // top rail
            mctx.restore();
        });

        // Airborne over the rail it is at, or pitching forward into it.
        let yOff = 0, pitch = 0;
        const lastIdx = r.next - 1;
        if (lastIdx >= 0) {
            const near = (r.p - (raceHurdles[lastIdx] - HURDLE_LEAD)) / (2 * HURDLE_LEAD);
            if (r.results[lastIdx] === 'clear' && near >= 0 && near <= 1) {
                // Capped against the lane height so a leap doesn't land in
                // the lane above on a big screen.
                yOff  = -Math.sin(Math.PI * near) * Math.min(hs * 0.85, laneH * 0.42);
                pitch = -Math.sin(Math.PI * near) * 0.42;
            } else if (r.results[lastIdx] === 'fell' && now - r.fellAt < 700) {
                const u = (now - r.fellAt) / 700;
                yOff  = Math.sin(Math.PI * u) * hs * 0.16;
                pitch = Math.sin(Math.PI * u) * 0.5;
            }
        }

        // A clipped rail throws up dust at the point of contact.
        if (r.fellAt && now - r.fellAt < 620 && lastIdx >= 0) {
            const u = (now - r.fellAt) / 620;
            mctx.save();
            mctx.globalAlpha = (1 - u) * 0.5;
            mctx.fillStyle = '#c0392b';
            for (let d = 0; d < 7; d++) {
                const a  = d * 0.9 + (r.fellAt % 10) * 0.3;
                const dd = u * hs * (0.5 + (d % 3) * 0.3);
                mctx.beginPath();
                mctx.arc(hurdleXs[lastIdx] + Math.cos(a) * dd,
                         yc + Math.sin(a) * dd * 0.6, (1 - u) * 3 * k, 0, 2 * Math.PI);
                mctx.fill();
            }
            mctx.restore();
        }

        const slowed = now < r.stumbleUntil;

        // dust trail behind the horse
        const trail = Math.max(30, trackLen * 0.055);
        const grd = mctx.createLinearGradient(ox - trail, 0, ox, 0);
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, r.color);
        mctx.strokeStyle = grd; mctx.globalAlpha = 0.45; mctx.lineWidth = hs * 0.3;
        mctx.beginPath(); mctx.moveTo(Math.max(TRACK_X0, ox - trail), yc + hs * 0.2); mctx.lineTo(ox, yc + hs * 0.2); mctx.stroke();
        mctx.globalAlpha = 1;

        // colored glow under the horse (player ID)
        const glow = mctx.createRadialGradient(ox, yc + yOff, 1, ox, yc + yOff, hs * (slowed ? 0.8 : 0.6));
        glow.addColorStop(0, slowed ? '#e74c3c' : r.color); glow.addColorStop(1, 'rgba(0,0,0,0)');
        mctx.globalAlpha = slowed ? 0.75 : (r.finished ? 0.55 : 0.4);
        mctx.fillStyle = glow; mctx.beginPath(); mctx.arc(ox, yc + yOff, hs * 0.6, 0, 2 * Math.PI); mctx.fill();
        mctx.globalAlpha = 1;

        // horse sprite — flipped to gallop toward the finish (right)
        mctx.save();
        mctx.translate(ox, yc + yOff); mctx.rotate(pitch); mctx.scale(-1, 1);
        mctx.font = `${Math.round(hs)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif`;
        mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
        mctx.fillText('🐎', 0, 0);
        mctx.restore();

        // SLOWED tag for as long as the stumble lasts
        if (slowed) {
            mctx.save();
            mctx.font = `700 ${Math.max(11, Math.round(11 * k))}px ${LABEL_FONT}`;
            mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
            const label = 'SLOWED';
            const tw = mctx.measureText(label).width + 10 * k;
            const ty = yc - hs * 0.75;
            mctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(now / 140));
            mctx.fillStyle = '#c0392b';
            mRoundRect(ox - tw / 2, ty - 7 * k, tw, 14 * k, 4); mctx.fill();
            mctx.fillStyle = '#fff';
            mctx.fillText(label, ox, ty + 0.5);
            mctx.restore();
        }

        // rank badge for safe finishers
        if (r.finished && r.safeRank) {
            const bx = ox + hs * 0.42, byc = yc - hs * 0.42;
            mctx.fillStyle = '#1e8449'; mctx.beginPath(); mctx.arc(bx, byc, 7 * k, 0, 2 * Math.PI); mctx.fill();
            mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.stroke();
            mctx.fillStyle = '#fff'; mctx.font = `700 ${Math.max(11, Math.round(11 * k))}px ${LABEL_FONT}`;
            mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillText(r.safeRank, bx, byc + 0.5);
        }
    }

    // "X clips the hurdle!" for a moment after it happens
    if (hurdleFlash && now - hurdleFlash.at < 1400) {
        const fade = 1 - (now - hurdleFlash.at) / 1400;
        mctx.save();
        mctx.globalAlpha = Math.min(1, fade * 2.2);
        mctx.font = `600 ${Math.max(13, Math.round(14 * k))}px ${LABEL_FONT}`;
        mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
        const msg = hurdleFlash.name + ' clips the hurdle!';
        const w = mctx.measureText(msg).width + 16 * k;
        mctx.fillStyle = 'rgba(10,4,16,0.85)';
        mRoundRect(CANVAS_W / 2 - w / 2, 4, w, 20 * k, 6); mctx.fill();
        mctx.strokeStyle = hurdleFlash.color; mctx.lineWidth = 1.5; mctx.stroke();
        mctx.fillStyle = '#e8dfc8';
        mctx.fillText(msg, CANVAS_W / 2, 4 + 10 * k);
        mctx.restore();
    }

    // vertical FINISH label up the right edge
    mctx.save();
    mctx.translate(FINISH_X + 16, MH - 8); mctx.rotate(-Math.PI / 2);
    mctx.fillStyle = 'rgba(46,204,113,0.85)'; mctx.font = `600 ${Math.max(12, Math.round(12 * k))}px ${LABEL_FONT}`;
    mctx.textAlign = 'left'; mctx.textBaseline = 'middle';
    mctx.fillText('FINISH', 0, 0); mctx.restore();
}

function addMarbleRankRow(m, rank, isSafe, safeCount) {
    if (rank === safeCount + 1) {
        const cut = document.createElement('li');
        cut.className = 'marble-cutoff';
        cut.textContent = '— safe cutoff —';
        marbleRankList.appendChild(cut);
    }
    const li = document.createElement('li');
    li.className = 'marble-rank-item ' + (isSafe ? 'safe' : 'out');
    li.style.setProperty('--mc', m.color);
    const num = document.createElement('span'); num.className = 'marble-rank-num'; num.textContent = rank;
    const nm  = document.createElement('span'); nm.className = 'marble-rank-name'; nm.textContent = m.pick.name;
    const tag = document.createElement('span'); tag.className = 'marble-rank-tag'; tag.textContent = isSafe ? 'Safe' : 'Out';
    li.append(num, nm, tag);
    marbleRankList.appendChild(li);
    marbleBoard.scrollTop = marbleBoard.scrollHeight;
}

function startMarbleRace() {
    const racers = draftOrder.slice();
    if (racers.length < 2) { endMarbleRace(); return; }
    // Majority always survives: only ceil(n/2)-1 (min 1) are at risk of dropping.
    const outCount  = panicOut(racers.length);
    const safeCount = racers.length - outCount;

    raceHurdles = makeHurdles();          // before the subtitle counts them
    hurdleFlash = null;
    dressPanicGame('race', `${racers.length} running · ${raceHurdles.length} hurdles · first ${safeCount} across are safe, last ${outCount} drop out`,
                   'Finish order');
    openTakeover(marbleOverlay);
    sizeMarbleCanvas(racers.length);
    announce(`Panic. Horse race: ${racers.length} running, first ${safeCount} are safe.`);
    // Calm effects run the race at double pace rather than not at all: it
    // is the same steps and the same dice, so the same result odds, and a
    // race that is never seen reads as one that broke.
    const pace = calmPace();
    playStartBell();

    // Each runner advances by a scripted, always-positive amount whose "form"
    // drifts (plus random surges) — that's what creates lead changes.
    const runners = racers.map(pick => ({
        pick, color: pick.color,
        p: 0, form: (Math.random() - 0.5) * 0.3,
        talent: 0.82 + Math.random() * 0.36,        // fixed speed edge → a real field spread
        jump: 0.62 + Math.random() * 0.33,          // posted odds at every rail
        results: [],                                // per rail: 'clear' | 'fell'
        next: 0,                                    // the rail it is running at
        fellAt: 0, stumbleUntil: 0, speed: SPRINT_BASE,
        finished: false, safeRank: null,
    }));

    let frames = 0, hoof = 0, nextHoof = 0;
    const MAXF = 3900;                  // ~65s hard cap (races naturally end ~19-30s)
    // The race advances in fixed 60Hz steps whatever the screen's refresh
    // rate, so a 120Hz phone runs the same race — same odds, same stumbles —
    // as the 60Hz screen it was tuned on.
    const STEP = 1000 / 60;
    let simNow = 0, lastReal = 0, over = false;
    const safe = [];                    // runners that claimed a SAFE spot, in finish order

    // Take-off. The posted chance is what the horse is worth on a level
    // run; the speed it is actually carrying is what it pays to get over.
    function takeHurdle(r, fieldSpeed, now) {
        const idx = r.next++;
        if (Math.random() < hurdleOdds(r.jump, r.speed, fieldSpeed)) {
            r.results[idx] = 'clear';
            return;
        }
        r.results[idx] = 'fell';
        r.fellAt       = now;
        r.p            = Math.max(0, r.p - 0.012);   // knocked back into the rail
        r.form         = -0.5;
        r.stumbleUntil = now + STUMBLE_MS;
        hurdleFlash    = { name: r.pick.name, color: r.color, at: now };
        playHurdleHit();
    }

    // Decided the instant the safe quota fills — everyone still running is OUT.
    function finishRace() {
        over = true;
        document.getElementById('marbleSkip').hidden = true;
        const rest = runners.filter(r => !safe.includes(r)).sort((a, b) => b.p - a.p);
        while (safe.length < safeCount && rest.length) {      // rare failsafe
            const r = rest.shift(); safe.push(r); r.safeRank = safe.length;
            addMarbleRankRow(r, safe.length, true, safeCount);
        }
        rest.forEach((r, i) => addMarbleRankRow(r, safeCount + 1 + i, false, safeCount));
        drawSprint(runners, safeCount, simNow);
        // The verdict shows the survivors first, wherever the board had
        // scrolled to while the field came in.
        marbleOverlay.classList.add('done');
        marbleBoard.scrollTop = 0;
        setTimeout(guarded(() => resolveMarbleRace(safe.map(r => r.pick), rest.map(r => r.pick))), 1100);
    }

    // One 60Hz step of the race. `now` is race time, not wall time.
    function step(now, quiet) {
        frames++;

        // Work out everyone's speed for this frame first — the hurdle needs
        // to compare a horse against the field it is actually running in.
        let speedSum = 0, speedN = 0;
        for (const r of runners) {
            if (r.finished) continue;
            r.form += (Math.random() - 0.5) * 0.05;
            if (Math.random() < 0.012) r.form += Math.random() * 0.5;   // a sudden surge
            r.form = Math.max(-0.55, Math.min(0.9, r.form));
            // A clipped rail costs speed, easing back to full over ~1s.
            const left = r.stumbleUntil - now;
            const hurt = left > 0 ? 0.45 + 0.55 * (1 - left / STUMBLE_MS) : 1;
            r.speed = SPRINT_BASE * r.talent * (1 + r.form) * hurt;     // always > 0
            speedSum += r.speed; speedN++;
        }
        const fieldSpeed = speedN ? speedSum / speedN : SPRINT_BASE;

        for (const r of runners) {
            if (r.finished) continue;
            r.p += r.speed;
            const rail = raceHurdles[r.next];
            if (rail !== undefined && r.p >= rail - HURDLE_LEAD) takeHurdle(r, fieldSpeed, now);
            if (r.p >= 1) {
                r.p = 1; r.finished = true;
                if (safe.length < safeCount) {                          // grabbed a safe spot
                    safe.push(r); r.safeRank = safe.length;
                    addMarbleRankRow(r, safe.length, true, safeCount);
                    if (!quiet) playFinishBell(safe.length);
                }
            }
        }
        // The field's hoofbeats: a gallop is three hooves and a gap.
        if (!quiet && now >= nextHoof) {
            playHoofbeat(hoof === 2 ? 1 : 0.6);
            hoof = (hoof + 1) % 3;
            nextHoof = now + (hoof === 0 ? 200 : 72);
        }
        return safe.length >= safeCount || frames >= MAXF;
    }

    function frame(real) {
        if (over) return;
        try {
            if (raceSkipped) {
                // Skip runs the very same race to the end without drawing it:
                // the same steps and the same dice, so the same result odds.
                while (!step(simNow += STEP, true)) {}
                finishRace();
                return;
            }
            if (!lastReal) lastReal = real - STEP;
            let todo = Math.min(Math.round((real - lastReal) / STEP), 8);
            lastReal += todo * STEP;
            if (real - lastReal > STEP * 8) lastReal = real;        // a hidden tab: don't sprint to catch up
            todo *= pace;
            while (todo-- > 0) { if (step(simNow += STEP, false)) { drawSprint(runners, safeCount, simNow); finishRace(); return; } }
            drawSprint(runners, safeCount, simNow);
            requestAnimationFrame(frame);
        } catch (err) { console.error(err); finishRace(); }
    }
    requestAnimationFrame(frame);
}

let raceSkipped = false;
// Calm effects: how many race steps each frame runs. Both games use it.
function calmPace() { return calmEffects() ? 2 : 1; }
document.getElementById('marbleSkip').addEventListener('click', () => { if (skipReady()) raceSkipped = true; });

function resolveMarbleRace(safe, doomed) {
    marbleResultEl.textContent = doomed.length
        ? `${doomed.length} undrafted! ${safe.length} survive the panic.`
        : 'Everyone survived!';
    const what = panicGame === 'slots' ? 'Slots' : 'Race';
    announce(doomed.length
        ? `${what} over. Safe: ${safe.map(p => p.name).join(', ')}. Back on the wheel: ${doomed.map(p => p.name).join(', ')}.`
        : `${what} over. Everyone survived.`);
    playFanfare(2600);

    setTimeout(guarded(() => {
        // Remember every seat before it empties, so Undo can put the whole
        // race back exactly as it was.
        const out = doomed.map(pick => ({ name: pick.name, seat: draftOrder.findIndex(p => p.name === pick.name) }))
                          .filter(o => o.seat >= 0);
        doomed.forEach(pick => {
            const di = draftOrder.findIndex(p => p.name === pick.name);
            if (di >= 0) draftOrder.splice(di, 1);
            if (!names.some(n => n.toLowerCase() === pick.name.toLowerCase())) names.push(pick.name);
        });
        if (out.length) draftHistory.push({ t: 'panic', out });
        endMarbleRace();
    }), 1900);
}

function endMarbleRace() {
    closeTakeover(marbleOverlay);
    isBusy = false;
    phase = 'ready';
    spinSeg = null;             // the slices the PANIC landing was drawn on
    if (names.length < 2 && autoSpin) setAutoSpin(false);
    redraw();
    commit();
    if (autoSpin && names.length >= 2) queueAutoSpin(1400);
}

/* ── Draft complete ── */
const splashOverlay = document.getElementById('splashOverlay');
const splashList    = document.getElementById('splashList');

document.getElementById('splashClose').addEventListener('click', () => closeDialog(splashOverlay));
document.getElementById('splashCopy').addEventListener('click', e => copyDraft(e.currentTarget));

function showSplash() {
    if (draftOrder.length === 0) return;
    endWinnerMoment();
    const slots = getWinnerSlots();
    const rankClass = ['gold', 'silver', 'bronze'];

    splashList.innerHTML = '';
    splashList.classList.toggle('cols', draftOrder.length > 8);
    draftOrder.forEach((pick, i) => {
        const item = document.createElement('li');
        item.className = 'splash-item';
        item.style.setProperty('--c', pick.color);
        item.style.setProperty('--delay', `${Math.min(0.1 + i * 0.06, 1.2)}s`);

        const rank = document.createElement('span');
        rank.className = `splash-rank ${rankClass[i] || ''}`;
        rank.textContent = ordinal(i + 1);

        const name = document.createElement('span');
        name.className = 'splash-name';
        name.textContent = pick.name;

        const tag = document.createElement('span');
        tag.className = 'splash-tag';
        tag.textContent = i < slots ? 'Winner' : '';

        item.append(rank, name, tag);
        splashList.appendChild(item);
    });
    announce(`Draft complete. ${draftOrder.length} picks. Winner${slots > 1 ? 's' : ''}: ${draftOrder.slice(0, slots).map(p => p.name).join(', ')}.`);

    // a moment for the nameplate to clear first
    setTimeout(() => openDialog(splashOverlay, spinBtn), 500);
}

// One banner, three events — each names itself on the way in.
// variant: 'gremlin' (stands clear of him) or 'danger' (No One Is Safe).
function runBanner(kicker, label, holdMs, variant) {
    const el = document.getElementById('windBackPopup');
    el.querySelector('.wb-kicker').textContent = kicker;
    el.querySelector('.wb-label').textContent  = label;
    ['gremlin', 'danger'].forEach(v => el.classList.toggle(v, v === variant));
    el.classList.remove('in', 'hold', 'out');
    void el.offsetWidth;
    el.classList.add('in');
    setTimeout(() => {
        el.classList.remove('in');
        el.classList.add('hold');
        setTimeout(() => {
            el.classList.remove('hold');
            el.classList.add('out');
            setTimeout(() => el.classList.remove('out'), 460);
        }, holdMs);
    }, 520);
}

function showWindBackBanner() { runBanner('Not so fast', 'Wind-back', 1500); }

/* ── The gremlin's beats ──
   He turns up once, shoves a handful of times, and the last shove is him
   letting go: he is off the rim before the wheel has finished settling, so
   whatever it lands on, it landed on by itself. */
const goblinEl = document.getElementById('goblin');

let goblinFaceTimer = null, goblinLetGoTimer = null;

function goblinFace(face, revertAfter) {
    clearTimeout(goblinFaceTimer);
    goblinEl.dataset.face = face;
    if (revertAfter) goblinFaceTimer = setTimeout(() => { goblinEl.dataset.face = 'grin'; }, revertAfter);
}

function triggerGoblinBeat(kind) {
    if (kind === 'arrive') {
        showGoblin();
        // Met him: from now on he keeps to his ordinary odds on this device.
        if (!goblinSeen) { goblinSeen = true; commit(); }
        return;
    }

    // FAKE STOP. One last little nudge, then his hands come off the rim and
    // he looks anywhere but at the wheel while it crawls to a halt on its
    // own. Everything after this point depends on you believing it.
    if (kind === 'fade') {
        goblinFace('grin');
        jerkGoblin('shove');
        playGoblinShove('shove');
        goblinLetGoTimer = setTimeout(() => {
            goblinFace('innocent');
            goblinEl.classList.add('hands-off');
            playGoblinLetGo();
        }, 240);
        return;
    }

    clearTimeout(goblinLetGoTimer);               // whatever he does next, he is holding it again
    goblinEl.classList.remove('hands-off');

    if (kind === 'gotcha') {                      // ...and it was never going to stop
        goblinFace('cackle', 1000);
        jerkGoblin('shove');
        playGoblinShove('gotcha');
        playGoblinCackle(4);
        return;
    }
    if (kind === 'tease') {                       // dragging it the wrong way, delighted
        goblinFace('cackle', 900);
        jerkGoblin('tease');
        playGoblinShove('tease');
        return;
    }
    if (kind === 'release') {                     // the real one — he is gone before it lands
        goblinFace('cackle');
        jerkGoblin('release');
        playGoblinShove('release');
        playGoblinCackle(8);
        setTimeout(hideGoblin, 300);
        return;
    }
    goblinFace('strain', 420);
    jerkGoblin('shove');
    playGoblinShove('shove');
}

function showGoblin() {
    goblinEl.classList.remove('in', 'out', 'hands-off');
    goblinFace('grin');
    void goblinEl.offsetWidth;
    goblinEl.classList.add('in');
    playGoblinArrive();
    shakeWheel();
    runBanner('Uninvited', 'Gremlin', 1250, 'gremlin');
    // Once per spin and never again until the result: announcing his fake
    // stops would spoil them, and would be a lie.
    stunt = 'gremlin';
    announce('A gremlin has grabbed the wheel.');
    commit({ save: false });
}

function jerkGoblin(kind) {
    const el = goblinEl.querySelector('.gob-jerk');
    el.className = 'gob-jerk';
    void el.offsetWidth;
    el.classList.add(kind);
}

function hideGoblin() {
    clearTimeout(goblinFaceTimer); clearTimeout(goblinLetGoTimer);
    goblinEl.classList.remove('hands-off');
    if (!goblinEl.classList.contains('in')) return;   // never arrived, or already leaving
    goblinEl.classList.remove('in');
    goblinEl.classList.add('out');
    setTimeout(() => goblinEl.classList.remove('out'), 560);
}

// The wheel had stopped, and something has just shoved it the other way.
function triggerWindBack() {
    stunt = 'windback';
    announce('Wind-back. The wheel is going round the other way.');
    commit({ save: false });
    showWindBackBanner();
    playWindBack();
    playShove();
    if (calmEffects()) return;                // the stunt still runs; the pyrotechnics don't
    shakeWheel();
    flashScreen();
    launchBoostElements();
    for (let i = 0; i < 60; i++) {            // brief fire surge
        const W = fireCanvas.width;
        spawnFlame(Math.random()*W, -(Math.random()*9+5), Math.random()*28+16);
    }
    startFire();
}


/* ══════════════════════════════════════
   Win
══════════════════════════════════════ */
/* The landing gets its moment ON the stage: the winning slice lights up,
   everything else dims, and a nameplate rises over the lower third of the
   wheel. Nothing blacks out — the scoreboard and the board stay lit, and
   update the moment the pick is in. */
/* ── The winner moment ──
   The nameplate holds for at least PLATE_MIN_MS from the landing, even on a
   big table whose pick is seated sooner: the game's own pacing is
   untouched, the room just gets long enough to read the name. Until it
   goes, the wheel stays drawn exactly as it landed, the winner lit. It goes
   the moment anything else happens: the next spin, a takeover, the splash,
   any change to the table. A display time set by hand is kept exactly. */
const PLATE_MIN_MS = 2400;
let plateHold = null;               // { timer, key } while a seated pick's plate lingers
function tableKey() { return names.join('\u0001') + '|' + draftOrder.map(p => p.name).join('\u0001'); }
function holdPlate(ms) {
    if (ms <= 0) { endWinnerMoment(); return; }
    plateHold = { key: tableKey(), timer: setTimeout(endWinnerMoment, ms) };
}
function endWinnerMoment() {
    if (plateHold) { clearTimeout(plateHold.timer); plateHold = null; }
    if (landed) return;                   // still landing: the seat isn't filled yet
    hideWinCallout();
    if (!isSpinning && (wheelHighlight || spinSeg)) { wheelHighlight = null; spinSeg = null; redraw(); }
}

function onSpinEnd(winnerIdx) {
    sliceWeights = null;                  // power-up sizing only lasts for its spin
    panicCooldown = false;                // a normal pick clears the no-back-to-back-PANIC lock
    const name=names[winnerIdx], c=colorOf(name);
    const pickNo = draftOrder.length + 1;
    const inSlots = pickNo <= getWinnerSlots();
    const showMs  = winnerDisplayMs();
    const plateMs = autoDisplay ? Math.max(showMs, PLATE_MIN_MS) : showMs;
    spinLog.spins++;
    phase = 'landed'; activePowerUp = null; stunt = null;
    landed = { name, color: c, pick: pickNo, winner: inSlots };
    wheelHighlight = name;
    redraw();
    // One draw for the line, whichever list it comes from, so the random
    // sequence stays the one it has always been.
    const lines = inSlots ? CONGRATS : CONSOLATION;
    showWinCallout(name, c, pickNo, inSlots, lines[Math.floor(Math.random()*lines.length)]);
    flashBulbs(c);
    announce(autoSpin ? `Pick ${pickNo}: ${name}.`
                      : `Pick ${pickNo}: ${name}.${inSlots ? ' Winner.' : ''} ${names.length - 1} left on the wheel.`, 'spin');
    playReveal(showMs, inSlots);
    launchConfetti(c);
    commit({ save: false });

    setTimeout(guarded(()=>{
        if (plateMs <= showMs) hideWinCallout();
        setTimeout(guarded(()=>{
            const selectedPick = {name,color:c};
            names.splice(winnerIdx,1);
            landed = null;
            isSpinning=false;
            const hasNames=names.length>0;
            // "No one is safe" (15% of picks at Normal chaos) — needs an
            // existing drafted seat to replace
            const triggerNois = noisEnabled && hasNames && draftOrder.length >= 1 && Math.random() < chaosOdds('nois');

            if (triggerNois) {
                noteChaos('nois');
                isBusy = true;
                phase = 'nois';
                // Off the wheel, not yet in a seat: any save from here on
                // puts them back on the wheel, so a reload can't lose them.
                pendingPick = selectedPick;
                commit({ save: false });
                setTimeout(guarded(() => showNoisWheel(selectedPick, () => {
                    // After undraft: resume auto-spin if on and names remain
                    if (autoSpin && names.length >= 2) queueAutoSpin(1400);
                })), 700);
            } else {
                draftOrder.push(selectedPick);
                const ev = { t: 'pick', names: [name] };
                if (names.length === 1) {
                    // The last name standing comes with this pick — and goes
                    // with it if the pick is undone, instead of stranding a
                    // one-name wheel.
                    const finalName = names[0], finalColor = colorOf(finalName);
                    draftOrder.push({name: finalName, color: finalColor});
                    ev.names.push(finalName);
                    names.splice(0,1);
                }
                draftHistory.push(ev);
                lastPick = freshPick = ev.names[ev.names.length - 1];
                phase = 'ready';
                const stillHasNames=names.length>0;
                if (!stillHasNames&&autoSpin) setAutoSpin(false);
                redraw();
                commit();
                holdPlate(plateMs - showMs - 380);
                if (!stillHasNames) {
                    showSplash();
                } else if (autoSpin) {
                    queueAutoSpin(1400);
                }
            }
        }),380);
    }), showMs);
}

/* ══════════════════════════════════════
   Auto spin
══════════════════════════════════════ */
// A queued auto-spin asks again on the way in: switching autospin off
// during the winner card has to stop the next one, not just the one after.
function queueAutoSpin(ms) {
    setTimeout(() => {
        if (autoSpin && names.length >= 2 && !isSpinning && !isBusy) beginSpin(null, true);
    }, ms);
}

let wakeLock = null;
function setAutoSpin(val) {
    autoSpin=val;
    autoBtn.setAttribute('aria-pressed', String(autoSpin));
    autoLabel.textContent = autoSpin ? 'Stop' : 'Auto';
    autoBtn.title = autoSpin ? 'Stop autospin' : 'Spin automatically until the draft is done';
    // The race takeover locks the app behind it, so it has its own switch.
    document.querySelectorAll('[data-auto-toggle]').forEach(b => {
        b.setAttribute('aria-pressed', String(autoSpin));
        b.textContent = autoSpin ? 'Stop autospin' : 'Autospin after this';
    });
    // A phone left on the table shouldn't lock itself halfway through a draft.
    if (autoSpin && navigator.wakeLock && !wakeLock) {
        navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
    } else if (!autoSpin && wakeLock) {
        wakeLock.release().catch(() => {}); wakeLock = null;
    }
    commit({ save: false });
}

// Autospin can be switched on at any moment. Idle, it spins now; mid-spin
// or mid-event, it takes over from the next pick (every event's ending
// already hands on to it). A seat is always coming back to the wheel
// after No One Is Safe, so a one-name wheel doesn't block it there.
function canArmAuto() { return names.length >= 2 || phase === 'nois'; }
function toggleAutoSpin() {
    ensureAudio();
    if (autoSpin) {                       // calling it off is allowed at any moment
        setAutoSpin(false);
        announce(isSpinning || isBusy ? 'Autospin off. The draft stops after this.' : 'Autospin off.');
        return;
    }
    if (!canArmAuto()) return;
    setAutoSpin(true);
    if (isSpinning || isBusy) { announce('Autospin on. It carries on after this.'); return; }
    announce('Autospin on.');
    spin();
}

autoBtn.addEventListener('click', toggleAutoSpin);
document.querySelectorAll('[data-auto-toggle]').forEach(b => b.addEventListener('click', toggleAutoSpin));
