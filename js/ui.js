/* ══════════════════════════════════════
   UI
   ─────────────────────────────────────
   Everything on screen is rebuilt from game state by render(), which only
   ever runs through commit(). Gameplay code changes state and commits; it
   never touches a panel directly, so no counter can be left behind.
══════════════════════════════════════ */

// The stylesheet decides the layout; this just asks which one is showing.
function layout()    { return getComputedStyle(app).getPropertyValue('--layout').trim() || 'desktop'; }
function sheetMode() { const l = layout(); return l === 'phone' || l === 'landscape'; }

// Small DOM helper: text and <b> runs, never HTML, so a name can't inject markup.
function setParts(el, parts) {
    el.textContent = '';
    parts.forEach(p => {
        if (p == null || p === '') return;
        if (typeof p === 'string') el.append(p);
        else { const b = document.createElement(p.tag || 'b'); b.textContent = p.text; if (p.cls) b.className = p.cls; el.append(b); }
    });
}

/* ══════════════════════════════════════
   Render
══════════════════════════════════════ */
function render() {
    const st = draftStats();
    // Setup lasts until the first spin: the guide and the phone quick-add stay
    // up while the table fills.
    app.dataset.phase = (draftOrder.length === 0 && spinLog.spins === 0 && !isSpinning && !isBusy) ? 'setup' : 'play';
    app.dataset.wheel = names.length < 2 ? 'empty' : 'ready';
    renderScore(st);
    renderTicker(st);
    renderControls(st);
    renderPlayers(st);
    renderBoard(st);
    renderDock(st);
    renderWheelState(st);
    freshPick = '';
}

/* ── Scoreboard ── */
function renderScore(st) {
    if (st.complete) { statNext.textContent = 'Done'; statNextSub.textContent = st.picked + ' picks'; }
    else if (st.total === 0) { statNext.textContent = '—'; statNextSub.textContent = ''; }
    else { statNext.textContent = '#' + st.next; statNextSub.textContent = 'of ' + st.total; }

    statLeftNum.textContent = st.left;
    statLeftSub.textContent = st.total ? '/ ' + st.total : '';

    // While a nameplate is up, its pick is already the latest: the room has
    // seen it, so the scoreboard says so before the seat is formally filled.
    const latest = landed || st.latest;
    if (latest) {
        statLatestName.textContent = latest.name;
        statLatestSub.textContent  = '#' + latest.pick;
        statLatestDot.style.setProperty('--dot', latest.color);
    } else {
        statLatestName.textContent = '—';
        statLatestSub.textContent  = '';
        statLatestDot.removeAttribute('style');
    }
    statSpins.textContent = st.spins;
    statSpinsSub.textContent = st.illegal ? st.illegal + ' void' : '';

    scoreFill.style.width = st.total ? (st.picked / st.total * 100) + '%' : '0';
    const showCut = st.total > 1 && st.slots < st.total;
    scoreCut.style.display = showCut ? 'block' : 'none';
    if (showCut) scoreCut.style.left = (st.slots / st.total * 100) + '%';

    if (freshPick || landed) hot(statLatest);
    statLeft.setAttribute('aria-label', `${st.left} of ${st.total} names on the wheel. Show players.`);
    statLatest.setAttribute('aria-label', latest ? `Latest pick: ${latest.name}, pick ${latest.pick}. Show the draft board.` : 'No picks yet. Show the draft board.');
}
function hot(el) { el.classList.remove('hot'); void el.offsetWidth; el.classList.add('hot'); }

/* ── Status line ── */
let readout = null;     // { name, color } under the pointer while spinning

function oddsSummary() {
    if (names.length < 2) return [];
    const flat = names.map(() => 1);
    const each = pct(chanceOf(flat, 0));
    const seg  = buildSegments(flat);
    const tight = layout() === 'phone';
    if (seg.panicIndex < 0) return [tight ? 'Each ' : 'Odds ', { text: each }, tight ? '' : ' each'];
    const total = seg.weights.reduce((a, b) => a + b, 0);
    const p = pct(seg.weights[seg.panicIndex] / total);
    return tight ? ['Each ', { text: each }, ' · Panic ', { text: p }]
                 : ['Odds ', { text: each }, ' each · PANIC ', { text: p }];
}

