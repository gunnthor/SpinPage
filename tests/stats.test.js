// The live scoreboard, the board and the draft history, through every kind
// of event. The rule under test: whatever happens, every number on screen
// matches the game state, and survives a reload.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, open, saved, scriptRandom, table } = require('./helpers');

let browser, site;
before(async () => { site = await serve(); browser = await launch(); });
after(async () => { await browser.close(); site.server.close(); });

const names12 = ['Ada', 'Ben', 'Cleo', 'Dmitri', 'Esme', 'Farouk', 'Gwen', 'Hiro', 'Ines', 'Jonas', 'Kaia', 'Luca'];

async function page(state, opts) { return open(browser, site.url, { state, ...opts }); }
async function done(p) {
  assert.deepEqual(p.errors, [], 'console errors: ' + p.errors.join(' | '));
  await p.context().close();
}

// What the scoreboard says, read off the page.
function board(p) {
  return p.evaluate(() => ({
    next: statNext.textContent, nextSub: statNextSub.textContent,
    left: statLeftNum.textContent, leftSub: statLeftSub.textContent,
    latest: statLatestName.textContent, latestPick: statLatestSub.textContent,
    spins: statSpins.textContent, spinsSub: statSpinsSub.textContent,
    count: boardCount.textContent,
    seats: [...draftGrid.querySelectorAll('.pick:not(.empty):not(.next) .pick-name')].map(e => e.textContent),
  }));
}
const state = p => p.evaluate(() => ({ names: names.slice(), picks: draftOrder.map(x => x.name), stats: draftStats() }));

test('the scoreboard starts empty and fills as names are added', async () => {
  const p = await page(null, { clock: false });
  assert.deepEqual(await board(p).then(b => [b.next, b.left, b.latest, b.spins]), ['—', '0', '—', '0']);
  // a list pasted from a spreadsheet, one name per line
  await p.focus('#nameInput');
  await p.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'Ada\nBen\r\nCleo\n');
    nameInput.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  assert.equal(await p.inputValue('#nameInput'), 'Ada, Ben, Cleo');
  await p.press('#nameInput', 'Enter');
  const b = await board(p);
  assert.equal(b.left, '3');
  assert.equal(b.next, '#1');
  assert.equal(b.nextSub, 'of 3');
  assert.deepEqual((await saved(p)).names, ['Ada', 'Ben', 'Cleo'], 'a pasted list becomes three players');
  await done(p);
});

test('a spin updates every counter, and they survive a reload', async () => {
  const p = await page(table(names12, ['Ada', 'Ben'], { winnerSlots: 3 }));
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  const b = await board(p);
  const s = await state(p);
  assert.equal(s.picks.length, 3);
  assert.equal(b.next, '#4');
  assert.equal(b.left, '9');
  assert.equal(b.leftSub, '/ 12');
  assert.equal(b.latest, s.picks[2]);
  assert.equal(b.latestPick, '#3');
  assert.equal(b.spins, '1');
  assert.equal(b.count, '3 / 12');
  assert.deepEqual(b.seats, s.picks);
  await p.reload();
  assert.deepEqual(await board(p), b, 'identical after a reload');
  await done(p);
});

test('an illegal spin counts as a spin, is marked void, and drafts nobody', async () => {
  const p = await page(table(names12));
  await scriptRandom(p, [0.5, 0.5, 0.01]);
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  const b = await board(p);
  assert.equal(b.spins, '1');
  assert.equal(b.spinsSub, '1 void');
  assert.equal(b.next, '#1');
  assert.equal(b.left, '12');
  await done(p);
});

test('undo walks back a pick and the counters follow', async () => {
  const p = await page(table(names12));
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  await p.evaluate(() => undoBtn.click());
  const b = await board(p);
  assert.equal(b.next, '#1');
  assert.equal(b.left, '12');
  assert.equal(b.latest, '—');
  assert.equal(b.spins, '1', 'undo does not un-spin');
  assert.match(await p.evaluate(() => boardLog.textContent), /1 undone/);
  await done(p);
});

