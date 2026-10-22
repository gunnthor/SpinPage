// Gameplay regression suite. Every test here passes against the original
// single-file page as well as the redesign: they talk to the game through the
// saved table, the global game functions and a handful of control ids, never
// through layout. If one of these fails, a mechanic changed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, open, saved, scriptRandom, table, pressConfirmed } = require('./helpers');

let browser, site;
before(async () => { site = await serve(); browser = await launch(); });
after(async () => { await browser.close(); site.server.close(); });

const four = ['Ada', 'Ben', 'Cleo', 'Dmitri'];
const names = s => s.names;
const picks = s => s.draftOrder.map(p => p.name);

async function page(state, opts) {
  const p = await open(browser, site.url, { state, ...opts });
  return p;
}
async function done(p) {
  assert.deepEqual(p.errors, [], 'console errors: ' + p.errors.join(' | '));
  await p.context().close();
}

/* ── Selection ─────────────────────────────────────────────── */

test('a plain spin picks by weightedPick, takes the winner off the wheel and drafts them', async () => {
  const p = await page(table(four));
  await scriptRandom(p);                       // 0.5 everywhere: r = 2 of 4 → index 1
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  const s = await saved(p);
  assert.deepEqual(picks(s), ['Ben']);
  assert.deepEqual(names(s), ['Ada', 'Cleo', 'Dmitri']);
  assert.deepEqual(s.undoStack.map(x => x.name), ['Ben']);
  await done(p);
});

test('weightedPick follows the slice weights', async () => {
  const p = await page(table(four), { clock: false });
  const share = await p.evaluate(() => {
    let a = 0; const N = 200000;
    for (let i = 0; i < N; i++) if (weightedPick([1, 3]) === 0) a++;
    return a / N;
  });
  assert.ok(Math.abs(share - 0.25) < 0.01, `slice 0 won ${share}`);
  await done(p);
});

test('the last name standing is drafted automatically', async () => {
  const p = await page(table(['Ada', 'Ben']));
  await scriptRandom(p);                       // r = 1 of 2 → index 0
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  const s = await saved(p);
  assert.deepEqual(picks(s), ['Ada', 'Ben']);
  assert.deepEqual(names(s), []);
  await done(p);
});

test('an illegal spin changes nothing', async () => {
  const p = await page(table(four));
  await scriptRandom(p, [0.5, 0.5, 0.01]);     // pick, landing, illegal
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  const s = await saved(p);
  assert.deepEqual(picks(s), []);
  assert.deepEqual(names(s), four);
  await done(p);
});