function renderTicker(st) {
    let kind = 'ready', text = [], odds = [];
    ticker.style.removeProperty('--pu');
    if (phase === 'nois') {
        kind = 'nois'; text = [{ text: 'No one is safe' }, ' — a drafted seat is up for grabs'];
    } else if (phase === 'panic') {
        kind = 'panic'; text = [{ text: 'PANIC' }, ' — the drafted field is racing for their seats'];
    } else if (phase === 'illegal') {
        kind = 'void'; text = [{ text: 'Illegal spin' }, autoSpin ? ' — no pick. Re-spinning…' : ' — no pick. Spin again.'];
    } else if (phase === 'landed' && landed) {
        kind = 'win'; text = [{ text: landed.name }, ` takes pick #${landed.pick}`, landed.winner ? ' — winner!' : ''];
    } else if (isSpinning) {
        if (stunt === 'gremlin')       { kind = 'gremlin';  text = [{ text: 'Gremlin!' }, ' Something has the wheel…']; }
        else if (stunt === 'windback') { kind = 'windback'; text = [{ text: 'Wind-back!' }, ' Going round the other way']; }
        else if (activePowerUp) {
            const pu = activePowerUp;
            kind = 'powerup'; ticker.style.setProperty('--pu', pu.color);
            text = pu.type === 'wildcard'
                ? [{ text: pu.emoji + ' Wildcard' }, ` every slice re-rolled · best ${pu.who} ${pct(pu.from)} → ${pct(pu.to)}`]
                : [{ text: pu.emoji + ' ' + pu.label }, ` ${pu.who}: ${pct(pu.from)} → ${pct(pu.to)} this spin`];
        } else {
            kind = 'spinning'; text = [`Spinning for pick #${st.next}`, autoSpin ? ' · auto' : ''];
        }
    } else if (st.complete) {
        kind = 'complete'; text = [{ text: 'Draft complete' }, ` — ${st.picked} picks`]; odds = ['Copy it from the board'];
    } else if (names.length === 0) {
        kind = 'setup'; text = ['Add names to begin'];
    } else if (names.length === 1) {
        kind = 'setup'; text = [draftOrder.length ? 'One name left — add another or undo' : 'Add one more name to spin'];
    } else {
        kind = 'ready';
        text = layout() === 'phone' ? [{ text: 'Ready' }, ` · pick #${st.next}`, autoSpin ? ' · auto' : '']
                                    : [{ text: 'Ready' }, ` — spin for pick #${st.next}`, autoSpin ? ' · autospin on' : ''];
        odds = oddsSummary();
    }
    ticker.dataset.kind = kind;
    setParts(tickerText, text);
    if (isSpinning && phase !== 'landed' && readout) paintReadout();
    else setParts(tickerOdds, odds);
}

// The name under the pointer, every time it changes during a spin.
function setReadout(name, color) {
    readout = { name, color };
    if (isSpinning && phase !== 'landed') paintReadout();
}
function paintReadout() {
    tickerOdds.textContent = '';
    const pip = document.createElement('i');
    pip.className = 'pip'; pip.style.setProperty('--pip', readout.color);
    const b = document.createElement('b'); b.textContent = readout.name;
    tickerOdds.append(pip, b);
}

/* ── Console ── */
function describeUndo(ev) {
    if (!ev) return 'Nothing to undo';
    if (ev.t === 'pick') {
        const seatNo = draftOrder.findIndex(p => p.name === ev.names[0]) + 1;
        return `Undo pick ${seatNo || draftOrder.length}: ${ev.names.join(' and ')} back on the wheel`;
    }
    if (ev.t === 'steal') return `Undo the stolen seat: ${ev.victim} back in pick ${ev.seat + 1}`;
    if (ev.t === 'panic') return `Undo the panic: ${ev.out.length} back in their seats`;
    return 'Undo';
}

function renderControls(st) {
    const busy = isSpinning || isBusy;
    spinBtn.setAttribute('aria-disabled', String(!st.canSpin || busy));
    spinBtn.classList.toggle('busy', busy);
    spinLabel.textContent = (isSpinning && phase !== 'landed') ? 'Spinning' : isBusy ? 'Wait' : 'Spin';
    // While autospin is running it stays live, so it can be called off
    // mid-spin — otherwise you have to sit through the rest of the draft.
    autoBtn.setAttribute('aria-disabled', String(autoSpin ? false : (!st.canSpin || busy)));
    const ev = nextUndo();
    undoBtn.setAttribute('aria-disabled', String(!ev || busy));
    const undoText = describeUndo(ev);
    undoBtn.setAttribute('aria-label', undoText);
    undoBtn.title = undoText;
    canvas.classList.toggle('locked', !st.canSpin || busy);
    rigDot.hidden = !(riggedEnabled && riggedValue.trim());
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.title = soundOn ? 'Sound on — click to mute' : 'Sound off — click to turn on';
    soundBtn.setAttribute('aria-label', 'Sound');
    soundToggle.checked = soundOn;
    canvas.setAttribute('aria-label', wheelSummary());
}

function wheelSummary() {
    if (names.length < 2) return 'The wheel. Add at least two names to spin.';
    const seg = buildSegments(getWeights());
    const panic = seg.panicIndex >= 0 ? ', plus a Panic wedge' : '';
    return names.length > 15
        ? `Wheel with ${names.length} names${panic}.`
        : `Wheel with ${names.length} names: ${names.join(', ')}${panic}.`;
}

/* ── Players ── */
let hintError = '', hintTimer = null, rovingIdx = 0, listKey = '';

