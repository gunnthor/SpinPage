// What the final cross-agent review found, pinned down so it stays fixed:
// the result on screen agrees with the draw, no save can lose a player, an
// old undo can't overwrite newer picks, Space does what the hint says, and
// the live numbers stay whole at every width.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, open, saved, scriptRandom, table } = require('./helpers');

let browser, site;
before(async () => { site = await serve(); browser = await launch(); });
after(async () => { await browser.close(); site.server.close(); });

const N12 = ['Ada', 'Ben', 'Cleo', 'Dmitri', 'Esme', 'Farouk', 'Gwen', 'Hiro', 'Ines', 'Jonas', 'Kaia', 'Luca'];
const N20 = Array.from({ length: 20 }, (_, i) => 'P' + (i + 1));

async function done(p, allow = []) {
  const errors = p.errors.filter(e => !allow.some(a => e.includes(a)));
  assert.deepEqual(errors, [], 'console errors: ' + errors.join(' | '));
  await p.context().close();
}
// The name under the pointer, on the slices as they are drawn right now.
const underNow = p => p.evaluate(() => {
  const seg = spinSeg || buildSegments(getWeights());
  return seg.labels[underPointer(seg)];
});
// A plain spin with the 15% No One Is Safe forced when the pick resolves.
async function spinIntoNois(p) {
  // Every draw reads 0.1 from the landing until the steal is decided: the
  // confetti draws too, so "only the next call" would be a race.
  await p.evaluate(() => {
    Math.random = () => 0.5;
    window.__forceNois = () => { Math.random = () => 0.1; };
  });
  await p.evaluate(() => spin());
  await p.clock.runFor(8600);                     // landed, nameplate up
  await p.evaluate(() => window.__forceNois());
  await p.clock.runFor(700);                      // off the wheel, the seats not up yet
  assert.ok(await p.evaluate(() => !!pendingPick), 'a winner is waiting on No One Is Safe');
}

test('the page leaves window.history alone, so the analytics script runs clean', async () => {
  const p = await open(browser, site.url, { state: table(N12) });
  assert.equal(await p.evaluate(() => typeof history.pushState), 'function');
  // what Vercel's insights script does first thing
  await p.addScriptTag({ content: 'window.__pushed = typeof history.pushState.bind(history);' });
  assert.equal(await p.evaluate(() => window.__pushed), 'function');
  await done(p);
});

test('a power-up landing stays on the slices it was drawn on: the pointer is on the announced winner', async () => {
  const p = await open(browser, site.url, { state: table(['Ada', 'Ben', 'Cleo', 'Dmitri'], [], { powerUpsEnabled: true }) });
  await scriptRandom(p, [0.1, 0.1, 0.6]);           // Hot Seat on Cleo
  await p.evaluate(() => spin());
  await p.clock.runFor(9500);                        // landed, the pick not seated yet
  const landedName = await p.evaluate(() => landed && landed.name);
  assert.equal(landedName, 'Cleo');
  assert.equal(await underNow(p), 'Cleo', 'pointer and nameplate agree');
  await done(p);
});

test('the first spin after a PANIC race lands without the wedge coming back under the pointer', async () => {
  const p = await open(browser, site.url, { state: table(N12.slice(2), ['Ada', 'Ben'], { panicEnabled: true, panicCooldown: true }) });
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(8300);                        // landed: the cooldown is cleared here
  const landedName = await p.evaluate(() => landed && landed.name);
  assert.ok(landedName);
  assert.equal(await underNow(p), landedName);
  await done(p);
});

test('no save during No One Is Safe can lose the winner: Sound clicked in the gap, then a reload', async () => {
  const p = await open(browser, site.url, { state: table(N12, ['X', 'Y'], { noisEnabled: true }) });
  const total = 14;
  await spinIntoNois(p);
  await p.evaluate(() => soundBtn.click());          // saves
  await p.reload();
  const s = await saved(p);
  assert.equal(s.names.length + s.draftOrder.length, total, 'nobody vanished');
  await done(p);
});

