/* ══════════════════════════════════════
   Slot machines (PANIC slice, the other game)
   ─────────────────────────────────────
   Every drafted name gets a one-armed bandit, and they all pull together.
   A 7 that lands stays held, so each machine wears its score: the first
   to line up 7-7-7 claim the SAFE seats, in the order their last reel
   stopped, and the rest go back on the wheel. Same quota, takeover, Skip
   and undo as the horse race; the odds and the timings are in core.js.
══════════════════════════════════════ */
const SLOT_ASPECT = 0.64;          // a machine's height over its width
const SLOT_MAX_W  = 300;           // past this a small table is just big
const SLOT_PAD    = 10;            // the stage's own margin
const SLOT_CELL_W = 1 / 0.9;       // a cell is the machine plus room around it,
const SLOT_CELL_H = 1 / 0.84;      // with a little more above for the coins
const SLOT_EMOJI  = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif';
const REEL_SPEED  = 0.024;         // symbols per ms flat out

let slotLayout = null;
let lastSlots = null, lastSlotsAt = 0;     // so a resize can redraw the machines

function slotLayoutFor(n, W, H) {
    const aspect = SLOT_ASPECT * SLOT_CELL_H / SLOT_CELL_W;     // a cell's height over its width
    const g  = slotGrid(n, W - 2 * SLOT_PAD, H - 2 * SLOT_PAD, aspect);
    const mw = Math.min(g.cellW / SLOT_CELL_W, SLOT_MAX_W);
    const cellW = mw * SLOT_CELL_W, cellH = cellW * aspect;
    return { n, cols: g.cols, rows: g.rows, mw, mh: mw * SLOT_ASPECT, cellW, cellH,
             y0: (H - g.rows * cellH) / 2 };
}

// The stage keeps only the height the machines use, so a small table is
// not a strip of machines floating in a tall empty box.
function sizeSlotCanvas(n) {
    sizeMarbleCanvas(0, (w, h) => {
        const l = slotLayoutFor(n, w, h);
        return l.rows * l.cellH + 2 * SLOT_PAD;
    });
    slotLayout = slotLayoutFor(n, CANVAS_W, MH);
}

// Machine i's box. A short last row is centred under the full ones.
function machineRect(i) {
    const L = slotLayout, col = i % L.cols, row = Math.floor(i / L.cols);
    const inRow = Math.min(L.cols, L.n - row * L.cols);
    const x0 = (CANVAS_W - inRow * L.cellW) / 2;
    return { x: x0 + col * L.cellW + (L.cellW - L.mw) / 2,
             y: L.y0 + row * L.cellH + (L.cellH - L.mh) * 0.62, w: L.mw, h: L.mh };
}

function makeReel() {
    const strip = SLOT_SYMBOLS.map((_, i) => i);
    for (let i = strip.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [strip[i], strip[j]] = [strip[j], strip[i]];
    }
    let pos = Math.floor(Math.random() * strip.length);
    if (strip[pos] === 0) pos++;                     // nobody starts on a 7
    return { strip, pos, vel: 0, from: pos, to: pos, t0: 0, t1: -1, tease: false, spinning: false, landed: true, sym: -1 };
}

// An even run that brakes into the stop. A teasing reel brakes harder,
// so it crawls the last few symbols past the payline.
function reelEase(u, tease) {
    return tease ? 1 - (1 - u) * (1 - u) : 0.3 * u + 0.7 * (1 - (1 - u) * (1 - u));
}

// Where a reel is at race time `now`: a kick back as the lever bites, the
// run, then a little bounce as it stops.
function moveReel(r, now, step) {
    if (!r.spinning) { r.vel = 0; return; }
    const prev = r.pos;
    if (now < r.t0) {
        const a = Math.max(0, 1 - (r.t0 - now) / SLOT_KICK_MS);
        r.pos = r.from - 0.22 * Math.sin(Math.PI * a);
    } else if (now < r.t1) {
        r.pos = r.from + (r.to - r.from) * reelEase((now - r.t0) / (r.t1 - r.t0), r.tease);
    } else {
        const w = Math.min(1, (now - r.t1) / SLOT_SETTLE_MS);
        r.pos = r.to + (r.tease ? 0.08 : 0.2) * Math.sin(Math.PI * w) * (1 - w);
        if (w >= 1) { r.pos = r.to; r.spinning = false; }
    }
    r.vel = (r.pos - prev) / step;
}