function renderPlayers(st) {
    playerCount.textContent = draftOrder.length ? `${st.left} / ${st.total}` : String(st.left);
    playerCount.title = `${st.total} in the draft — ${st.left} on the wheel, ${st.picked} drafted`;
    playersFoot.textContent = draftOrder.length ? `${st.picked} drafted · on the board` : '';
    resetBtn.setAttribute('aria-disabled', String(isSpinning || isBusy || st.total === 0));

    if (!hintError) {
        starterHint.classList.remove('error');
        starterHint.textContent =
            names.length === 0 ? (st.total ? 'The wheel is empty — add names or undo.' : 'Type a name and press Enter — or paste a whole list.') :
            names.length === 1 ? 'Add 1 more name to unlock the wheel.' :
            draftOrder.length  ? `${st.left} on the wheel, ${st.picked} drafted.` :
                                 `${st.left} ready to spin.`;
    }
    const canSpin = names.length >= 2;
    const steps = [canSpin ? 'done' : 'current', canSpin ? 'current' : '', canSpin ? 'current' : '', ''];
    setupSteps.forEach((el, i) => {
        el.classList.toggle('done', steps[i] === 'done');
        el.classList.toggle('current', steps[i] === 'current');
    });

    // Only rebuild the list when the names actually changed, so entrance
    // animations play once and keyboard focus isn't thrown away.
    const key = names.join('\u0001') + '|' + names.map(colorOf).join(',');
    if (key !== listKey) {
        listKey = key;
        const hadFocus = nameListEl.contains(document.activeElement);
        nameListEl.textContent = '';
        if (names.length === 0) {
            const li = document.createElement('li'); li.className = 'empty-msg';
            li.textContent = st.total ? 'Everyone is on the board.' : 'No players at the table yet.';
            nameListEl.appendChild(li);
        }
        rovingIdx = Math.min(rovingIdx, Math.max(0, names.length - 1));
        names.forEach((name, i) => {
            const li = document.createElement('li'); li.className = 'name-item';
            const pip = document.createElement('i'); pip.className = 'name-pip'; pip.style.setProperty('--c', colorOf(name));
            const txt = document.createElement('span'); txt.className = 'name-text'; txt.textContent = name;
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'remove-btn'; btn.dataset.index = i;
            btn.setAttribute('aria-label', `Remove ${name}`); btn.title = 'Remove';
            btn.tabIndex = i === rovingIdx ? 0 : -1;
            btn.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-close"/></svg>';
            li.append(pip, txt, btn); nameListEl.appendChild(li);
        });
        if (hadFocus) focusRemove(rovingIdx);
        renderRiggedSuggestions();
    }
}

function focusRemove(i) {
    const btns = nameListEl.querySelectorAll('.remove-btn');
    if (!btns.length) { nameInput.focus(); return; }
    rovingIdx = Math.max(0, Math.min(i, btns.length - 1));
    btns.forEach((b, k) => { b.tabIndex = k === rovingIdx ? 0 : -1; });
    btns[rovingIdx].focus();
}

// Suggest current players in the rigged input's dropdown (free text still allowed).
function renderRiggedSuggestions() {
    const dl = document.getElementById('riggedNames');
    if (!dl) return;
    dl.innerHTML = '';
    names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        dl.appendChild(opt);
    });
}

/* ── Draft board ──
   Every seat from first to last: the filled ones, the seat on the clock,
   and the empty ones still to come, with the winner cut drawn where it
   falls. A long draft scrolls inside the board, never the page. */
let boardKey = '';
function renderBoard(st) {
    boardCount.textContent = `${st.picked} / ${st.total}`;
    draftSubtitle.textContent = st.slots === 1 ? 'First pick wins. Everyone after loses.' : `First ${st.slots} picks win. Everyone after loses.`;
    syncSlotInputs(st);

    const busy = isSpinning || isBusy;
    [copyBtn, restoreBtn, draftClear].forEach(b => b.setAttribute('aria-disabled', String(busy || st.picked === 0)));

    const latestName = st.latest ? st.latest.name : '';
    const key = [draftOrder.map(p => p.name + p.color).join(','), st.total, st.slots, latestName,
                 phase, landed ? landed.name : '', freshPick].join('|');
    if (key === boardKey) return;
    boardKey = key;

    draftGrid.textContent = '';
    if (st.total === 0) {
        const li = document.createElement('li'); li.className = 'board-empty';
        li.textContent = 'No one at the table yet. Picks line up here, seat by seat.';
        draftGrid.appendChild(li);
    }
    let nextRow = null;
    for (let i = 0; i < st.total; i++) {
        if (i === st.slots && st.slots < st.total) {
            const cut = document.createElement('li'); cut.className = 'cutline';
            cut.textContent = st.slots === 1 ? 'Winner above' : 'Winners above';
            draftGrid.appendChild(cut);
        }
        const pick = draftOrder[i];
        const li = document.createElement('li');
        const num = document.createElement('span'); num.className = 'pick-num'; num.textContent = i + 1;
        const pip = document.createElement('i'); pip.className = 'pick-pip';
        const nm  = document.createElement('span'); nm.className = 'pick-name';
        const tag = document.createElement('span'); tag.className = 'pick-tag';
        const winner = i < st.slots;
        if (pick) {
            li.className = 'pick' + (winner ? ' winner' : '') + (pick.name === latestName ? ' latest' : '') + (pick.name === freshPick ? ' fresh' : '');
            pip.style.setProperty('--c', pick.color);
            nm.textContent = pick.name;
            tag.textContent = winner ? 'Winner' : 'Loser';
        } else if (i === draftOrder.length && st.left > 0) {
            li.className = 'pick next' + (winner ? ' winner' : '');
            nm.textContent = landed ? landed.name : isSpinning ? 'Spinning…' : 'On the clock';
            if (landed) pip.style.setProperty('--c', landed.color);
            tag.textContent = winner ? 'Winner' : '';
            nextRow = li;
        } else {
            li.className = 'pick empty';
            nm.textContent = '—';
        }
        li.append(num, pip, nm, tag);
        draftGrid.appendChild(li);
    }
    // Keep the action in view: the seat on the clock, or the newest pick.
    const focusRow = nextRow || draftGrid.querySelector('.pick.latest');
    if (focusRow) {
        const top = focusRow.offsetTop - draftGrid.offsetTop, h = draftGrid.clientHeight;
        if (top < draftGrid.scrollTop || top + focusRow.offsetHeight > draftGrid.scrollTop + h) {
            draftGrid.scrollTop = Math.max(0, top - h / 2);
        }
    }

    const log = [];
    if (st.spins)   log.push(`${st.spins} spin${st.spins === 1 ? '' : 's'}`);
    if (st.illegal) log.push(`${st.illegal} illegal`);
    if (st.panics)  log.push(`${st.panics} panic${st.panics === 1 ? '' : 's'}`);
    if (st.steals)  log.push(`${st.steals} seat${st.steals === 1 ? '' : 's'} stolen`);
    if (st.undos)   log.push(`${st.undos} undone`);
    boardLog.textContent = log.join(' · ');
}

