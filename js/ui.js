/* ══════════════════════════════════════
   Draft
══════════════════════════════════════ */
function renderDraft() {
    syncWinnerSlotsInput();
    draftSection.classList.toggle('empty', draftOrder.length === 0);
    draftGrid.innerHTML = '';
    const slots = getWinnerSlots();
    if (draftOrder.length === 0) {
        // Only ever seen in the wide side-column layout, which keeps the
        // board open so it doesn't pop in and shove the wheel sideways.
        const empty = document.createElement('div');
        empty.className = 'draft-empty';
        empty.textContent = 'No picks yet. Spin the wheel and they line up here.';
        draftGrid.appendChild(empty);
    }
    draftOrder.forEach((pick, i) => {
        const isWinner = i < slots;
        const card = document.createElement('div');
        card.className = `draft-card ${isWinner ? 'winner' : 'loser'}`;
        card.style.setProperty('--accent', pick.color);
        const num = document.createElement('div'); num.className='draft-pick-num'; num.textContent=ordinal(i+1)+' pick';
        const name= document.createElement('div'); name.className='draft-name';    name.textContent=pick.name;
        const status = document.createElement('div'); status.className='draft-status'; status.textContent=isWinner ? 'Winner' : 'Loser';
        card.append(num,name,status); draftGrid.appendChild(card);
    });
    renderDock();
}

/* ══════════════════════════════════════
   Draft dock
   ─────────────────────────────────────
   The picks are only ever hidden if BOTH the real list is off-screen and
   this strip is missing, so an observer on the grid decides which one is
   carrying the draft at any moment.
══════════════════════════════════════ */
let draftInView    = false;
let dockSuppressed = false;   // the strip steps aside while a name is being typed
let dockShown      = 0;       // pick count the dock last rendered, for the pulse

function renderDock() {
    const slots = getWinnerSlots();
    dockList.innerHTML = '';
    draftOrder.forEach((pick, i) => {
        const chip = document.createElement('div');
        chip.className = 'dock-chip' + (i < slots ? ' winner' : '') +
                         (i === draftOrder.length - 1 ? ' latest' : '');
        chip.style.setProperty('--accent', pick.color);
        const num  = document.createElement('span'); num.className  = 'dock-num';  num.textContent  = (i+1) + '.';
        const name = document.createElement('span'); name.className = 'dock-name'; name.textContent = pick.name;
        chip.append(num, name);
        dockList.appendChild(chip);
    });
    dockCount.textContent = draftOrder.length
        ? draftOrder.length + (draftOrder.length === 1 ? ' pick' : ' picks')
        : '';
    // Newest pick is the one you care about, so keep it in view.
    dockList.scrollLeft = dockList.scrollWidth;

    if (draftOrder.length > dockShown && draftDock.classList.contains('show')) {
        draftDock.classList.remove('pulse');
        void draftDock.offsetWidth;
        draftDock.classList.add('pulse');
    }
    dockShown = draftOrder.length;
    syncDock();
}

function syncDock() {
    draftDock.classList.toggle('show', draftOrder.length > 0 && !draftInView && !dockSuppressed);
}

// On a phone the strip sits over the bottom of the page, which is exactly
// where the name field ends up — so it gets out of the way while you type.
nameInput.addEventListener('focus', () => { dockSuppressed = true;  syncDock(); });
nameInput.addEventListener('blur',  () => { dockSuppressed = false; syncDock(); });

if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(entries => {
        draftInView = entries[0].isIntersecting;
        syncDock();
    }, { threshold: 0.2 }).observe(draftGrid);
}

function jumpToDraft() {
    draftSection.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
}
draftDock.addEventListener('click', jumpToDraft);
draftDock.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToDraft(); }
});

draftClear.addEventListener('click', () => {
    if (isSpinning || isBusy) return;
    draftOrder=[]; undoStack=[]; renderDraft(); updateButtons(); saveState();
});

document.getElementById('restoreBtn').addEventListener('click', () => {
    if (isSpinning || isBusy || draftOrder.length === 0) return;
    draftOrder.forEach(pick => names.push(pick.name));
    draftOrder = []; undoStack = [];
    renderList(); renderDraft(); redraw(); saveState();
});