test('a dialog opened mid-spin gives way to No One Is Safe', async () => {
  const p = await open(browser, site.url, { state: table(N12, ['X', 'Y'], { noisEnabled: true }) });
  await p.evaluate(() => { Math.random = () => 0.5; });
  await p.evaluate(() => spin());
  await p.clock.runFor(2000);
  await p.evaluate(() => openDialog(settingsDialog));
  await p.evaluate(() => { window.__f = () => { Math.random = () => 0.1; }; });
  await p.clock.runFor(6600);
  await p.evaluate(() => window.__f());
  await p.clock.runFor(2000);                        // the seats are up
  assert.equal(await p.evaluate(() => !!seatWheel), true);
  assert.equal(await p.evaluate(() => settingsDialog.open), false, 'Settings closed, the wheel is in view');
  await done(p);
});

test('if No One Is Safe throws, the app recovers and the winner goes back on the wheel', async () => {
  const p = await open(browser, site.url, { state: table(N12, ['X', 'Y'], { noisEnabled: true }) });
  await spinIntoNois(p);
  await p.evaluate(() => { seatLanded = () => { throw new Error('boom on the seats'); }; });
  await p.clock.runFor(9000);
  const s = await p.evaluate(() => ({ busy: isBusy, spinning: isSpinning, seats: !!seatWheel, event: app.dataset.event || null,
                                      count: names.length + draftOrder.length, pending: pendingPick }));
  assert.deepEqual(s, { busy: false, spinning: false, seats: false, event: null, count: 14, pending: null });
  await done(p, ['boom on the seats']);
});

/* ── No One Is Safe on the stage ── */

// spinIntoNois's timings assume a big table: these keep it at 16.
const SEATS = ['Xavi', 'Yara', 'Zoe', 'Wren'];
// Forced into the event, then run until the seats are up and turning.
async function seatsUp(vp) {
  const p = await open(browser, site.url, { viewport: vp, state: table(N12, SEATS, { noisEnabled: true }) });
  await spinIntoNois(p);
  await p.clock.runFor(2000);
  return p;
}
// Is the centre of this control the control itself, i.e. nothing on top of it?
const reachable = (p, id) => p.evaluate(id => {
  const el = document.getElementById(id), b = el.getBoundingClientRect();
  return b.width > 0 && b.bottom <= innerHeight && el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
}, id);

test('No One Is Safe plays on the wheel: no takeover, the drafted seats on the face, the console in reach', async () => {
  for (const vp of ['d1366', 'd1024', 'm375', 'm320', 'l667']) {
    const p = await seatsUp(vp);
    const s = await p.evaluate(() => ({
      phase, inert: app.inert, event: app.dataset.event,
      seats: seatWheel && seatWheel.seg.labels.join(','), drafted: draftOrder.map(d => d.name).join(','),
      takeover: !!document.querySelector('.takeover.show'),
      spin: spinLabel.textContent, autoOff: autoBtn.getAttribute('aria-disabled'),
    }));
    assert.deepEqual(s, { phase: 'nois', inert: false, event: 'nois', seats: s.drafted, drafted: s.drafted,
                          takeover: false, spin: 'Skip', autoOff: 'false' }, vp);
    for (const id of ['autoBtn', 'spinBtn', 'wheel', 'statNext', 'statLeftNum']) assert.equal(await reachable(p, id), true, `${vp}: ${id} in reach`);
    await done(p);
  }
});

test('Auto switched on during No One Is Safe carries the draft on afterwards', async () => {
  const p = await seatsUp('m375');
  await p.click('#autoBtn');
  const mid = await p.evaluate(() => ({ auto: autoSpin, spinning: isSpinning, phase, pressed: autoBtn.getAttribute('aria-pressed') }));
  assert.deepEqual(mid, { auto: true, spinning: false, phase: 'nois', pressed: 'true' }, 'armed, not spinning the table mid-event');
  await p.evaluate(() => { Math.random = () => 0.5; });
  await p.clock.runFor(10000);                       // the event ends; autospin takes the next pick
  const after = await p.evaluate(() => ({ seats: !!seatWheel, spinning: isSpinning, steals: spinLog.steals }));
  assert.deepEqual(after, { seats: false, spinning: true, steals: 1 }, 'autospin spun again after the event');
  await done(p);
});