// Two inputs, one number: Settings and the board. The number the player
// chose is kept; only what is SHOWN is clamped to the table, so adding
// players back never finds the setting quietly shrunk.
function syncSlotInputs(st) {
    const max = Math.max(1, st.total);
    [winnerSlotsInput, draftSlotsInput].forEach(input => {
        input.max = max;
        if (document.activeElement === input) return;
        input.value = st.slots;
    });
    slotsMinus.disabled = st.slots <= 1;
    slotsPlus.disabled  = st.slots >= max;
}

/* ── Phone dock and tab bar ── */
function renderDock(st) {
    dockStrip.textContent = '';
    const recent = draftOrder.slice(-4);
    const first = draftOrder.length - recent.length;
    recent.forEach((p, k) => {
        const i = first + k;
        const chip = document.createElement('span');
        chip.className = 'chip' + (i < st.slots ? ' winner' : '') + (st.latest && p.name === st.latest.name ? ' latest' : '');
        const b = document.createElement('b'); b.textContent = i + 1;
        const dot = document.createElement('i'); dot.style.setProperty('--c', p.color);
        const nm = document.createElement('span'); nm.textContent = p.name;
        chip.append(b, dot, nm);
        dockStrip.appendChild(chip);
    });
    if (!st.complete && st.left > 0) {
        const ghost = document.createElement('span');
        ghost.className = 'chip ghost';
        ghost.textContent = draftOrder.length ? `#${st.next} next` : 'No picks yet';
        dockStrip.appendChild(ghost);
    }
    dockPicks.setAttribute('aria-label', `Draft board: ${st.picked} of ${st.total} picked` + (st.latest ? `, latest ${st.latest.name}` : '') + '. Open the board.');
    tabPlayersBadge.textContent = st.left || '';
    tabBoardBadge.textContent = st.picked || '';
}

/* ── The wheel's own state ── */
function renderWheelState(st) {
    const where = layout();
    if (names.length < 2) {
        $('wheelEmptyTitle').textContent = names.length === 1 ? 'One more name' : (st.total ? 'Wheel empty' : "Who's playing?");
        $('wheelEmptySub').textContent =
            st.total && names.length === 0 ? 'Add a name, or undo the last pick' :
            where === 'phone'     ? 'Type names below — or paste a list' :
            where === 'landscape' ? 'Type names on the right' :
            where === 'tablet'    ? 'Add names in the Players panel below' :
                                    'Add names in the Players panel';
    }
    const mode = phase === 'landed' ? 'win'
               : (phase === 'panic' || phase === 'nois') ? 'danger'
               : isSpinning ? 'spin' : 'idle';
    if (wheelFrame.dataset.mode !== mode) wheelFrame.dataset.mode = mode;
    if (mode !== 'spin') { delete wheelFrame.dataset.chase; chaseStep = -1; }
    if (calmEffects() && mode === 'spin') wheelFrame.dataset.chase = '0';
    if (!isSpinning) redraw();
}

/* ── Winner nameplate ── */
function showWinCallout(name, color, pickNo, winner, quip) {
    winCallout.style.setProperty('--win', color);
    wheelFrame.style.setProperty('--win-jewel', color);
    setParts(winKicker, [`${ordinal(pickNo)} pick · `, { text: winner ? 'Winner' : 'Loser', tag: 'span', cls: winner ? '' : 'tag-loser' }]);
    winName.textContent = name;
    winSub.textContent = quip || '';
    winCallout.classList.add('show');
}
function hideWinCallout() { winCallout.classList.remove('show'); }
function flashBulbs(color) { wheelFrame.style.setProperty('--win-jewel', color); }

function buildBulbs() {
    const size = wheelStage.offsetWidth || 400;
    const n = size < 420 ? 20 : 28;
    if (wheelFrame.childElementCount === n) return;
    wheelFrame.textContent = '';
    for (let i = 0; i < n; i++) {
        const b = document.createElement('i');
        b.className = 'bulb' + (i < 2 || i >= n - 2 ? ' near' : '');
        b.style.setProperty('--i', i); b.style.setProperty('--n', n);
        wheelFrame.appendChild(b);
    }
}

