function showIllegalStamp() {
    const stamp = document.getElementById('illegalStamp');
    stamp.classList.remove('out');
    stamp.classList.add('show');
    playStampSound();
    setTimeout(() => {
        stamp.classList.remove('show');
        stamp.classList.add('out');
        setTimeout(() => {
            stamp.classList.remove('out');
            isSpinning = false;
            sliceWeights = null;          // clear any power-up sizing before the retry
            redraw();
            updateButtons();
            // Illegal spins are a no-op retry — keep an active autospin alive
            if (autoSpin && names.length >= 2) queueAutoSpin(600);
        }, 480);
    }, 2600);
}


/* ══════════════════════════════════════
   Boost FX
══════════════════════════════════════ */

/* ── No one is safe wheel ── */
const noisCanvas = document.getElementById('noisWheel');
const noisCtx    = noisCanvas.getContext('2d');
const NSW = noisCanvas.width, NCX = NSW/2, NCY = NSW/2, NR = NCX - 12;
let   noisRotation = 0;

function drawNoisWheel(arr, rot) {
    noisCtx.clearRect(0, 0, NSW, NSW);
    if (!arr.length) return;
    const arc = (2*Math.PI)/arr.length;

    for (let i=0;i<arr.length;i++) {
        const start=rot-Math.PI/2+i*arc, end=start+arc, mid=(start+end)/2;
        noisCtx.beginPath(); noisCtx.moveTo(NCX,NCY);
        noisCtx.arc(NCX,NCY,NR,start,end); noisCtx.closePath();
        noisCtx.fillStyle=arr[i].color; noisCtx.fill();

        const shine=noisCtx.createRadialGradient(NCX,NCY,0,NCX,NCY,NR);
        shine.addColorStop(0,'rgba(255,255,255,0.08)'); shine.addColorStop(1,'rgba(0,0,0,0.3)');
        noisCtx.beginPath(); noisCtx.moveTo(NCX,NCY);
        noisCtx.arc(NCX,NCY,NR,start,end); noisCtx.closePath();
        noisCtx.fillStyle=shine; noisCtx.fill();

        noisCtx.save(); noisCtx.translate(NCX,NCY); noisCtx.rotate(mid);
        const fs=arr.length>12?9:arr.length>7?11:13;
        noisCtx.font=`bold ${fs}px Segoe UI,system-ui,sans-serif`;
        noisCtx.textAlign='center'; noisCtx.textBaseline='middle';
        noisCtx.fillStyle='rgba(255,255,255,0.95)';
        noisCtx.shadowColor='rgba(0,0,0,0.9)'; noisCtx.shadowBlur=5;
        let label=arr[i].name, maxW=NR*0.52;
        while(noisCtx.measureText(label).width>maxW&&label.length>2) label=label.slice(0,-1);
        if(label!==arr[i].name) label+='…';
        noisCtx.fillText(label,NR*0.62,0); noisCtx.restore();
    }

    for (let i=0;i<arr.length;i++) {
        const angle=rot-Math.PI/2+i*arc;
        noisCtx.beginPath(); noisCtx.moveTo(NCX,NCY);
        noisCtx.lineTo(NCX+Math.cos(angle)*NR, NCY+Math.sin(angle)*NR);
        noisCtx.strokeStyle='rgba(192,57,43,0.5)'; noisCtx.lineWidth=1.5; noisCtx.stroke();
    }

    noisCtx.beginPath(); noisCtx.arc(NCX,NCY,NR,0,2*Math.PI);
    noisCtx.strokeStyle='rgba(192,57,43,0.65)'; noisCtx.lineWidth=4; noisCtx.stroke();

    const hub=noisCtx.createRadialGradient(NCX,NCY,0,NCX,NCY,20);
    hub.addColorStop(0,'#ff6b6b'); hub.addColorStop(0.45,'#c0392b'); hub.addColorStop(1,'#7b1c1c');
    noisCtx.beginPath(); noisCtx.arc(NCX,NCY,20,0,2*Math.PI);
    noisCtx.fillStyle=hub; noisCtx.fill();
    noisCtx.strokeStyle='rgba(255,107,107,0.4)'; noisCtx.lineWidth=1.5; noisCtx.stroke();

    const px=NCX, py=20, hw=15;
    noisCtx.shadowColor='rgba(192,57,43,0.9)'; noisCtx.shadowBlur=18;
    const pg=noisCtx.createLinearGradient(px-hw,0,px+hw,0);
    pg.addColorStop(0,'#7b1c1c'); pg.addColorStop(0.5,'#ff6b6b'); pg.addColorStop(1,'#7b1c1c');
    noisCtx.beginPath(); noisCtx.moveTo(px-hw,3); noisCtx.lineTo(px+hw,3); noisCtx.lineTo(px,py);
    noisCtx.closePath(); noisCtx.fillStyle=pg; noisCtx.fill(); noisCtx.shadowBlur=0;
    noisCtx.beginPath(); noisCtx.arc(px,py,4.5,0,2*Math.PI);
    noisCtx.fillStyle='#fff'; noisCtx.shadowColor='rgba(255,255,255,0.9)'; noisCtx.shadowBlur=6;
    noisCtx.fill(); noisCtx.shadowBlur=0;
}