test('Auto switched off during No One Is Safe stops the draft after it', async () => {
  const p = await open(browser, site.url, { state: table(N12, SEATS, { noisEnabled: true }) });
  await p.evaluate(() => setAutoSpin(true));
  await spinIntoNois(p);
  await p.clock.runFor(2000);
  await p.click('#autoBtn');
  assert.equal(await p.evaluate(() => autoSpin), false);
  await p.evaluate(() => { Math.random = () => 0.5; });
  await p.clock.runFor(15000);
  assert.equal(await p.evaluate(() => isSpinning || isBusy), false, 'nothing spun after the event');
  await done(p);
});

test('the seat wheel lands with the pointer on the seat that is lost, and the board agrees', async () => {
  const p = await seatsUp('d1366');
  await p.clock.runFor(5000);                        // landed (a 4.4s spin), the seat not swapped yet
  const s = await p.evaluate(() => ({
    victim: seatWheel && seatWheel.victim,
    under: seatWheel && seatWheel.seg.labels[underPointer(seatWheel.seg)],
    plate: winName.textContent, lost: [...draftGrid.querySelectorAll('.pick.lost .pick-name')].map(e => e.textContent),
  }));
  assert.ok(s.victim);
  assert.equal(s.under, s.victim, 'pointer on the lost seat');
  assert.equal(s.plate, s.victim, 'nameplate names it');
  assert.deepEqual(s.lost, [s.victim], 'the board marks it');
  await done(p);
});

test('SPIN is Skip while the seats spin, and Esc skips too; the seat lost is the one drawn', async () => {
  const drawn = [];
  for (const how of ['none', 'click', 'esc']) {
    const p = await seatsUp('d1366');
    if (how === 'click') await p.click('#spinBtn');
    if (how === 'esc') await p.keyboard.press('Escape');
    await p.clock.runFor(how === 'none' ? 5000 : 200);
    drawn.push(await p.evaluate(() => seatWheel && seatWheel.victim));
    await done(p);
  }
  assert.ok(drawn[0]);
  assert.deepEqual(drawn, [drawn[0], drawn[0], drawn[0]]);
});

test('Space after clicking Undo spins; it does not undo a second pick', async () => {
  const p = await open(browser, site.url, { state: table(N12.slice(3), N12.slice(0, 3)) });
  await scriptRandom(p);
  await p.click('#undoBtn');
  assert.equal(await p.evaluate(() => draftOrder.length), 2);
  await p.keyboard.press('Space');
  assert.equal(await p.evaluate(() => draftOrder.length), 2, 'still two picks');
  assert.equal(await p.evaluate(() => isSpinning), true, 'and the wheel is spinning');
  await done(p);
});

test('Space on the draft board reached by keyboard scrolls it; Shift+Space never spins', async () => {
  const N50 = Array.from({ length: 50 }, (_, i) => 'Player ' + (i + 1));
  const p = await open(browser, site.url, { state: table(N50.slice(20), N50.slice(0, 20)) });
  await scriptRandom(p);
  await p.evaluate(() => { draftGrid.tabIndex = 0; draftGrid.focus(); });
  await p.keyboard.press('ArrowDown');               // arrived and moving by keyboard
  await p.keyboard.press('Space');
  assert.equal(await p.evaluate(() => isSpinning), false, 'the board keeps Space to scroll');
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Shift+Space');
  assert.equal(await p.evaluate(() => isSpinning), false, 'Shift+Space never spins');
  await p.keyboard.press('Space');
  assert.equal(await p.evaluate(() => isSpinning), true, 'plain Space from the page still does');
  await done(p);
});