/* ══════════════════════════════════════
   Screen-reader announcements
   ─────────────────────────────────────
   One polite region, said once per event, at most one message every 1.2s.
   A newer message in the same slot replaces one not yet spoken, so a fast
   result drops the stale "Spinning." rather than queueing behind it.
══════════════════════════════════════ */
let announceQ = [], announceTimer = null, announcedAt = 0;
function announce(text, slot) {
    if (slot) announceQ = announceQ.filter(m => m.slot !== slot);
    announceQ.push({ text, slot });
    pumpAnnounce();
}
function pumpAnnounce() {
    if (announceTimer || !announceQ.length) return;
    const wait = Math.max(0, announcedAt + 1200 - Date.now());
    announceTimer = setTimeout(() => {
        announceTimer = null;
        const m = announceQ.shift();
        if (!m) return;
        announcer.textContent = '';
        setTimeout(() => { announcer.textContent = m.text; }, 50);
        announcedAt = Date.now();
        pumpAnnounce();
    }, wait);
}
function alertNow(text) {
    alerter.textContent = '';
    setTimeout(() => { alerter.textContent = text; }, 50);
}

/* ══════════════════════════════════════
   Names
══════════════════════════════════════ */
function showHint(text, isError) {
    hintError = text;
    starterHint.textContent = text;
    starterHint.classList.toggle('error', !!isError);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintError = ''; nameInput.removeAttribute('aria-invalid'); quickInput.removeAttribute('aria-invalid'); commit({ save: false }); }, 4000);
}

function addNames(input) {
    const parts = splitNames(input.value);
    if (!parts.length) return;
    ensureAudio();
    if (isSpinning || isBusy) {
        showHint('Names can be added when the wheel stops.', true);
        alertNow('Names can be added when the wheel stops.');
        return;
    }
    const added = [], dupes = [];
    parts.forEach(n => {
        if (isNameInUse(n) || added.some(a => a.toLowerCase() === n.toLowerCase())) dupes.push(n);
        else { added.push(n); names.push(n); colorOf(n); }
    });
    if (added.length) input.value = '';
    if (!added.length) {
        input.setAttribute('aria-invalid', 'true');
        input.select();
        const msg = dupes.length === 1 ? `“${dupes[0]}” is already in the draw.` : 'Those names are all in the draw already.';
        showHint(msg, true);
        alertNow(msg);
        return;
    }
    input.removeAttribute('aria-invalid');
    if (dupes.length) showHint(`Added ${added.length}. Skipped ${dupes.length} already in the draw.`, false);
    else { hintError = ''; }
    announce(added.length === 1 ? `Added ${added[0]}. ${names.length} on the wheel.`
                                : `Added ${added.length} names. ${names.length} on the wheel.`);
    commit();
    input.focus();
}

function removeName(i) {
    if (isSpinning || isBusy || !names[i]) return;
    const gone = names.splice(i, 1)[0];
    if (names.length < 2 && autoSpin) setAutoSpin(false);
    announce(`Removed ${gone}. ${names.length} on the wheel.`);
    rovingIdx = Math.min(i, Math.max(0, names.length - 1));
    commit();
    queueMicrotask(() => { if (names.length) focusRemove(rovingIdx); else nameInput.focus(); });
}

addForm.addEventListener('submit', e => { e.preventDefault(); addNames(nameInput); });
quickAdd.addEventListener('submit', e => { e.preventDefault(); addNames(quickInput); });
// Keep the keyboard up on a phone: the + button shouldn't steal focus.
document.querySelectorAll('.add-btn').forEach(b => b.addEventListener('pointerdown', e => e.preventDefault()));
[nameInput, quickInput].forEach(inp => inp.addEventListener('input', () => {
    if (inp.getAttribute('aria-invalid')) { inp.removeAttribute('aria-invalid'); hintError = ''; commit({ save: false }); }
}));

nameListEl.addEventListener('click', e => {
    const btn = e.target.closest('.remove-btn');
    if (btn) removeName(+btn.dataset.index);
});
// The list is one Tab stop: arrows move between names, Delete removes one.
nameListEl.addEventListener('keydown', e => {
    const btn = e.target.closest('.remove-btn');
    if (!btn) return;
    const i = +btn.dataset.index;
    const moves = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: names.length - 1 };
    if (e.key in moves) { e.preventDefault(); focusRemove(moves[e.key]); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeName(i); }
});

/* ══════════════════════════════════════
   Draft actions
══════════════════════════════════════ */
undoBtn.addEventListener('click', () => {
    if (isSpinning || isBusy) return;
    const ev = undoLast();
    if (!ev) return;
    if (names.length < 2 && autoSpin) setAutoSpin(false);
    announce(ev.t === 'pick' ? `Undone. ${ev.names.join(' and ')} back on the wheel.`
           : ev.t === 'steal' ? `Undone. ${ev.victim} has their seat back.`
           : `Undone. ${ev.out.length} back in their seats.`);
    commit();
});