copyBtn.addEventListener('click', () => {
    if (!draftOrder.length) return;
    const text = formatDraftCopy();
    navigator.clipboard.writeText(text).then(() => {
        const orig = copyBtn.textContent;
        copyBtn.textContent='COPIED!'; copyBtn.style.color='#d4af37';
        setTimeout(()=>{ copyBtn.textContent=orig; copyBtn.style.color=''; }, 2000);
    });
});

function formatDraftCopy() {
    const slots = getWinnerSlots();
    const winners = draftOrder.slice(0, slots);
    const losers = draftOrder.slice(slots);
    const lines = [];
    if (winners.length) {
        lines.push('WINNERS');
        winners.forEach((p,i) => lines.push(`${ordinal(i+1)} pick: ${p.name}`));
    }
    if (losers.length) {
        if (lines.length) lines.push('');
        lines.push('LOSERS');
        losers.forEach((p,i) => lines.push(`${ordinal(slots+i+1)} pick: ${p.name}`));
    }
    return lines.join('\n');
}

/* ══════════════════════════════════════
   Undo
══════════════════════════════════════ */
function updateButtons() {
    const canSpin = names.length >= 2;
    spinBtn.disabled  = !canSpin || isSpinning || isBusy;
    // While autospin is running it stays clickable, so it can be called off
    // mid-spin — otherwise you have to sit through the rest of the draft.
    autoBtn.disabled  = autoSpin ? false : (!canSpin || isSpinning || isBusy);
    undoBtn.disabled  = undoStack.length === 0 || isSpinning || isBusy;
    resetBtn.disabled = isSpinning || isBusy;
    namePanel.classList.toggle('needs-players', names.length < 2);
    // Cold start: nothing added, nothing drafted. The panel turns itself
    // into a walkthrough until the wheel is usable.
    const firstRun = names.length < 2 && draftOrder.length === 0;
    namePanel.classList.toggle('first-run', firstRun);
    if (firstRun) {
        const state = [
            canSpin ? 'done' : 'current',   // 1 - add names
            canSpin ? 'current' : '',       // 2 - winner slots
            canSpin ? 'current' : '',       // 3 - spin
            ''                              // 4 - options, always optional
        ];
        setupSteps.forEach((el, i) => {
            el.classList.toggle('done',    state[i] === 'done');
            el.classList.toggle('current', state[i] === 'current');
        });
    }
    // Head-count: the chip carries the total, the hint splits it up.
    const total = totalEntrants();
    playerCount.textContent = draftOrder.length
        ? names.length + ' of ' + total
        : String(total);
    playerCount.title = total + ' player' + (total === 1 ? '' : 's') + ' in total' +
        (draftOrder.length ? ' — ' + names.length + ' still on the wheel, ' + draftOrder.length + ' drafted' : '');

    starterHint.textContent =
        names.length === 0 ? (total ? total + ' drafted — the wheel is empty.' : 'Add at least 2 names to spin.') :
        names.length === 1 ? 'Add 1 more name to unlock the wheel.' :
        draftOrder.length  ? names.length + ' left on the wheel, ' + draftOrder.length + ' drafted.' :
                             names.length + ' players ready to spin.';
    spinHint.textContent = names.length === 0 ? 'Add at least 2 names to spin' :
                           names.length === 1 ? 'Add 1 more name to spin' :
                           'Drag the wheel and let go — or hit SPIN.';
    canvas.classList.toggle('locked', !canSpin || isSpinning || isBusy);
    syncWinnerSlotsInput();
}

undoBtn.addEventListener('click', () => {
    if (undoStack.length===0||isSpinning||isBusy) return;
    const last = undoStack.pop();
    draftOrder.pop(); names.push(last.name);
    renderList(); renderDraft(); redraw(); updateButtons(); saveState();
});