test("the undo toast is retired once the table changes: it can't erase a newer pick or name", async () => {
  const p = await open(browser, site.url, { state: table(N12.slice(2), ['Ada', 'Ben']) });
  await p.evaluate(() => draftClear.click());
  assert.equal(await p.evaluate(() => toast.classList.contains('show')), true);
  await p.fill('#nameInput', 'Zed');
  await p.press('#nameInput', 'Enter');
  await p.clock.runFor(50);
  assert.equal(await p.evaluate(() => toast.classList.contains('show')), false, 'the stale Undo is gone');
  assert.ok((await saved(p)).names.includes('Zed'));
  await done(p);
});

test('the toast never covers SPIN, the tab bar or an open sheet', async () => {
  for (const vp of ['m320', 'm375', 'd1280x620', 'd1366']) {
    const p = await open(browser, site.url, { viewport: vp, state: table(N12.slice(2), ['Ada', 'Ben']) });
    await p.evaluate(() => draftClear.click());
    await p.clock.runFor(400);
    const r = await p.evaluate(() => {
      const t = toast.getBoundingClientRect(), s = spinBtn.getBoundingClientRect(), tb = tabbar.getBoundingClientRect();
      const hit = (a, b) => !!(b.width && b.height && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom);
      return { spin: hit(t, s), tabs: hit(t, tb), shown: toast.classList.contains('show') };
    });
    assert.deepEqual(r, { spin: false, tabs: false, shown: true }, vp);
    await done(p);
  }
  const p = await open(browser, site.url, { viewport: 'm375', state: table(N12.slice(2), ['Ada', 'Ben']) });
  await p.evaluate(() => openPanel(boardPanel));
  await p.clock.runFor(400);
  await p.evaluate(() => draftClear.click());
  await p.clock.runFor(400);
  const over = await p.evaluate(() => toast.getBoundingClientRect().bottom > boardPanel.getBoundingClientRect().top + 1);
  assert.equal(over, false, 'the toast sits above the open sheet');
  await done(p);
});

test('the nameplate holds long enough to read on a big table, and the numbers move with it', async () => {
  const p = await open(browser, site.url, { state: table(N20) });
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(8000);                        // landed (600ms display at 20 names)
  const atLanding = await p.evaluate(() => ({ next: statNext.textContent, left: statLeftNum.textContent, latest: statLatestName.textContent, landed: landed && landed.name }));
  assert.equal(atLanding.next, '#2', 'Next moves on the landing frame');
  assert.equal(atLanding.left, '19');
  assert.equal(atLanding.latest, atLanding.landed);
  await p.clock.runFor(1500);                        // seated, the plate still up
  assert.equal(await p.evaluate(() => draftOrder.length), 1);
  assert.equal(await p.evaluate(() => winCallout.classList.contains('show')), true, 'still readable');
  await p.clock.runFor(1500);
  assert.equal(await p.evaluate(() => winCallout.classList.contains('show')), false);
  await done(p);
});

test('a winner display time set by hand is kept exactly', async () => {
  const p = await open(browser, site.url, { state: table(N20, [], { autoDisplay: false, displayDuration: 600 }) });
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(8000);
  assert.equal(await p.evaluate(() => winCallout.classList.contains('show')), true);
  await p.clock.runFor(800);
  assert.equal(await p.evaluate(() => winCallout.classList.contains('show')), false);
  await done(p);
});

test('loser picks get a loser line, never a jackpot', async () => {
  const p = await open(browser, site.url, { state: table(N12.slice(1), ['Ada']) });
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(8000);
  const r = await p.evaluate(() => ({ kicker: winKicker.textContent, sub: winSub.textContent }));
  assert.match(r.kicker, /Loser/);
  assert.equal(await p.evaluate(s => CONSOLATION.includes(s), r.sub), true);
  await done(p);
});