// Restore, Delete picks and Reset act at once and offer a way back, rather
// than asking "are you sure?" every time.
let toastTimer = null, toastUndo = null;
const toast = $('toast'), toastText = $('toastText'), toastUndoBtn = $('toastUndo');
function showToast(text, undoFn) {
    toastText.textContent = text;
    toastUndo = undoFn;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 10000);
    announce(text + ' Undo is available.');
}
function hideToast() { toast.classList.remove('show'); toastUndo = null; }
toastUndoBtn.addEventListener('click', () => {
    const fn = toastUndo;
    hideToast();
    if (fn && !isSpinning && !isBusy) { fn(); commit(); announce('Put back.'); }
});
toast.addEventListener('focusin', () => clearTimeout(toastTimer));
toast.addEventListener('focusout', () => { toastTimer = setTimeout(hideToast, 4000); });

function destructive(btn, action) {
    btn.addEventListener('click', () => {
        if (isSpinning || isBusy || btn.getAttribute('aria-disabled') === 'true') return;
        const snap = snapshotTable();
        const msg = action();
        if (!msg) return;
        commit();
        showToast(msg, () => restoreTable(snap));
    });
}

destructive(restoreBtn, () => {
    if (!draftOrder.length) return null;
    const n = draftOrder.length;
    draftOrder.forEach(pick => { if (!onWheel(pick.name)) names.push(pick.name); });
    draftOrder = [];
    newDraftLog();
    return `${n} pick${n === 1 ? '' : 's'} back on the wheel.`;
});

destructive(draftClear, () => {
    if (!draftOrder.length) return null;
    const n = draftOrder.length;
    draftOrder = [];
    newDraftLog();
    return `Deleted ${n} pick${n === 1 ? '' : 's'} from the table.`;
});

destructive(resetBtn, () => {
    const a = names.length, b = draftOrder.length;
    if (!a && !b) return null;
    names = []; draftOrder = []; rotation = 0; nameColors = {};
    panicCooldown = false; activePowerUp = null;
    newDraftLog();
    setAutoSpin(false);
    return `Table cleared: ${a + b} name${a + b === 1 ? '' : 's'}.`;
});

function copyDraft(btn) {
    if (!draftOrder.length) return;
    const text = formatDraftCopy();
    const ok = () => {
        const label = btn.querySelector('span');
        const orig = label.textContent;
        label.textContent = 'Copied'; btn.classList.add('done');
        setTimeout(() => { label.textContent = orig; btn.classList.remove('done'); }, 2000);
        announce(`Draft order copied: ${draftOrder.length} picks.`);
    };
    const fallback = () => {
        // No clipboard API (plain http, or permission refused): the old way.
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta); ta.select();
        let done = false;
        try { done = document.execCommand('copy'); } catch (e) {}
        ta.remove();
        if (done) ok();
        else { alertNow("Couldn't copy. Open the board and copy the names by hand."); showToast("Couldn't reach the clipboard.", null); }
    };
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
        else fallback();
    } catch (e) { fallback(); }
}
copyBtn.addEventListener('click', () => { if (copyBtn.getAttribute('aria-disabled') !== 'true') copyDraft(copyBtn); });

/* ── Winner slots ── */
function setWinnerSlots(value) {
    winnerSlots = normalizeWinnerSlots(value);
    commit();
}
let slotsAnnounce = null;
function slotsChanged() {
    clearTimeout(slotsAnnounce);
    slotsAnnounce = setTimeout(() => {
        const n = getWinnerSlots();
        announce(n === 1 ? 'First pick is the winner.' : `First ${n} picks are winners.`);
    }, 500);
}
winnerSlotsInput.addEventListener('input', () => { if (winnerSlotsInput.value !== '') { setWinnerSlots(winnerSlotsInput.value); slotsChanged(); } });
draftSlotsInput.addEventListener('input',  () => { if (draftSlotsInput.value !== '') { setWinnerSlots(draftSlotsInput.value); slotsChanged(); } });
// A half-typed value leaves the field empty; snap it back on the way out.
[winnerSlotsInput, draftSlotsInput].forEach(inp => inp.addEventListener('blur', () => commit({ save: false })));
slotsMinus.addEventListener('click', () => { setWinnerSlots(getWinnerSlots() - 1); slotsChanged(); });
slotsPlus .addEventListener('click', () => { setWinnerSlots(getWinnerSlots() + 1); slotsChanged(); });

/* ══════════════════════════════════════
   Sheets (phone) and drawers (compact landscape)
══════════════════════════════════════ */
let openSheet = null, sheetReturn = null;

function openPanel(panel, invoker) {
    if (!sheetMode()) {
        // Desktop and tablet show the panels already: just take you there.
        if (panel === playersPanel) nameInput.focus();
        else { draftSlotsInput.focus({ preventScroll: true }); }
        return;
    }
    if (openSheet === panel) { closeSheets(); return; }
    closeSheets(false);
    openSheet = panel;
    sheetReturn = invoker || document.activeElement;
    panel.classList.add('open');
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('show'));
    [...app.children].forEach(el => { if (el !== panel) el.inert = true; });
    (panel === playersPanel ? tabPlayers : tabBoard).setAttribute('aria-expanded', 'true');
    setTimeout(() => {
        const target = panel === playersPanel ? nameInput : panel.querySelector('.sheet-close');
        try { target.focus({ preventScroll: true }); } catch (e) {}
    }, 60);
}