/* ══════════════════════════════════════
   List
══════════════════════════════════════ */
function renderList() {
    nameListEl.innerHTML = '';
    if (names.length === 0) {
        const li=document.createElement('li'); li.className='empty-msg'; li.textContent='No players at the table yet';
        nameListEl.appendChild(li);
    } else {
        names.forEach((name,i)=>{
            const li=document.createElement('li'); li.className='name-item'; li.style.setProperty('--accent',colorOf(name));
            const txt=document.createElement('span'); txt.className='name-text'; txt.textContent=name;
            const btn=document.createElement('button'); btn.className='remove-btn'; btn.textContent='×'; btn.dataset.index=i; btn.title='Remove';
            li.append(txt,btn); nameListEl.appendChild(li);
        });
    }
    renderRiggedSuggestions();
    updateButtons();
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

nameListEl.addEventListener('click', e => {
    const btn = e.target.closest('.remove-btn');
    if (!btn||isSpinning||isBusy) return;
    names.splice(+btn.dataset.index, 1);
    if (names.length<2&&autoSpin) setAutoSpin(false);
    renderList(); redraw(); saveState();
});

/* ══════════════════════════════════════
   Add name
══════════════════════════════════════ */
function addName() {
    if (isSpinning || isBusy) return;
    ensureAudio();
    const val = nameInput.value.trim();
    if (!val) return;
    if (isNameInUse(val)) {
        nameInput.select(); nameInput.style.borderColor='#c0392b';
        setTimeout(()=>{ nameInput.style.borderColor=''; }, 800);
        return;
    }
    names.push(val); nameInput.value='';
    renderList(); redraw(); saveState();
    nameInput.focus();
}

function isNameInUse(name) {
    const key = name.trim().toLowerCase();
    return names.some(n=>n.toLowerCase()===key) ||
           draftOrder.some(p=>p.name.toLowerCase()===key) ||
           undoStack.some(p=>p.name.toLowerCase()===key);
}

addBtn.addEventListener('click', addName);
nameInput.addEventListener('keydown', e=>{ if(e.key==='Enter') addName(); });

/* ══════════════════════════════════════
   About
══════════════════════════════════════ */
function openAbout() {
    aboutOverlay.classList.add('show');
}

function closeAbout() {
    aboutOverlay.classList.remove('show');
}

aboutBtn.addEventListener('click', openAbout);
aboutClose.addEventListener('click', closeAbout);
aboutOverlay.addEventListener('click', e => {
    if (e.target === aboutOverlay) closeAbout();
});


/* ══════════════════════════════════════
   Reset
══════════════════════════════════════ */
resetBtn.addEventListener('click', ()=>{
    if(isSpinning || isBusy) return;
    names=[]; draftOrder=[]; undoStack=[]; rotation=0; nameColors={};
    setAutoSpin(false); setPowerUpRail(null);
    renderList(); renderDraft(); redraw(); saveState();
});

/* ══════════════════════════════════════
   Spacebar
══════════════════════════════════════ */
document.addEventListener('keydown', e=>{
    const aboutOpen = aboutOverlay.classList.contains('show');
    if(aboutOpen){
        if(e.key==='Escape') closeAbout();
        return;
    }
    if(e.code==='Space'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='BUTTON'){
        e.preventDefault(); spin();
    }
});

/* ══════════════════════════════════════
   Display slider
══════════════════════════════════════ */
const optionsBtn   = document.getElementById('optionsBtn');
const optionsPanel = document.getElementById('optionsPanel');
const riggedToggle = document.getElementById('riggedToggle');
const riggedInput  = document.getElementById('riggedInput');
const noisToggle   = document.getElementById('noisToggle');
const powerUpToggle = document.getElementById('powerUpToggle');
const panicToggle  = document.getElementById('panicToggle');
const popOffToggle = document.getElementById('popOffToggle');

optionsBtn.addEventListener('click', () => {
    const open = optionsPanel.classList.toggle('open');
    optionsBtn.classList.toggle('open', open);
});

// Setup guide: step 2 walks you to the slots control and makes it blink,
// step 4 just opens the options drawer.
document.getElementById('step2').addEventListener('click', () => {
    const smooth = prefersReducedMotion() ? 'auto' : 'smooth';
    slotsControl.scrollIntoView({ behavior: smooth, block: 'center' });
    slotsControl.classList.remove('flash');
    void slotsControl.offsetWidth;           // restart the animation
    slotsControl.classList.add('flash');
    draftSlotsInput.focus({ preventScroll: true });
    draftSlotsInput.select();
});

document.getElementById('step4').addEventListener('click', () => {
    if (!optionsPanel.classList.contains('open')) optionsBtn.click();
    optionsPanel.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
});

riggedToggle.addEventListener('change', () => {
    riggedEnabled = riggedToggle.checked;
});

// The typed target persists; the enable flag stays session-only so a rigged
// draw never silently carries over into a fresh session.
riggedInput.addEventListener('input', () => {
    riggedValue = riggedInput.value;
    saveState();
});

const windBackToggle = document.getElementById('windBackToggle');

windBackToggle.addEventListener('change', () => {
    windBackEnabled = windBackToggle.checked;
    saveState();
});

const goblinToggle = document.getElementById('goblinToggle');

goblinToggle.addEventListener('change', () => {
    goblinEnabled = goblinToggle.checked;
    saveState();
});

powerUpToggle.addEventListener('change', () => {
    powerUpsEnabled = powerUpToggle.checked;
    if (!powerUpsEnabled) setPowerUpRail(null);
    syncPowerUpRail();
    saveState();
});

popOffToggle.addEventListener('change', () => {
    popOffEnabled = popOffToggle.checked;
    saveState();
});

panicToggle.addEventListener('change', () => {
    panicEnabled = panicToggle.checked;
    saveState();
    redraw();   // show/hide the PANIC wedge immediately
});

noisToggle.addEventListener('change', () => {
    noisEnabled = noisToggle.checked;
    saveState();
});

autoDisplayToggle.addEventListener('change', ()=>{
    autoDisplay = autoDisplayToggle.checked;
    displayManual.style.display = autoDisplay ? 'none' : 'flex';
    saveState();
});

displaySlider.addEventListener('input', ()=>{
    displayDuration = parseFloat(displaySlider.value)*1000;
    displayValEl.textContent = displaySlider.value+'s';
    saveState();
});

winnerSlotsInput.addEventListener('input', ()=>{ setWinnerSlots(winnerSlotsInput.value); });
draftSlotsInput.addEventListener('input',  ()=>{ setWinnerSlots(draftSlotsInput.value);  });
// A half-typed value leaves the field empty; snap it back on the way out.
draftSlotsInput.addEventListener('blur',   ()=>{ syncWinnerSlotsInput(); });
slotsMinus.addEventListener('click', ()=>{ setWinnerSlots(winnerSlots - 1); });
slotsPlus .addEventListener('click', ()=>{ setWinnerSlots(winnerSlots + 1); });

/* ══════════════════════════════════════
   Resize
══════════════════════════════════════ */
// Keep a wheel in mid-flight bouncing off the CURRENT viewport edges
const refreshPopRect = () => { if (popOff.active) popOff.rect = wheelWrap.getBoundingClientRect(); };
window.addEventListener('resize', ()=>{
    resizeFire(); resizeOverlay(); refreshPopRect();
    if (!isSpinning) redraw();          // empty-wheel copy flips with the layout
    // Keep the race fitted if the window changes shape mid-race
    if (marbleOverlay.classList.contains('show')) {
        sizeMarbleCanvas(lastRunners ? lastRunners.length : 0);
        if (lastRunners) drawSprint(lastRunners, lastSafeCount, performance.now());
    }
});
window.addEventListener('scroll', refreshPopRect, { passive: true });

/* ══════════════════════════════════════
   Init
══════════════════════════════════════ */
resizeFire(); resizeOverlay();
loadState();
noisToggle.checked      = noisEnabled;
powerUpToggle.checked    = powerUpsEnabled;
panicToggle.checked      = panicEnabled;
popOffToggle.checked     = popOffEnabled;
windBackToggle.checked   = windBackEnabled;
goblinToggle.checked     = goblinEnabled;
riggedInput.value        = riggedValue;
displaySlider.value      = displayDuration / 1000;
displayDuration          = parseFloat(displaySlider.value) * 1000;   // honor step snapping
displayValEl.textContent = displaySlider.value + 's';
autoDisplayToggle.checked = autoDisplay;
displayManual.style.display = autoDisplay ? 'none' : 'flex';
renderList(); renderDraft(); updateButtons(); syncPowerUpRail(); redraw();