test('the live numbers are never cut off: 1024x700, 667x375 and 844x390', async () => {
  for (const vp of ['d1024', 'l667', 'l844', 'm320']) {
    const p = await open(browser, site.url, { viewport: vp, state: table(N12.slice(5), N12.slice(0, 5), { winnerSlots: 3 }), clock: false });
    const r = await p.evaluate(() => {
      const cut = ['statNext', 'statNextSub', 'statLeftNum', 'statLeftSub', 'statLatestName', 'statSpins']
        .map(id => document.getElementById(id))
        .filter(el => el.offsetParent && el.scrollWidth > el.clientWidth + 1).map(el => el.id);
      const covered = ['undoBtn', 'autoBtn', 'spinBtn'].filter(id => {
        const b = document.getElementById(id).getBoundingClientRect();
        return !document.getElementById(id).contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
      });
      return { cut, covered };
    });
    assert.deepEqual(r, { cut: [], covered: [] }, vp);
    await done(p);
  }
});

test('the first gremlin sighting is remembered, so his odds settle after it', async () => {
  const p = await open(browser, site.url, { state: table(N12.slice(0, 4), [], { goblinEnabled: true }) });
  assert.equal(await p.evaluate(() => goblinSeen), false);
  await scriptRandom(p, [0.5, 0.5, 0.5, 0.01]);       // pick, landing, illegal, gremlin fires
  await p.evaluate(() => spin());
  await p.clock.runFor(6000);                         // he has climbed on
  assert.equal(await p.evaluate(() => stunt), 'gremlin');
  assert.equal((await saved(p)).goblinSeen, true, 'saved the moment he turns up');
  await p.reload();
  assert.equal(await p.evaluate(() => goblinSeen), true, 'and still true after a reload');
  await done(p);
});

test('autospin can be switched off and on from inside the race takeover', async () => {
  const p = await open(browser, site.url, { state: table(['A', 'B', 'C'], ['X', 'Y', 'Z']) });
  await scriptRandom(p);
  await p.evaluate(() => { setAutoSpin(true); isBusy = true; startMarbleRace(); });
  await p.clock.runFor(500);
  const btn = '#marbleOverlay [data-auto-toggle]';
  assert.equal(await p.evaluate(s => document.querySelector(s).textContent, btn), 'Stop autospin');
  await p.click(btn);
  assert.equal(await p.evaluate(() => autoSpin), false);
  assert.equal(await p.evaluate(s => document.querySelector(s).textContent, btn), 'Autospin after this');
  await p.click(btn);
  assert.equal(await p.evaluate(() => autoSpin), true);
  assert.equal(await p.evaluate(() => marbleOverlay.classList.contains('show')), true, 'the race runs on');
  await done(p);
});

test('Auto switched on mid-spin takes over from the next pick', async () => {
  const p = await open(browser, site.url, { state: table(N12) });
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(2000);
  assert.equal(await p.evaluate(() => autoBtn.getAttribute('aria-disabled')), 'false', 'Auto is live mid-spin');
  await p.click('#autoBtn');
  await p.clock.runFor(30000);
  assert.ok(await p.evaluate(() => draftOrder.length) >= 2, 'it kept spinning');
  await done(p);
});

test('Esc skips a takeover, and Calm effects skip the race outright', async () => {
  const p = await open(browser, site.url, { state: table(['A', 'B', 'C'], ['X', 'Y', 'Z']) });
  await scriptRandom(p);
  await p.evaluate(() => { isBusy = true; startMarbleRace(); });
  await p.clock.runFor(300);
  await p.keyboard.press('Escape');
  await p.clock.runFor(100);
  assert.equal(await p.evaluate(() => marbleOverlay.classList.contains('done')), true, 'Esc ran it to the result');
  await done(p);

  const q = await open(browser, site.url, { state: table(['A', 'B', 'C'], ['X', 'Y', 'Z']), reducedMotion: 'reduce' });
  await scriptRandom(q);
  await q.evaluate(() => { isBusy = true; startMarbleRace(); });
  await q.clock.runFor(200);
  assert.equal(await q.evaluate(() => marbleOverlay.classList.contains('done')), true, 'Calm: straight to the result');
  await done(q);
});

test('a name is never cut through the middle of an emoji', async () => {
  const p = await open(browser, site.url, { state: table([]) });
  const r = await p.evaluate(() => splitNames('a'.repeat(29) + '🦄🦄')[0]);
  assert.equal(Array.from(r).length, 30);
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(r), false, 'no half a character');
  await done(p);
});