function startSlotRace() {
    const players = draftOrder.slice();
    if (players.length < 2) { endMarbleRace(); return; }
    // The same quota as the race: the majority always survives.
    const outCount  = Math.max(1, Math.ceil(players.length / 2) - 1);
    const safeCount = players.length - outCount;

    dressPanicGame('slots', `${players.length} at the slots · 7s stick · first ${safeCount} to hit 7-7-7 are safe, last ${outCount} drop out`,
                   'Jackpot order');
    openTakeover(marbleOverlay);
    sizeSlotCanvas(players.length);
    announce(`Panic. Slot machines: ${players.length} playing, the first ${safeCount} to hit triple seven are safe.`);
    const pace = calmPace();

    const machines = players.map((pick, idx) => ({
        pick, color: pick.color, idx,
        reels: [makeReel(), makeReel(), makeReel()],
        held: [false, false, false], sevenAt: [-1e9, -1e9, -1e9],
        lever: -1e9, teasing: false, teaseCued: false,
        done: false, safeRank: null, out: false,
        jackpotAt: -1e9, missAt: -1e9, missReel: -1,
    }));

    // Fixed 60Hz steps, like the race: any screen runs the same game, and
    // Skip runs exactly the game that would have been watched.
    const STEP = 1000 / 60;
    const MAXF = 60 * 150;
    let simNow = 0, lastReal = 0, over = false, frames = 0;
    let pulls = 0, nextPull = 700, pullEnd = Infinity;
    const safe = [];                     // machines that hit 7-7-7 in time, in order

    function pull(T, quiet) {
        pulls++;
        let end = T;
        for (const m of machines) {
            if (m.done) continue;
            m.lever = T; m.teasing = false; m.teaseCued = false;
            slotPull(m.held, Math.random).forEach((p, i) => {
                if (!p) return;
                const r = m.reels[i], L = r.strip.length;
                const from = Math.round(r.pos), t0 = T + SLOT_KICK_MS, t1 = T + p.stop;
                let to = from + Math.round(REEL_SPEED * (t1 - t0) * (p.tease ? 0.6 : 1));
                to += ((r.strip.indexOf(p.sym) - to) % L + L) % L;       // land on the drawn symbol
                Object.assign(r, { from, to, t0, t1, tease: p.tease, spinning: true, landed: false, sym: p.sym });
                if (p.tease) m.teasing = true;
                end = Math.max(end, t1 + SLOT_SETTLE_MS);
            });
        }
        pullEnd = end; nextPull = Infinity;
        if (!quiet) { playLeverPull(); startReelWhirr(); }
    }

    function step(now, quiet) {
        frames++;
        if (now >= nextPull) pull(nextPull, quiet);
        const landings = [];
        let turning = false;
        for (const m of machines) {
            m.reels.forEach((r, i) => {
                moveReel(r, now, STEP);
                if (!r.landed && now >= r.t1) { r.landed = true; landings.push({ m, i, r, t: r.t1 }); }
                if (!r.landed) turning = true;
            });
            // Two 7s up and the last reel still going: the drum roll.
            if (m.teasing && !m.teaseCued && m.reels.every(r => r.landed || r.tease)) {
                m.teaseCued = true;
                const r = m.reels.find(r => r.tease && !r.landed);
                if (r && !quiet) playSlotTease((r.t1 - now) / 1000 / pace);
            }
        }
        if (!quiet && !turning) stopReelWhirr();

        // Within a step, whoever's reel stopped first is first.
        landings.sort((a, b) => a.t - b.t);
        for (const { m, i, r, t } of landings) {
            if (r.tease) m.teasing = false;
            if (r.sym !== 0) {
                if (!quiet) playReelStop(i);
                if (r.tease) { m.missAt = t; m.missReel = i; if (!quiet) playNearMiss(); }
                continue;
            }
            m.held[i] = true; m.sevenAt[i] = t;
            const sevens = m.held.filter(Boolean).length;
            if (sevens < 3) { if (!quiet) playSevenHold(sevens); continue; }
            m.done = true; m.jackpotAt = t;
            safe.push(m); m.safeRank = safe.length;
            addMarbleRankRow(m, safe.length, true, safeCount);
            if (!quiet) playJackpot(safe.length);
            if (safe.length >= safeCount) return true;      // decided: everyone else is out
        }
        if (nextPull === Infinity && now >= pullEnd) {
            if (pulls >= SLOT_MAX_PULLS) return true;        // failsafe, never seen in practice
            nextPull = now + SLOT_REST_MS;
        }
        return frames >= MAXF;
    }

    function finishSlots() {
        over = true;
        stopReelWhirr();
        document.getElementById('marbleSkip').hidden = true;
        const sevens = m => m.held.filter(Boolean).length;
        const rest = machines.filter(m => !safe.includes(m)).sort((a, b) => sevens(b) - sevens(a) || a.idx - b.idx);
        while (safe.length < safeCount && rest.length) {           // failsafe: the most 7s held
            const m = rest.shift(); safe.push(m); m.safeRank = safe.length;
            addMarbleRankRow(m, safe.length, true, safeCount);
        }
        rest.forEach((m, i) => { m.out = true; addMarbleRankRow(m, safeCount + 1 + i, false, safeCount); });
        // Reels still turning stop where they are, and never on a 7: nothing
        // may look like a jackpot that came too late to count.
        machines.forEach(m => m.reels.forEach(r => {
            m.teasing = false;
            r.spinning = false; r.vel = 0;
            if (r.landed) { r.pos = r.to; return; }
            r.landed = true;
            const L = r.strip.length;
            r.pos = Math.round(r.pos);
            if (r.strip[(r.pos % L + L) % L] === 0) r.pos++;
        }));
        drawSlots(machines, simNow);
        marbleOverlay.classList.add('done');
        marbleBoard.scrollTop = 0;
        setTimeout(guarded(() => resolveMarbleRace(safe.map(m => m.pick), rest.map(m => m.pick))), 1100);
    }

    function frame(real) {
        if (over) return;
        try {
            if (raceSkipped) {
                while (!step(simNow += STEP, true)) {}
                finishSlots();
                return;
            }
            if (!lastReal) lastReal = real - STEP;
            let todo = Math.min(Math.round((real - lastReal) / STEP), 8);
            lastReal += todo * STEP;
            if (real - lastReal > STEP * 8) lastReal = real;        // a hidden tab: don't sprint to catch up
            todo *= pace;
            while (todo-- > 0) { if (step(simNow += STEP, false)) { finishSlots(); return; } }
            drawSlots(machines, simNow);
            requestAnimationFrame(frame);
        } catch (err) { console.error(err); finishSlots(); }
    }
    drawSlots(machines, 0);
    requestAnimationFrame(frame);
}