function closeSheets(returnFocus = true) {
    if (!openSheet) return;
    openSheet.classList.remove('open');
    openSheet.style.transform = '';
    [...app.children].forEach(el => { el.inert = false; });
    scrim.classList.remove('show');
    setTimeout(() => { if (!openSheet) scrim.hidden = true; }, 230);
    tabPlayers.setAttribute('aria-expanded', 'false');
    tabBoard.setAttribute('aria-expanded', 'false');
    const back = sheetReturn;
    openSheet = null; sheetReturn = null;
    if (returnFocus && back && document.contains(back)) { try { back.focus({ preventScroll: true }); } catch (e) {} }
}

scrim.addEventListener('click', () => closeSheets());
document.querySelectorAll('[data-close-sheet]').forEach(b => b.addEventListener('click', () => closeSheets()));
tabPlayers.addEventListener('click', e => openPanel(playersPanel, e.currentTarget));
tabBoard.addEventListener('click', e => openPanel(boardPanel, e.currentTarget));
statLeft.addEventListener('click', e => openPanel(playersPanel, e.currentTarget));
statLatest.addEventListener('click', e => openPanel(boardPanel, e.currentTarget));
dockPicks.addEventListener('click', e => openPanel(boardPanel, e.currentTarget));

// Pull a sheet down by its head to close it.
document.querySelectorAll('.app > .panel .panel-head').forEach(head => {
    let y0 = null, id = null;
    head.addEventListener('pointerdown', e => {
        if (!openSheet || layout() !== 'phone' || e.target.closest('button, input')) return;
        y0 = e.clientY; id = e.pointerId; head.setPointerCapture(id);
    });
    head.addEventListener('pointermove', e => {
        if (y0 === null || e.pointerId !== id) return;
        const dy = Math.max(0, e.clientY - y0);
        openSheet.style.transition = 'none';
        openSheet.style.transform = `translateY(${dy}px)`;
    });
    const end = e => {
        if (y0 === null || e.pointerId !== id) return;
        const dy = e.clientY - y0;
        y0 = null;
        if (!openSheet) return;
        openSheet.style.transition = '';
        if (dy > 80) closeSheets(); else openSheet.style.transform = '';
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
});

/* ══════════════════════════════════════
   Dialogs
══════════════════════════════════════ */
const dialogReturn = new Map();
function openDialog(dlg, invoker) {
    if (dlg.open) return;
    closeSheets(false);
    dialogReturn.set(dlg, invoker || document.activeElement);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
function closeDialog(dlg) {
    if (!dlg.open) return;
    if (typeof dlg.close === 'function') dlg.close(); else { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }
}
document.querySelectorAll('dialog').forEach(dlg => {
    dlg.addEventListener('close', () => {
        const back = dialogReturn.get(dlg);
        dialogReturn.delete(dlg);
        const target = back && document.contains(back) && !back.closest('[inert]') ? back : spinBtn;
        try { target.focus({ preventScroll: true }); } catch (e) {}
    });
    // A click on the backdrop (the dialog element itself) closes it.
    dlg.addEventListener('click', e => { if (e.target === dlg) closeDialog(dlg); });
    dlg.querySelectorAll('[data-close-dialog]').forEach(b => b.addEventListener('click', () => closeDialog(dlg)));
});
optionsBtn.addEventListener('click', e => openDialog(settingsDialog, e.currentTarget));
tabSettings.addEventListener('click', e => openDialog(settingsDialog, e.currentTarget));
aboutBtn.addEventListener('click', e => openDialog(aboutDialog, e.currentTarget));

// Setup guide: step 2 takes you to the winner slots on the board, step 4
// opens Settings.
$('step2').addEventListener('click', () => {
    if (sheetMode()) openPanel(boardPanel);
    slotsControl.classList.remove('flash');
    void slotsControl.offsetWidth;
    slotsControl.classList.add('flash');
    setTimeout(() => { try { draftSlotsInput.focus({ preventScroll: true }); draftSlotsInput.select(); } catch (e) {} }, sheetMode() ? 300 : 0);
});
$('step4').addEventListener('click', e => openDialog(settingsDialog, e.currentTarget));

wheelEmpty.addEventListener('click', () => {
    const target = getComputedStyle(quickAdd).display !== 'none' ? quickInput : nameInput;
    if (target === nameInput && sheetMode()) openPanel(playersPanel);
    else target.focus();
});

/* ══════════════════════════════════════
   Keyboard
   ─────────────────────────────────────
   Space spins unless you are typing, or a control has keyboard focus and
   wants Space for itself. A button focused by a CLICK doesn't keep it:
   otherwise Space after clicking Undo would undo again instead of spinning.
══════════════════════════════════════ */
let swallowKeyup = false;
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openSheet) { e.preventDefault(); closeSheets(); return; }
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]') || app.inert) return;
    const t = e.target instanceof Element ? e.target : document.body;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    const ctl = t.closest('button, a, summary, [role="button"]');
    if (ctl && ctl.matches(':focus-visible')) return;
    e.preventDefault();
    if (ctl) swallowKeyup = true;
    if (names.length < 2) { alertNow('Add at least 2 names to spin.'); return; }
    if (isSpinning || isBusy) return;
    spin();
});
document.addEventListener('keyup', e => {
    if (swallowKeyup && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); swallowKeyup = false; }
});