test('rigged mode forces the first name with the prefix, and is never saved switched on', async () => {
  const p = await page(table(four, [], { riggedValue: 'cl' }));
  await p.evaluate(() => {
    const t = document.getElementById('riggedToggle');
    t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await scriptRandom(p, [0.0]);                // would be Ada if the draw were fair
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  assert.deepEqual(picks(await saved(p)), ['Cleo']);
  await p.reload();
  assert.equal(await p.evaluate(() => document.getElementById('riggedToggle').checked), false);
  assert.equal(await p.evaluate(() => document.getElementById('riggedInput').value), 'cl');
  await done(p);
});

test('a hand flick sets the show, never the result — forwards or backwards', async () => {
  for (const dir of [1, -1]) {
    const p = await page(table(four));
    await scriptRandom(p);
    await p.evaluate(d => beginSpin({ vel: 0.012, dir: d, power: 0.35, popOff: false, stunt: 'bounce' }), dir);
    await p.clock.runFor(15000);
    assert.deepEqual(picks(await saved(p)), ['Ben'], `dir ${dir}`);
    await done(p);
  }
});

/* ── Stunts change the route, never the winner ─────────────── */

test('wind-back runs and still lands on the drawn winner', async () => {
  const p = await page(table(four, [], { windBackEnabled: true }));
  await p.evaluate(() => {
    window.__wb = 0; const real = triggerWindBack;
    window.triggerWindBack = function () { window.__wb++; return real.apply(this, arguments); };
  });
  await scriptRandom(p, [0.5, 0.5, 0.5, 0.1]); // pick, landing, illegal, wind-back
  await p.evaluate(() => spin());
  await p.clock.runFor(20000);
  assert.equal(await p.evaluate(() => window.__wb), 1);
  assert.deepEqual(picks(await saved(p)), ['Ben']);
  await done(p);
});

test('the gremlin creeps the wheel and still lands on the drawn winner', async () => {
  const p = await page(table(four, [], { goblinEnabled: true }));
  await p.evaluate(() => {
    window.__beats = []; const real = triggerGoblinBeat;
    window.triggerGoblinBeat = function (k) { window.__beats.push(k); return real.apply(this, arguments); };
  });
  await scriptRandom(p, [0.5, 0.5, 0.5, 0.01]); // pick, landing, illegal, gremlin fires
  await p.evaluate(() => spin());
  await p.clock.runFor(150000);
  const beats = await p.evaluate(() => window.__beats);
  assert.equal(beats[0], 'arrive');
  assert.equal(beats[beats.length - 1], 'release');
  assert.deepEqual(picks(await saved(p)), ['Ben']);
  await done(p);
});

test('a pop-off flies the wheel and re-seats it on the drawn winner', async () => {
  const p = await page(table(four, [], { popOffEnabled: true }));
  await p.evaluate(() => {
    window.__pop = 0; const real = startPopOff;
    window.startPopOff = function () { window.__pop++; return real.apply(this, arguments); };
  });
  await scriptRandom(p);
  await p.evaluate(() => beginSpin({ vel: 0.03, dir: 1, power: 1, popOff: true, stunt: 'roll' }));
  await p.clock.runFor(20000);
  assert.equal(await p.evaluate(() => window.__pop), 1);
  assert.deepEqual(picks(await saved(p)), ['Ben']);
  await done(p);
});

test('the gremlin is likelier as the wheel empties', async () => {
  const p = await page(table(four), { clock: false });
  const c = await p.evaluate(() => [goblinChance(3), goblinChance(7), goblinChance(12), goblinChance(50)]);
  assert.ok(Math.abs(c[0] - 0.30) < 1e-9);
  assert.ok(c[1] < c[0] && c[1] > c[2]);
  assert.ok(Math.abs(c[2] - 0.05) < 1e-9);
  assert.ok(Math.abs(c[3] - 0.05) < 1e-9);
  await done(p);
});

/* ── Power-ups ─────────────────────────────────────────────── */

test('Hot Seat triples one slice, shifts the real odds and says so', async () => {
  const p = await page(table(four, [], { powerUpsEnabled: true }));
  // drop a power-up, make it Hot Seat, put it on index 2 (Cleo)
  await scriptRandom(p, [0.1, 0.1, 0.6]);
  await p.evaluate(() => spin());
  await p.clock.runFor(1500);
  const text = await p.evaluate(() => document.body.innerText);
  assert.match(text, /25%\s*→\s*50%/, 'the 25% → 50% odds change is on screen');
  await p.clock.runFor(15000);
  // weights [1,1,3,1]: r = 3 of 6 lands in Cleo's tripled slice
  assert.deepEqual(picks(await saved(p)), ['Cleo']);
  assert.equal(await p.evaluate(() => chanceOf([1, 1, 3, 1], 2)), 0.5);
  await done(p);
});

/* ── PANIC ─────────────────────────────────────────────────── */

test('the PANIC wedge appears once two are drafted and is capped at a quarter of the wheel', async () => {
  const p = await page(table(['A', 'B', 'C'], ['D', 'E'], { panicEnabled: true }), { clock: false });
  const seg = await p.evaluate(() => buildSegments([1, 1, 1]));
  assert.deepEqual(seg.labels, ['A', 'B', 'C', 'PANIC']);
  assert.equal(seg.panicIndex, 3);
  assert.equal(seg.weights[3], 0.8);
  const thin = await p.evaluate(() => buildSegments([0.3]).weights[1]);
  assert.ok(Math.abs(thin - 0.1) < 1e-9, 'capped to a third of the player weight');
  assert.ok(Math.abs(await p.evaluate(() => chanceOf([1, 1, 1], 0)) - 1 / 3.8) < 1e-9);
  await done(p);
});

test('landing on PANIC races the drafted field: the majority survive, the rest go back on the wheel', async () => {
  const p = await page(table(['A', 'B', 'C'], ['D', 'E', 'F', 'G'], { panicEnabled: true }));
  await scriptRandom(p, [0.9]);                // r = 3.42 of 3.8 → the PANIC wedge
  await p.evaluate(() => spin());
  await p.clock.runFor(80000);
  const s = await saved(p);
  assert.deepEqual(picks(s), ['D', 'E', 'F']);
  assert.deepEqual(names(s), ['A', 'B', 'C', 'G']);
  assert.deepEqual(s.undoStack.map(x => x.name), ['D', 'E', 'F']);
  assert.equal(await p.evaluate(() => panicSliceActive()), false, 'no PANIC twice in a row');
  await done(p);
});

test('the hurdle odds punish speed, with a floor', async () => {
  const p = await page(table(four), { clock: false });
  const o = await p.evaluate(() => [hurdleOdds(0.9, 1, 1), hurdleOdds(0.9, 2, 1), hurdleOdds(0.4, 3, 1)]);
  assert.ok(Math.abs(o[0] - 0.9) < 1e-9);
  assert.ok(Math.abs(o[1] - 0.65) < 1e-9);
  assert.ok(Math.abs(o[2] - 0.25) < 1e-9);
  await done(p);
});

/* ── No One Is Safe ────────────────────────────────────────── */

test('No One Is Safe: the new pick takes a drafted seat and the victim returns to the wheel', async () => {
  const p = await page(table(['A', 'C', 'D'], ['X', 'Y'], { noisEnabled: true }));
  await scriptRandom(p);                       // victim index floor(0.5 * 2) = 1 → Y
  await p.evaluate(() => showNoisWheel({ name: 'B', color: '#123456' }));
  await p.clock.runFor(15000);
  const s = await saved(p);
  assert.deepEqual(picks(s), ['X', 'B']);
  assert.deepEqual(names(s), ['A', 'C', 'D', 'Y']);
  assert.deepEqual(s.undoStack.map(x => x.name), ['X', 'B']);
  await done(p);
});

/* ── Autospin ──────────────────────────────────────────────── */

test('autospin drafts the whole table', async () => {
  const p = await page(table(['A', 'B', 'C', 'D', 'E']));
  await scriptRandom(p);
  await p.evaluate(() => document.getElementById('autoBtn').click());
  await p.clock.runFor(120000);
  const s = await saved(p);
  assert.equal(s.draftOrder.length, 5);
  assert.deepEqual(names(s), []);
  await done(p);
});

test('autospin can be called off mid-spin', async () => {
  const p = await page(table(['A', 'B', 'C', 'D', 'E']));
  await scriptRandom(p);
  await p.evaluate(() => document.getElementById('autoBtn').click());
  await p.clock.runFor(2000);
  await p.evaluate(() => document.getElementById('autoBtn').click());
  await p.clock.runFor(60000);
  assert.equal((await saved(p)).draftOrder.length, 1);
  await done(p);
});

/* ── Draft management ──────────────────────────────────────── */

test('undo puts the last pick back on the wheel', async () => {
  const p = await page(table(four));
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  await p.evaluate(() => document.getElementById('undoBtn').click());
  await p.clock.runFor(100);
  const s = await saved(p);
  assert.deepEqual(picks(s), []);
  assert.deepEqual(names(s), ['Ada', 'Cleo', 'Dmitri', 'Ben']);
  await done(p);
});

test('restore puts every pick back on the wheel', async () => {
  const p = await page(table(['Ada'], ['Ben', 'Cleo']));
  await pressConfirmed(p, '#restoreBtn');
  const s = await saved(p);
  assert.deepEqual(picks(s), []);
  assert.deepEqual(names(s), ['Ada', 'Ben', 'Cleo']);
  await done(p);
});

test('clear empties the draft without returning anyone to the wheel', async () => {
  const p = await page(table(['Ada'], ['Ben', 'Cleo']));
  await pressConfirmed(p, '#draftClear');
  const s = await saved(p);
  assert.deepEqual(picks(s), []);
  assert.deepEqual(names(s), ['Ada']);
  await done(p);
});

test('reset wipes the table', async () => {
  const p = await page(table(['Ada'], ['Ben', 'Cleo']));
  await pressConfirmed(p, '#resetBtn');
  const s = await saved(p);
  assert.deepEqual(picks(s), []);
  assert.deepEqual(names(s), []);
  await done(p);
});

test('copy lists winners then losers by pick', async () => {
  const p = await page(table([], ['Ada', 'Ben', 'Cleo'], { winnerSlots: 2 }), { clock: false });
  assert.equal(await p.evaluate(() => formatDraftCopy()),
    'WINNERS\n1st pick: Ada\n2nd pick: Ben\n\nLOSERS\n3rd pick: Cleo');
  await done(p);
});

test('winner slots never exceed the table', async () => {
  const p = await page(table(['Ada', 'Ben', 'Cleo'], [], { winnerSlots: 99 }), { clock: false });
  assert.equal(await p.evaluate(() => document.getElementById('draftSlotsInput').value), '3');
  await done(p);
});

/* ── Names ─────────────────────────────────────────────────── */

test('duplicate names are refused whatever the case, including drafted players', async () => {
  const p = await page(table(['Ada', 'Ben'], ['Cleo']), { clock: false });
  for (const n of ['ada', ' BEN ', 'cleo']) {
    await p.fill('#nameInput', n);
    await p.press('#nameInput', 'Enter');
  }
  await p.fill('#nameInput', 'Dmitri');
  await p.press('#nameInput', 'Enter');
  assert.deepEqual(names(await saved(p)), ['Ada', 'Ben', 'Dmitri']);
  await done(p);
});

/* ── Persistence ───────────────────────────────────────────── */

test('every option survives a reload', async () => {
  const p = await page(table(four, [], {
    windBackEnabled: false, goblinEnabled: false, powerUpsEnabled: false, popOffEnabled: false,
    noisEnabled: false, panicEnabled: false, autoDisplay: false, displayDuration: 4000, riggedValue: 'Be',
  }), { clock: false });
  const read = () => p.evaluate(() => ({
    wb: document.getElementById('windBackToggle').checked,
    gob: document.getElementById('goblinToggle').checked,
    pu: document.getElementById('powerUpToggle').checked,
    pop: document.getElementById('popOffToggle').checked,
    nois: document.getElementById('noisToggle').checked,
    panic: document.getElementById('panicToggle').checked,
    auto: document.getElementById('autoDisplayToggle').checked,
    slider: document.getElementById('displaySlider').value,
    rig: document.getElementById('riggedInput').value,
  }));
  assert.deepEqual(await read(), { wb: false, gob: false, pu: false, pop: false, nois: false, panic: false, auto: false, slider: '4', rig: 'Be' });
  await p.evaluate(() => {
    const t = document.getElementById('goblinToggle');
    t.checked = true; t.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.reload();
  assert.equal((await read()).gob, true);
  assert.equal((await saved(p)).goblinEnabled, true);
  await done(p);
});

test('the old plotTwistsEnabled setting still switches wind-back off', async () => {
  const p = await page({ names: four, draftOrder: [], undoStack: [], plotTwistsEnabled: false }, { clock: false });
  assert.equal(await p.evaluate(() => document.getElementById('windBackToggle').checked), false);
  await done(p);
});

test('a corrupt save boots an empty table without errors', async () => {
  const p = await page('{not json', { clock: false });
  assert.equal(await p.evaluate(() => typeof spin), 'function');
  await p.fill('#nameInput', 'Ada');
  await p.press('#nameInput', 'Enter');
  assert.deepEqual(names(await saved(p)), ['Ada']);
  await done(p);
});

test('saved picks keep their place and pick up stable colours on load', async () => {
  const p = await page({ names: ['Ada'], draftOrder: [{ name: ' Ben ' }, { bogus: 1 }, { name: 'Cleo', color: 7 }], undoStack: [] }, { clock: false });
  await p.evaluate(() => saveState());
  const s = await saved(p);
  assert.deepEqual(picks(s), ['Ben', 'Cleo']);
  assert.ok(s.draftOrder.every(x => /^#[0-9a-f]{6}$/i.test(x.color)));
  await done(p);
});