/* ── Drawing ── */
function drawSlots(machines, now) {
    lastSlots = machines; lastSlotsAt = now;
    if (!slotLayout || slotLayout.n !== machines.length) slotLayout = slotLayoutFor(machines.length, CANVAS_W, MH);
    mctx.setTransform(raceScale, 0, 0, raceScale, 0, 0);
    const bg = mctx.createLinearGradient(0, 0, 0, MH);
    bg.addColorStop(0, '#160a26'); bg.addColorStop(1, '#0a0614');
    mctx.fillStyle = bg; mctx.fillRect(0, 0, CANVAS_W, MH);
    const lamp = mctx.createRadialGradient(CANVAS_W / 2, 0, 0, CANVAS_W / 2, 0, Math.max(CANVAS_W, MH) * 0.75);
    lamp.addColorStop(0, 'rgba(212,175,55,0.12)'); lamp.addColorStop(1, 'rgba(212,175,55,0)');
    mctx.fillStyle = lamp; mctx.fillRect(0, 0, CANVAS_W, MH);

    machines.forEach((m, i) => drawMachine(m, machineRect(i), now));
    // Coins last, so a payout sprays over the neighbours.
    if (!calmEffects()) machines.forEach((m, i) => {
        if (now - m.jackpotAt < 1500) drawCoins(machineRect(i), now - m.jackpotAt, m.idx);
    });
}