test('undo after No One Is Safe gives the stolen seat back, not someone else\'s', async () => {
  const p = await page(table(['A', 'C', 'D'], ['X', 'Y', 'Z']));
  await scriptRandom(p);                                  // victim index 1 → Y
  await p.evaluate(() => showNoisWheel({ name: 'B', color: '#123456' }));
  await p.clock.runFor(15000);
  let s = await state(p);
  assert.deepEqual(s.picks, ['X', 'B', 'Z']);
  assert.equal((await board(p)).latest, 'B');
  await p.evaluate(() => undoBtn.click());
  s = await state(p);
  assert.deepEqual(s.picks, ['X', 'Y', 'Z'], 'Y is back in pick 2 and Z keeps pick 3');
  assert.deepEqual(s.names.sort(), ['A', 'B', 'C', 'D']);
  await done(p);
});

test('undo after a PANIC race puts every runner back in their own seat', async () => {
  const p = await page(table(['A', 'B', 'C'], ['D', 'E', 'F', 'G'], { panicEnabled: true }));
  await scriptRandom(p, [0.9]);                           // land on the PANIC wedge
  await p.evaluate(() => spin());
  await p.clock.runFor(80000);
  assert.deepEqual((await state(p)).picks, ['D', 'E', 'F']);
  await p.evaluate(() => undoBtn.click());
  const s = await state(p);
  assert.deepEqual(s.picks, ['D', 'E', 'F', 'G']);
  assert.deepEqual(s.names, ['A', 'B', 'C']);
  await done(p);
});

test('undoing the pick that drafted the last name standing undoes both', async () => {
  const p = await page(table(['Ada', 'Ben', 'Cleo'], [], { panicEnabled: false }));
  await scriptRandom(p);
  for (let i = 0; i < 2; i++) { await p.evaluate(() => spin()); await p.clock.runFor(15000); }
  assert.equal((await state(p)).names.length, 0);
  await p.evaluate(() => { closeDialog(splashOverlay); undoBtn.click(); });
  const s = await state(p);
  assert.equal(s.names.length, 2, 'two names back, so the wheel can spin again');
  assert.equal(s.picks.length, 1);
  await done(p);
});

test('a refresh during No One Is Safe never loses the winner', async () => {
  const p = await page(table(names12, ['X', 'Y'], { noisEnabled: true, panicEnabled: false }));
  const before = (await saved(p)).names.length + (await saved(p)).draftOrder.length;
  // spin, then force the 15% steal when the pick resolves
  await p.evaluate(() => {
    let n = 0; const real = Math.random;
    Math.random = () => 0.5;
    // every draw, not just the next: the confetti draws too
    window.__forceNois = () => { Math.random = () => 0.1; };
  });
  await p.evaluate(() => spin());
  await p.clock.runFor(8600);                             // landed, nameplate up
  await p.evaluate(() => window.__forceNois());
  await p.clock.runFor(2500);                             // the wheel of doom is spinning
  assert.equal(await p.evaluate(() => phase), 'nois');
  await p.reload();
  const s = await saved(p);
  assert.equal(s.names.length + s.draftOrder.length, before, 'nobody vanished');
  await done(p);
});

test('a spin is drawn on the slices it was solved against, even if Panic is toggled mid-spin', async () => {
  const p = await page(table(names12, ['X', 'Y'], { panicEnabled: false }));
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(2000);
  await p.evaluate(() => { panicToggle.checked = true; panicToggle.dispatchEvent(new Event('change')); });
  await p.clock.runFor(7000);                             // landed, before the pick commits
  const r = await p.evaluate(() => ({ landed: landed && landed.name, under: buildSegments(names.map(() => 1)) }));
  const underPointerName = await p.evaluate(() => {
    const seg = spinSeg || { weights: names.map(() => 1), labels: names.slice() };
    return seg.labels[underPointer(seg)];
  });
  assert.equal(underPointerName, r.landed, 'the pointer sits on the announced winner');
  await done(p);
});