/* ══════════════════════════════════════
   Settings
══════════════════════════════════════ */
function bindToggle(input, set) {
    input.addEventListener('change', () => { set(input.checked); commit(); });
}
bindToggle(windBackToggle, v => { windBackEnabled = v; });
bindToggle(goblinToggle,   v => { goblinEnabled = v; });
bindToggle(popOffToggle,   v => { popOffEnabled = v; });
bindToggle(noisToggle,     v => { noisEnabled = v; });
bindToggle(panicToggle,    v => { panicEnabled = v; });
bindToggle(powerUpToggle,  v => { powerUpsEnabled = v; });
bindToggle(soundToggle,    v => setSound(v));
bindToggle(calmToggle,     v => { calmPref = v; applyCalm(); });
// The rigged switch never reaches storage: a rigged draw must not carry
// over into a fresh session. The typed name does persist.
riggedToggle.addEventListener('change', () => { riggedEnabled = riggedToggle.checked; commit({ save: false }); });
riggedInput.addEventListener('input', () => { riggedValue = riggedInput.value; commit(); });

autoDisplayToggle.addEventListener('change', () => {
    autoDisplay = autoDisplayToggle.checked;
    displayManual.hidden = autoDisplay;
    commit();
});
displaySlider.addEventListener('input', () => {
    displayDuration = parseFloat(displaySlider.value) * 1000;
    displayValEl.textContent = displaySlider.value + 's';
    displaySlider.setAttribute('aria-valuetext', displaySlider.value + ' seconds');
    commit();
});

function setSound(on) {
    soundOn = on;
    if (on) ensureAudio();
}
soundBtn.addEventListener('click', () => {
    setSound(!soundOn);
    announce(soundOn ? 'Sound on.' : 'Sound off.');
    commit();
});

function applyCalm() {
    document.documentElement.classList.toggle('calm', calmEffects());
    calmToggle.checked = calmEffects();
}
if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const follow = () => { if (calmPref === null) { applyCalm(); commit({ save: false }); } };
    mq.addEventListener ? mq.addEventListener('change', follow) : mq.addListener(follow);
}

/* ══════════════════════════════════════
   Viewport
══════════════════════════════════════ */
// iOS keeps the layout viewport when the keyboard opens, so sheets ride on
// the visual viewport instead: --kb is how much the keyboard covers.
function syncViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', kb + 'px');
}
if (window.visualViewport) {
    visualViewport.addEventListener('resize', syncViewport);
    visualViewport.addEventListener('scroll', syncViewport);
}

// Keep a wheel in mid-flight bouncing off the CURRENT viewport edges
const refreshPopRect = () => { if (popOff.active) popOff.rect = wheelWrap.getBoundingClientRect(); };
let lastLayout = '';
window.addEventListener('resize', () => {
    resizeFire(); resizeOverlay(); refreshPopRect();
    const now = layout();
    if (now !== lastLayout) {
        lastLayout = now;
        if (openSheet && !sheetMode()) closeSheets(false);
        commit({ save: false });
    }
    // Keep the race fitted if the window changes shape mid-race
    if (marbleOverlay.classList.contains('show')) {
        sizeMarbleCanvas(lastRunners ? lastRunners.length : 0);
        if (lastRunners) drawSprint(lastRunners, lastSafeCount, performance.now());
    }
});
if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
        buildBulbs();
        if (sizeWheelCanvas() && !isSpinning) redraw();
        refreshPopRect();
    }).observe(wheelStage);
}

// The reverb is costly to build; do it in a quiet moment after the first
// touch instead of on top of the first winner's fanfare.
document.addEventListener('pointerdown', function warm() {
    document.removeEventListener('pointerdown', warm);
    setTimeout(() => { if (audioCtx && soundOn) try { getFxBus(); } catch (e) {} }, 300);
});

/* ══════════════════════════════════════
   Init
══════════════════════════════════════ */
resizeFire(); resizeOverlay();
loadState();
noisToggle.checked       = noisEnabled;
powerUpToggle.checked    = powerUpsEnabled;
panicToggle.checked      = panicEnabled;
popOffToggle.checked     = popOffEnabled;
windBackToggle.checked   = windBackEnabled;
goblinToggle.checked     = goblinEnabled;
soundToggle.checked      = soundOn;
riggedToggle.checked     = false;
riggedInput.value        = riggedValue;
displaySlider.value      = displayDuration / 1000;
displayDuration          = parseFloat(displaySlider.value) * 1000;   // honor step snapping
displayValEl.textContent = displaySlider.value + 's';
displaySlider.setAttribute('aria-valuetext', displaySlider.value + ' seconds');
autoDisplayToggle.checked = autoDisplay;
displayManual.hidden      = autoDisplay;
applyCalm();
buildBulbs();
sizeWheelCanvas();
syncViewport();
lastLayout = layout();
render();
if (document.fonts && document.fonts.ready) {
    // The face is cached, so repaint it once the label font has arrived.
    document.fonts.ready.then(() => { faceKey = ''; if (!isSpinning) redraw(); });
}