function showNoisWheel(replacementPick, onDone) {
    if (!draftOrder.length) { onDone&&onDone(); return; }
    isBusy = true;
    updateButtons();

    const overlay    = document.getElementById('noisOverlay');
    const resultEl   = document.getElementById('noisResult');
    const candidates = draftOrder.map(p=>({name:p.name, color:p.color}));

    noisRotation = 0;
    resultEl.textContent = '';
    drawNoisWheel(candidates, noisRotation);
    overlay.classList.add('show');

    setTimeout(() => {
        const victimIdx  = Math.floor(Math.random()*candidates.length);
        const arc        = (2*Math.PI)/candidates.length;
        const landingPos = 0.01 + Math.random()*0.98;
        const victimMid  = (victimIdx + landingPos)*arc;
        const targetNorm = ((2*Math.PI - victimMid%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
        const curNorm    = ((noisRotation%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
        let delta = targetNorm - curNorm;
        if (delta<0) delta += 2*Math.PI;

        const extraSpins = 5 + Math.floor(Math.random()*4);
        const totalRot   = extraSpins*2*Math.PI + delta;
        const duration   = 4200 + Math.random()*2000;
        const startRot   = noisRotation, endRot = noisRotation+totalRot;
        const startTime  = performance.now();
        const noisRing   = pegRing(candidates.length);
        let noisLastTick = Math.floor(noisRotation/noisRing.arc);
        let noisPrevT    = startTime, noisPrevRot = noisRotation;

        // Same gentle final glide as the main wheel for a suspenseful finish.
        function easeOut(t) { return 1 - (0.55*Math.pow(1-t,9) + 0.45*Math.pow(1-t,1.7)); }

        function frame(now) {
            const t = Math.min((now-startTime)/duration, 1);
            noisRotation = startRot + (endRot-startRot)*easeOut(t);
            drawNoisWheel(candidates, noisRotation);

            setTickSpeed((noisRotation - noisPrevRot) / Math.max(now - noisPrevT, 1));
            noisPrevT = now; noisPrevRot = noisRotation;

            const sIdx = Math.floor(noisRotation/noisRing.arc);
            if (sIdx!==noisLastTick) {
                const crossed = Math.min(Math.abs(sIdx-noisLastTick),2);
                for(let i=0;i<crossed;i++) playTick(i === 0 && isAccentPeg(sIdx, noisRing.per));
                noisLastTick=sIdx;
            }

            if (t<1) { requestAnimationFrame(frame); return; }

            noisRotation = endRot;
            drawNoisWheel(candidates, noisRotation);
            const victim = candidates[victimIdx];
            resultEl.textContent = replacementPick
                ? `${victim.name} is UNDRAFTED! ${replacementPick.name} takes the seat.`
                : `${victim.name} is UNDRAFTED!`;

            setTimeout(() => {
                const di=draftOrder.findIndex(p=>p.name===victim.name);
                if (di>=0) {
                    if (replacementPick) draftOrder[di] = replacementPick;
                    else draftOrder.splice(di,1);
                }
                const ui=undoStack.findIndex(p=>p.name===victim.name);
                if (ui>=0) {
                    if (replacementPick) undoStack[ui] = replacementPick;
                    else undoStack.splice(ui,1);
                }
                names.push(victim.name);
                if (names.length < 2 && autoSpin) setAutoSpin(false);

                overlay.classList.remove('show');
                isBusy = false;
                renderList(); renderDraft(); redraw(); saveState(); updateButtons();
                onDone&&onDone();
            }, 2600);
        }

        requestAnimationFrame(frame);
    }, 900);
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

// The race is a full-screen takeover, so the track is sized to the screen
// rather than pinned to the markup's 388x560 — on a wide monitor that left
// the field crammed into a strip down the middle.
let CANVAS_W = marbleCanvas.width;
let MH = marbleCanvas.height;
let SPRINT_PAD_L = 102;
const SPRINT_PAD_R = 24;                      // right margin past the finish
let TRACK_X0 = SPRINT_PAD_L, FINISH_X = CANVAS_W - SPRINT_PAD_R;
let lastRunners = null, lastSafeCount = 0;    // so a resize can redraw a finished race

function sizeMarbleCanvas(runnerCount) {
    const wide   = window.innerWidth > 700;
    const boardW = wide ? 200 : 0;                       // finish-order panel + gap
    // Lanes want about 95px each — past that a small field is just spread
    // thin down a tall canvas.
    const want = runnerCount ? runnerCount * 95 + 60 : 700;
    const w = Math.round(Math.max(320, Math.min(window.innerWidth - boardW - 64, 1200)));
    const h = Math.round(Math.max(380, Math.min(window.innerHeight - 150, want, 900)));
    if (marbleCanvas.width === w && marbleCanvas.height === h) return;
    marbleCanvas.width  = w;
    marbleCanvas.height = h;
    CANVAS_W = w; MH = h;
    // Name column keeps its share of the width, so long names still fit.
    SPRINT_PAD_L = Math.round(Math.min(170, Math.max(96, w * 0.2)));
    TRACK_X0 = SPRINT_PAD_L;
    FINISH_X = w - SPRINT_PAD_R;
    marbleBoard.style.maxHeight = h + 'px';
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
let   raceHurdles   = [];     // this race's rail positions along the track
let   hurdleFlash   = null;   // {name, color, at} for the on-canvas callout

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

function onPanicLanded() {
    sliceWeights = null;
    panicCooldown = true;       // no PANIC again until the next non-panic spin
    isSpinning = false;
    isBusy = true;              // block input through the whole event
    redraw();
    updateButtons();
    playPanicSound();
    setTimeout(startMarbleRace, 650);
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
        const chipH = Math.min(16 * k, laneH - 3);
        const maxChars = Math.round(8 * k);
        const nm = r.pick.name.length > maxChars ? r.pick.name.slice(0, maxChars - 1) + '…' : r.pick.name;
        mctx.fillStyle = 'rgba(8,4,16,0.7)';
        mRoundRect(6, yc - chipH / 2, TRACK_X0 - 14, chipH, 4); mctx.fill();
        mctx.strokeStyle = now < r.stumbleUntil ? '#e74c3c' : r.color;
        mctx.lineWidth = now < r.stumbleUntil ? 2.5 : 1.5; mctx.stroke();
        mctx.fillStyle = '#e8dfc8'; mctx.font = `700 ${Math.round(10 * k)}px Segoe UI,system-ui,sans-serif`;
        mctx.textAlign = 'left'; mctx.textBaseline = 'middle';
        mctx.fillText(nm, 12, yc + 0.5);

        // posted jump odds — red the moment this horse clips anything
        const anyFell = r.results.indexOf('fell') >= 0;
        const allDone = r.next >= raceHurdles.length;
        mctx.fillStyle = anyFell ? 'rgba(192,57,43,0.95)'
                       : allDone ? 'rgba(46,204,113,0.75)'
                       : 'rgba(212,175,55,0.9)';
        mctx.font = `800 ${Math.round(9 * k)}px Segoe UI,system-ui,sans-serif`;
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
            mctx.font = `900 ${Math.round(9 * k)}px Segoe UI,system-ui,sans-serif`;
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
            mctx.fillStyle = '#fff'; mctx.font = `900 ${Math.round(9 * k)}px Segoe UI,system-ui,sans-serif`;
            mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillText(r.safeRank, bx, byc + 0.5);
        }
    }

    // "X clips the hurdle!" for a moment after it happens
    if (hurdleFlash && now - hurdleFlash.at < 1400) {
        const fade = 1 - (now - hurdleFlash.at) / 1400;
        mctx.save();
        mctx.globalAlpha = Math.min(1, fade * 2.2);
        mctx.font = `800 ${Math.round(12 * k)}px Segoe UI,system-ui,sans-serif`;
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
    mctx.fillStyle = 'rgba(46,204,113,0.85)'; mctx.font = `800 ${Math.round(11 * k)}px Segoe UI,system-ui,sans-serif`;
    mctx.textAlign = 'left'; mctx.textBaseline = 'middle';
    mctx.fillText('FINISH', 0, 0); mctx.restore();
}

function addMarbleRankRow(m, rank, isSafe, safeCount) {
    if (rank === safeCount + 1) {
        const cut = document.createElement('div');
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
    const outCount  = Math.max(1, Math.ceil(racers.length / 2) - 1);
    const safeCount = racers.length - outCount;

    sizeMarbleCanvas(racers.length);
    raceHurdles = makeHurdles();          // before the subtitle counts them
    hurdleFlash = null;
    marbleRankList.innerHTML = '';
    marbleResultEl.textContent = '';
    marbleSubtitle.textContent = `${racers.length} running — ${raceHurdles.length} hurdles, first ${safeCount} across are safe, last ${outCount} drop out`;
    marbleOverlay.classList.add('show');

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

    let frames = 0, lastTick = 0;
    const MAXF = 3900;                  // ~65s hard cap (races naturally end ~19-30s)
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
        const rest = runners.filter(r => !safe.includes(r)).sort((a, b) => b.p - a.p);
        while (safe.length < safeCount && rest.length) {      // rare failsafe
            const r = rest.shift(); safe.push(r); r.safeRank = safe.length;
            addMarbleRankRow(r, safe.length, true, safeCount);
        }
        rest.forEach((r, i) => addMarbleRankRow(r, safeCount + 1 + i, false, safeCount));
        drawSprint(runners, safeCount, performance.now());
        setTimeout(() => resolveMarbleRace(safe.map(r => r.pick), rest.map(r => r.pick)), 1100);
    }

    function frame(now) {
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
                    playFinishPing();
                }
            }
        }
        if (now - lastTick > 130) { setTickSpeed(0.007); playTick(); lastTick = now; }
        drawSprint(runners, safeCount, now);

        if (safe.length >= safeCount || frames >= MAXF) { finishRace(); return; }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function resolveMarbleRace(safe, doomed) {
    marbleResultEl.textContent = doomed.length
        ? `${doomed.length} undrafted! ${safe.length} survive the panic.`
        : 'Everyone survived!';
    playFanfare(2600);

    setTimeout(() => {
        doomed.forEach(pick => {
            const di = draftOrder.findIndex(p => p.name === pick.name);
            if (di >= 0) draftOrder.splice(di, 1);
            const ui = undoStack.findIndex(p => p.name === pick.name);
            if (ui >= 0) undoStack.splice(ui, 1);
            if (!names.some(n => n.toLowerCase() === pick.name.toLowerCase())) names.push(pick.name);
        });
        endMarbleRace();
    }, 1900);
}

function endMarbleRace() {
    marbleOverlay.classList.remove('show');
    isBusy = false;
    if (names.length < 2 && autoSpin) setAutoSpin(false);
    renderList(); renderDraft(); redraw(); saveState(); updateButtons();
    if (autoSpin && names.length >= 2) queueAutoSpin(1400);
}

/* ── Draft complete splash ── */
const splashOverlay = document.getElementById('splashOverlay');
const splashList    = document.getElementById('splashList');

document.getElementById('splashClose').addEventListener('click', () => {
    splashOverlay.classList.remove('show');
});

function showSplash() {
    const top = draftOrder.slice(0, getWinnerSlots());
    if (top.length === 0) return;

    const rankClass = ['gold','silver','bronze','plain','plain'];

    splashList.innerHTML = '';
    top.forEach((pick, i) => {
        const item = document.createElement('div');
        item.className = 'splash-item';
        item.style.setProperty('--item-color', pick.color);
        item.style.setProperty('--delay', `${0.15 + i * 0.1}s`);

        const rank = document.createElement('div');
        rank.className = `splash-rank ${rankClass[i] || 'plain'}`;
        rank.textContent = ordinal(i + 1);

        const name = document.createElement('div');
        name.className = 'splash-name';
        name.textContent = pick.name;

        item.append(rank, name);
        splashList.appendChild(item);
    });

    // small delay so winner overlay finishes closing first
    setTimeout(() => splashOverlay.classList.add('show'), 500);
}

// One banner, two stunts — each names itself on the way in.
function runBanner(kicker, label, holdMs, gremlin) {
    const el = document.getElementById('windBackPopup');
    el.querySelector('.wb-kicker').textContent = kicker;
    el.querySelector('.wb-label').textContent  = label;
    el.classList.toggle('gremlin', !!gremlin);
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

function showWindBackBanner() { runBanner('Not so fast', 'Wind-back', 1500, false); }

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
    if (kind === 'arrive') { showGoblin(); return; }

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
    runBanner('Uninvited', 'Gremlin', 1250, true);
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
    showWindBackBanner();
    playWindBack();
    playShove();
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
function onSpinEnd(winnerIdx) {
    sliceWeights = null;                  // power-up sizing only lasts for its spin
    panicCooldown = false;                // a normal pick clears the no-back-to-back-PANIC lock
    const name=names[winnerIdx], c=colorOf(name);
    winnerNameEl.textContent=name; winnerNameEl.style.color=c;
    winnerSubEl.textContent = CONGRATS[Math.floor(Math.random()*CONGRATS.length)];
    winnerCard.style.setProperty('--win-color',c);
    winnerCard.style.setProperty('--win-glow',c+'28');
    winnerOverlay.classList.add('show');
    playFanfare(winnerDisplayMs());
    launchConfetti(c);

    setTimeout(()=>{
        winnerOverlay.classList.remove('show');
        setTimeout(()=>{
            const selectedPick = {name,color:c};
            names.splice(winnerIdx,1);
            isSpinning=false;
            const hasNames=names.length>0;
            // 25% chance of "No one is safe" — needs an existing drafted seat to replace
            const triggerNois = noisEnabled && hasNames && draftOrder.length >= 1 && Math.random() < 0.15;

            if (triggerNois) {
                isBusy = true;
                updateButtons();
                renderList(); renderDraft(); redraw(); saveState();
                setTimeout(() => showNoisWheel(selectedPick, () => {
                    // After undraft: resume auto-spin if on and names remain
                    if (autoSpin && names.length >= 2) queueAutoSpin(1400);
                }), 700);
            } else {
                undoStack.push(selectedPick);
                draftOrder.push(selectedPick);
                if (names.length === 1) {
                    const finalName = names[0], finalColor = colorOf(finalName);
                    undoStack.push({name: finalName, color: finalColor});
                    draftOrder.push({name: finalName, color: finalColor});
                    names.splice(0,1);
                }
                const stillHasNames=names.length>0;
                if (!stillHasNames&&autoSpin) setAutoSpin(false);
                renderList(); renderDraft(); redraw(); saveState();
                if (!stillHasNames) {
                    showSplash();
                } else if (autoSpin) {
                    queueAutoSpin(1400);
                }
            }
        },380);
    }, winnerDisplayMs());
}

/* ══════════════════════════════════════
   Auto spin
══════════════════════════════════════ */
// A queued auto-spin asks again on the way in: switching autospin off
// during the winner card has to stop the next one, not just the one after.
function queueAutoSpin(ms) {
    setTimeout(() => {
        if (autoSpin && names.length >= 2 && !isSpinning && !isBusy) spin();
    }, ms);
}

function setAutoSpin(val) {
    autoSpin=val;
    autoBtn.classList.toggle('on',autoSpin);
    autoBtn.textContent = autoSpin ? '◉ AUTOSPIN' : 'AUTOSPIN';
}

autoBtn.addEventListener('click', ()=>{
    ensureAudio();
    if (autoSpin) {                       // calling it off is allowed at any moment
        setAutoSpin(false);
        updateButtons();
        return;
    }
    if(names.length<2||isSpinning||isBusy)return;
    setAutoSpin(true);
    updateButtons();
    spin();
});