test('Restore, Delete picks and Reset each come with an undo', async () => {
  for (const [btn, check] of [
    ['#restoreBtn', s => s.names.length === 12 && s.picks.length === 0],
    ['#draftClear', s => s.names.length === 10 && s.picks.length === 0],
    ['#resetBtn',   s => s.names.length === 0 && s.picks.length === 0],
  ]) {
    const p = await page(table(names12.slice(2), ['Ada', 'Ben'], { winnerSlots: 2 }));
    await p.evaluate(sel => document.querySelector(sel).click(), btn);
    assert.ok(check(await state(p)), btn + ' did its job');
    assert.equal(await p.evaluate(() => toast.classList.contains('show')), true, btn + ' offers an undo');
    await p.evaluate(() => toastUndoBtn.click());
    const s = await state(p);
    assert.deepEqual(s.picks, ['Ada', 'Ben'], btn + ' undone');
    assert.equal(s.names.length, 10);
    assert.equal((await saved(p)).draftOrder.length, 2, btn + ' undo is saved');
    await done(p);
  }
});

test('Reset and Delete picks leave the chosen winner slots alone', async () => {
  const p = await page(table(names12.slice(2), ['Ada', 'Ben'], { winnerSlots: 5 }));
  await p.evaluate(() => draftClear.click());
  await p.evaluate(() => resetBtn.click());
  assert.equal((await saved(p)).winnerSlots, 5);
  await done(p);
});

test('the PANIC cooldown survives a reload', async () => {
  const p = await page(table(['A', 'B', 'C'], ['D', 'E', 'F', 'G'], { panicEnabled: true }));
  await scriptRandom(p, [0.9]);
  await p.evaluate(() => spin());
  await p.clock.runFor(80000);
  await p.reload();
  assert.equal(await p.evaluate(() => panicSliceActive()), false);
  await done(p);
});

test('removing a name updates the head-count and the odds', async () => {
  const p = await page(table(['Ada', 'Ben', 'Cleo', 'Dmitri']), { clock: false });
  assert.match(await p.evaluate(() => tickerOdds.textContent), /25%/);
  await p.evaluate(() => nameListEl.querySelector('.remove-btn').click());
  assert.equal((await board(p)).left, '3');
  assert.match(await p.evaluate(() => tickerOdds.textContent), /33%/);
  await done(p);
});

test('the status line follows the wheel: ready, spinning, landed, ready again', async () => {
  const p = await page(table(names12, [], { winnerSlots: 1 }));
  const kind = () => p.evaluate(() => ticker.dataset.kind);
  assert.equal(await kind(), 'ready');
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(1000);
  assert.equal(await kind(), 'spinning');
  assert.notEqual(await p.evaluate(() => tickerOdds.textContent), '', 'the name under the pointer is shown');
  await p.clock.runFor(7000);
  assert.equal(await kind(), 'win');
  assert.match(await p.evaluate(() => tickerText.textContent), /takes pick #1 — winner/);
  await p.clock.runFor(5000);
  assert.equal(await kind(), 'ready');
  await done(p);
});

test('a v1 save from the original page loads with its draft intact and starts counting', async () => {
  const v1 = { names: ['Ada', 'ben', 'Ben'], draftOrder: [{ name: 'Cleo', color: '#b03a2e' }], undoStack: [{ name: 'Cleo', color: '#b03a2e' }],
               winnerSlots: 2, nameColors: { cleo: '#b03a2e' }, plotTwistsEnabled: false };
  const p = await page(v1, { clock: false });
  const s = await state(p);
  assert.deepEqual(s.names, ['Ada', 'ben'], 'a case-insensitive duplicate is dropped');
  assert.deepEqual(s.picks, ['Cleo']);
  assert.equal(s.stats.spins, 0);
  assert.equal(await p.evaluate(() => draftOrder[0].color), '#9b1f2e', 'old palette slot 0 maps to new slot 0');
  await p.evaluate(() => undoBtn.click());
  assert.deepEqual((await state(p)).picks, [], 'undo still works without a history');
  await done(p);
});