function fitPlate(text, maxW) {
    if (mctx.measureText(text).width <= maxW) return text;
    let chars = Array.from(text);
    while (chars.length > 1 && mctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
    return chars.join('') + '…';
}

function drawMachine(m, R, now) {
    const { x, y, w, h } = R;
    const k = w / 260;                          // trim and type grow with the machine
    const cabW = w * 0.87;
    const calm = calmEffects();
    const miss = now - m.missAt;
    mctx.save();
    // A near miss gives the cabinet a shudder.
    if (!calm && miss < 360) mctx.translate(Math.sin(miss / 22) * 3 * k * (1 - miss / 360), 0);
    if (m.out) mctx.globalAlpha = 0.4;

    // Lit from behind: green once safe (gold while the jackpot rings), a
    // throbbing gold while the last reel teases. Only once the two 7s are
    // actually showing: lit any sooner, it would give the reels away.
    const jack = now - m.jackpotAt;
    let glow = null;
    if (m.safeRank) glow = (!calm && jack < 1200) ? 'rgba(255,214,90,0.95)' : 'rgba(46,204,113,0.7)';
    else if (teaseLive(m)) glow = `rgba(255,200,60,${(0.7 + 0.3 * Math.sin(now / 70)).toFixed(3)})`;
    if (glow) {
        mctx.save();
        mctx.shadowColor = glow; mctx.shadowBlur = 22 * k; mctx.fillStyle = '#ffd25a';
        mRoundRect(x, y, cabW, h, 10 * k); mctx.fill();
        mctx.restore();
    }

    const cab = mctx.createLinearGradient(0, y, 0, y + h);
    cab.addColorStop(0, '#2e1946'); cab.addColorStop(1, '#130b20');
    mctx.fillStyle = cab; mRoundRect(x, y, cabW, h, 10 * k); mctx.fill();
    mctx.lineWidth = Math.max(1.5, 2 * k); mctx.strokeStyle = m.safeRank ? '#2ecc71' : m.color; mctx.stroke();

    // Name plate, in the player's own colour.
    const px = cabW * 0.06, py = h * 0.06, plateH = h * 0.2;
    mctx.fillStyle = m.color; mRoundRect(x + px, y + py, cabW - 2 * px, plateH, 5 * k); mctx.fill();
    mctx.font = `600 ${Math.max(9, Math.round(plateH * 0.62))}px ${LABEL_FONT}`;
    mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
    mctx.fillStyle = inkOn(m.color);
    mctx.fillText(fitPlate(m.pick.name, cabW - 2 * px - 10 * k), x + cabW / 2, y + py + plateH / 2 + 1);

    // The reels, behind glass, with the payline across them.
    const wy = y + py + plateH + h * 0.04, wh = h * 0.44;
    const gap = cabW * 0.025, rw = (cabW - 2 * px - 2 * gap) / 3;
    mctx.fillStyle = '#07040c';
    mRoundRect(x + px - 3 * k, wy - 3 * k, cabW - 2 * px + 6 * k, wh + 6 * k, 7 * k); mctx.fill();
    for (let i = 0; i < 3; i++) drawReel(m, i, x + px + i * (rw + gap), wy, rw, wh, k, now);
    mctx.strokeStyle = 'rgba(231,76,60,0.6)'; mctx.lineWidth = Math.max(1, 1.5 * k);
    mctx.beginPath(); mctx.moveTo(x + px - 2 * k, wy + wh / 2); mctx.lineTo(x + cabW - px + 2 * k, wy + wh / 2); mctx.stroke();

    const sy = wy + wh + h * 0.035;
    drawSlotStatus(m, x + px, sy, cabW - 2 * px, y + h - py * 0.6 - sy, k, now);
    drawLever(m, x + cabW, y, w - cabW, h, k, now);
    mctx.restore();
}

function drawReel(m, i, x, y, w, h, k, now) {
    const r = m.reels[i], L = r.strip.length;
    mctx.save();
    mRoundRect(x, y, w, h, 5 * k); mctx.clip();
    const face = mctx.createLinearGradient(0, y, 0, y + h);
    face.addColorStop(0, '#9c917a'); face.addColorStop(0.22, '#efe6d2'); face.addColorStop(0.5, '#fffaf0');
    face.addColorStop(0.78, '#efe6d2'); face.addColorStop(1, '#9c917a');
    mctx.fillStyle = face; mctx.fillRect(x, y, w, h);

    const pitch = h * 0.66, cx = x + w / 2, cy = y + h / 2;
    const size  = Math.min(w * 0.62, pitch * 0.78);
    const blur  = Math.min(1, Math.abs(r.vel) / 0.012);
    const a0    = mctx.globalAlpha;
    const base  = Math.floor(r.pos);
    for (let s = base - 1; s <= base + 2; s++) {
        const yy  = cy + (r.pos - s) * pitch;          // higher pos: symbols travel down
        const sym = r.strip[(s % L + L) % L];
        if (blur > 0.2) {
            mctx.globalAlpha = a0 * 0.42;
            for (const d of [-0.18, 0, 0.18]) drawSymbol(sym, cx, yy + d * pitch * blur, size);
            mctx.globalAlpha = a0;
        } else {
            drawSymbol(sym, cx, yy, size);
        }
    }
    // The drum curving away top and bottom.
    const shade = mctx.createLinearGradient(0, y, 0, y + h);
    shade.addColorStop(0, 'rgba(10,4,16,0.55)'); shade.addColorStop(0.24, 'rgba(10,4,16,0)');
    shade.addColorStop(0.76, 'rgba(10,4,16,0)'); shade.addColorStop(1, 'rgba(10,4,16,0.55)');
    mctx.fillStyle = shade; mctx.fillRect(x, y, w, h);
    mctx.restore();

    // A held 7 is framed in gold, brightest the moment it lands.
    if (m.held[i]) {
        const fresh = Math.max(0, 1 - (now - m.sevenAt[i]) / 600);
        mctx.save();
        mctx.strokeStyle = '#ffd25a'; mctx.lineWidth = (2 + 2.5 * fresh) * Math.max(k, 0.6);
        if (!calmEffects()) { mctx.shadowColor = 'rgba(255,210,90,0.95)'; mctx.shadowBlur = (6 + 16 * fresh) * k; }
        mRoundRect(x, y, w, h, 5 * k); mctx.stroke();
        mctx.restore();
    } else if (teaseLive(m) && r.tease && !r.landed) {
        // The reel everyone is watching.
        mctx.save();
        mctx.strokeStyle = `rgba(255,210,90,${(0.6 + 0.4 * Math.sin(now / 70)).toFixed(3)})`;
        mctx.lineWidth = 3 * Math.max(k, 0.6);
        mRoundRect(x, y, w, h, 5 * k); mctx.stroke();
        mctx.restore();
    } else if (m.missReel === i && now - m.missAt < 800) {
        // ...and the reel that let a near miss down flashes red.
        mctx.save();
        mctx.globalAlpha *= 1 - (now - m.missAt) / 800;
        mctx.strokeStyle = '#ff4d4d'; mctx.lineWidth = 3 * Math.max(k, 0.6);
        mRoundRect(x, y, w, h, 5 * k); mctx.stroke();
        mctx.restore();
    }
}

// Two 7s up and the last reel still turning.
function teaseLive(m) { return m.teasing && m.teaseCued; }

function drawSymbol(sym, x, y, size) {
    mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
    if (sym === 0) {
        // The 7: fat, red, outlined. The only symbol that matters.
        const fs = Math.round(size * 1.12);
        mctx.font = `700 ${fs}px ${LABEL_FONT}`;
        mctx.lineJoin = 'round';
        mctx.lineWidth = Math.max(2, size * 0.12); mctx.strokeStyle = '#4a0606';
        mctx.strokeText('7', x, y + size * 0.04);
        const g = mctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
        g.addColorStop(0, '#ff7262'); g.addColorStop(0.5, '#e01b1b'); g.addColorStop(1, '#8f0a0a');
        mctx.fillStyle = g;
        mctx.fillText('7', x, y + size * 0.04);
        return;
    }
    if (SLOT_SYMBOLS[sym] === 'BAR') {
        const bw = size * 1.05, bh = size * 0.46;
        mctx.fillStyle = '#17110a'; mRoundRect(x - bw / 2, y - bh / 2, bw, bh, bh * 0.25); mctx.fill();
        mctx.fillStyle = '#fbf4e2'; mctx.font = `700 ${Math.round(bh * 0.72)}px ${LABEL_FONT}`;
        mctx.fillText('BAR', x, y + 1);
        return;
    }
    mctx.font = `${Math.round(size * 0.84)}px ${SLOT_EMOJI}`;
    mctx.fillStyle = '#17110a';
    mctx.fillText(SLOT_SYMBOLS[sym], x, y + size * 0.05);
}

// Under the reels: one pip per reel, a little 7 in each one held; then the
// verdict once there is one.
function drawSlotStatus(m, x, y, w, h, k, now) {
    const cx = x + w / 2, cy = y + h / 2;
    mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
    if (m.safeRank || m.out) {
        const jack = now - m.jackpotAt;
        const flashing = m.safeRank && !calmEffects() && jack < 1400;
        const label = m.out ? 'OUT' : (flashing && Math.floor(jack / 140) % 2 === 0) ? 'JACKPOT' : `SAFE · ${ordinal(m.safeRank)}`;
        const fs = Math.max(9, Math.round(h * 0.6));
        mctx.font = `700 ${fs}px ${LABEL_FONT}`;
        const pw = Math.min(w, mctx.measureText(label).width + 18 * k), ph = Math.min(h, fs * 1.35);
        mctx.fillStyle = m.out ? '#7a1f1a' : (flashing ? '#b8860b' : '#1e8449');
        mRoundRect(cx - pw / 2, cy - ph / 2, pw, ph, ph / 2); mctx.fill();
        mctx.fillStyle = '#fff';
        mctx.fillText(label, cx, cy + 1);
        return;
    }
    const pr = Math.max(3, Math.min(h * 0.36, w * 0.075));
    for (let i = 0; i < 3; i++) {
        const pxi = cx + (i - 1) * pr * 2.8;
        mctx.beginPath(); mctx.arc(pxi, cy, pr, 0, 2 * Math.PI);
        if (m.held[i]) {
            mctx.fillStyle = '#ffd25a'; mctx.fill();
            mctx.fillStyle = '#8f0a0a'; mctx.font = `700 ${Math.round(pr * 1.5)}px ${LABEL_FONT}`;
            mctx.fillText('7', pxi, cy + 1);
        } else {
            mctx.strokeStyle = 'rgba(255,210,90,0.4)'; mctx.lineWidth = Math.max(1, 1.2 * k); mctx.stroke();
        }
    }
}

// The arm on the side: down as the pull starts, back up on its spring. Seen
// from the front, so the knob drops past the middle and swells as it
// swings out toward you.
function drawLever(m, x, y, w, h, k, now) {
    const t = now - m.lever;
    let a = 0;
    if (t >= 0 && t < SLOT_KICK_MS) a = t / SLOT_KICK_MS;
    else if (t >= SLOT_KICK_MS) a = Math.pow(Math.max(0, 1 - (t - SLOT_KICK_MS) / 340), 2);
    const by  = y + h * 0.56, len = h * 0.36;
    const bx  = x + w * 0.42;
    mctx.fillStyle = '#3b2a50';
    mRoundRect(x - 2 * k, by - h * 0.08, w * 0.62, h * 0.16, 3 * k); mctx.fill();
    const ky = by - len * Math.cos(Math.PI * a);
    mctx.strokeStyle = '#cfc8dc'; mctx.lineWidth = Math.max(2, 3 * k); mctx.lineCap = 'round';
    mctx.beginPath(); mctx.moveTo(bx, by); mctx.lineTo(bx, ky); mctx.stroke();
    const kr = Math.max(3, 7 * k) * (1 + 0.35 * Math.sin(Math.PI * a));
    const knob = mctx.createRadialGradient(bx - kr * 0.3, ky - kr * 0.3, kr * 0.1, bx, ky, kr);
    knob.addColorStop(0, '#ff9a8a'); knob.addColorStop(1, '#b3121b');
    mctx.fillStyle = knob; mctx.beginPath(); mctx.arc(bx, ky, kr, 0, 2 * Math.PI); mctx.fill();
}

// A payout: coins thrown up out of the machine, spinning, falling away.
// Seeded by the machine, so it needs no state of its own.
function drawCoins(R, t, seed) {
    const frac = v => v - Math.floor(v);
    const cr = Math.max(3, R.w * 0.028);
    mctx.save();
    mctx.globalAlpha = Math.min(1, (1500 - t) / 400);
    for (let j = 0; j < 16; j++) {
        const u1 = frac(Math.sin((seed + 1) * 97.13 + j * 12.9898) * 43758.5453);
        const u2 = frac(Math.sin((seed + 1) * 31.71 + j * 78.233) * 12543.31);
        const v  = R.h * 0.0035 * (0.7 + 0.6 * u2);            // px per ms, upward
        const g  = R.h * 0.00000875;                           // px per ms²
        const cx = R.x + R.w * 0.43 + (u1 - 0.5) * R.w * 0.0016 * t;
        const cy = R.y + R.h * 0.5 - v * t + g * t * t;
        const sx = Math.abs(Math.cos(t / 70 + j));             // spinning edge-on and back
        mctx.fillStyle = '#f5c542'; mctx.strokeStyle = '#a87b12'; mctx.lineWidth = 1;
        mctx.beginPath(); mctx.ellipse(cx, cy, cr * Math.max(0.15, sx), cr, 0, 0, 2 * Math.PI);
        mctx.fill(); mctx.stroke();
    }
    mctx.restore();
}

// Keeps whichever PANIC game is up fitted to the window.
function refitPanicGame() {
    if (panicGame === 'slots') {
        if (!lastSlots) return;
        sizeSlotCanvas(lastSlots.length);
        drawSlots(lastSlots, lastSlotsAt);
    } else {
        sizeMarbleCanvas(lastRunners ? lastRunners.length : 0);
        if (lastRunners) drawSprint(lastRunners, lastSafeCount, performance.now());
    }
}
