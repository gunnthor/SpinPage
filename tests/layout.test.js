// The one-screen promise and the accessibility basics, checked in a real
// browser at every target size: nothing scrolls, the wheel, SPIN and the
// live numbers are always on screen, phones get finger-sized targets, and
// the keyboard and screen-reader paths work.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, open, scriptRandom, table, VIEWPORTS } = require('./helpers');

let browser, site;
before(async () => { site = await serve(); browser = await launch(); });
after(async () => { await browser.close(); site.server.close(); });

const N12 = ['Ada', 'Ben', 'Cleo', 'Dmitri', 'Esme', 'Farouk', 'Gwen', 'Hiro', 'Ines', 'Jonas', 'Kaia', 'Luca'];
const N50 = Array.from({ length: 50 }, (_, i) => 'Player ' + (i + 1));
const STATES = {
  empty: null,
  draft: table(N12.slice(5), N12.slice(0, 5), { winnerSlots: 3, panicEnabled: true }),
  big:   table(N50.slice(8), N50.slice(0, 8), { winnerSlots: 3, panicEnabled: true }),
};

// Everything that must be visible without scrolling, by viewport.
const MUST = ['#wheelStage', '#spinBtn', '#scoreboard', '#ticker', '#statNext', '#statLeftNum', '#statLatestName', '#statSpins'];

function measure(p) {
  return p.evaluate(sels => {
    const out = { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
                  w: innerWidth, h: innerHeight, layout: layout(), off: [], covered: [] };
    for (const sel of sels) {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.off.push(sel);
    }
    // Nothing may sit on top of SPIN.
    const s = spinBtn.getBoundingClientRect();
    const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
    if (!spinBtn.contains(hit)) out.covered.push('#spinBtn under ' + (hit && (hit.id || hit.className)));
    out.wheel = Math.round(canvas.getBoundingClientRect().width);
    return out;
  }, MUST);
}

for (const vp of ['d1920', 'd1440', 'd1366', 'd1280x620', 'd1024', 't768', 'm430', 'm390', 'm375', 'm375safari', 'm360', 'm320', 'l844', 'l667']) {
  test(`${vp}: one screen, nothing scrolls, the wheel, SPIN and the numbers are all in view`, async () => {
    for (const [name, state] of Object.entries(STATES)) {
      const p = await open(browser, site.url, { viewport: vp, state, clock: false });
      const m = await measure(p);
      const where = `${vp}/${name}`;
      assert.ok(m.scrollH <= m.h + 1, `${where}: page scrolls ${m.scrollH} > ${m.h}`);
      assert.ok(m.scrollW <= m.w + 1, `${where}: sideways overflow ${m.scrollW} > ${m.w}`);
      assert.equal(m.w, VIEWPORTS[vp].width, `${where}: the layout viewport was widened`);
      assert.deepEqual(m.off, [], `${where}: off screen`);
      assert.deepEqual(m.covered, [], `${where}: covered`);
      assert.deepEqual(p.errors, [], `${where}: console errors`);
      await p.context().close();
    }
  });
}

test('phone wheels use the width: >= 270px at 320x568, >= 320px at 375x667', async () => {
  for (const [vp, min] of [['m320', 270], ['m375', 320], ['m390', 330]]) {
    const p = await open(browser, site.url, { viewport: vp, state: STATES.draft, clock: false });
    const m = await measure(p);
    assert.ok(m.wheel >= min, `${vp}: wheel ${m.wheel}px`);
    await p.context().close();
  }
});

test('phones: every control in reach is at least 44x44, and inputs are 16px (no iOS zoom)', async () => {
  for (const vp of ['m375', 'm320', 'l667']) {
    for (const panel of [null, 'playersPanel', 'boardPanel']) {
      const p = await open(browser, site.url, { viewport: vp, state: STATES.draft });
      if (panel) { await p.evaluate(id => openPanel(document.getElementById(id)), panel); await p.clock.runFor(400); await p.waitForTimeout(350); }
      const small = await p.evaluate(() => {
        const bad = [];
        document.querySelectorAll('.app button, .app input, .app [role="button"]').forEach(el => {
          if (el.closest('[inert]')) return;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') return;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return;
          if (el.type === 'range') return;
          if (r.width < 43.5 || r.height < 43.5) bad.push(`${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (el.tagName === 'INPUT' && parseFloat(cs.fontSize) < 16) bad.push(`${el.id} font ${cs.fontSize}`);
        });
        return bad;
      });
      assert.deepEqual(small, [], `${vp}${panel ? ' with ' + panel : ''}`);
      await p.context().close();
    }
  }
});

test('phones: the players and board sheets open over an inert app and close on Esc', async () => {
  const p = await open(browser, site.url, { viewport: 'm375', state: STATES.draft });
  await p.evaluate(() => tabBoard.click());
  await p.clock.runFor(300);
  assert.equal(await p.evaluate(() => boardPanel.classList.contains('open')), true);
  assert.equal(await p.evaluate(() => !!document.getElementById('wheelZone').closest('[inert]')), true, 'the wheel cannot be spun under a sheet');
  assert.equal(await p.evaluate(() => tabBoard.getAttribute('aria-expanded')), 'true');
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => boardPanel.classList.contains('open')), false);
  assert.equal(await p.evaluate(() => !!document.getElementById('wheelZone').closest('[inert]')), false);
  assert.equal(await p.evaluate(() => document.activeElement === tabBoard), true, 'focus goes back to the tab');
  await p.context().close();
});

test('a spin closes any open sheet so the landing is seen', async () => {
  const p = await open(browser, site.url, { viewport: 'm375', state: table(N12) });
  await p.evaluate(() => openPanel(playersPanel));
  await scriptRandom(p);
  await p.evaluate(() => spin());
  assert.equal(await p.evaluate(() => playersPanel.classList.contains('open')), false);
  await p.context().close();
});

test('keyboard: SPIN is a few Tab presses away however long the list is', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: STATES.big, clock: false });
  let reached = 0;
  for (let i = 1; i <= 12; i++) {
    await p.keyboard.press('Tab');
    if (await p.evaluate(() => document.activeElement === spinBtn)) { reached = i; break; }
  }
  assert.ok(reached > 0 && reached <= 12, `SPIN reached after ${reached} tabs`);
  await p.context().close();
});

test('keyboard: the name list is one Tab stop, arrows move, Delete removes', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: table(['Ada', 'Ben', 'Cleo']), clock: false });
  await p.focus('#nameList .remove-btn');
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Remove Ben');
  assert.equal(await p.evaluate(() => [...nameListEl.querySelectorAll('.remove-btn')].filter(b => b.tabIndex === 0).length), 1);
  await p.keyboard.press('Delete');
  assert.deepEqual(await p.evaluate(() => names.slice()), ['Ada', 'Cleo']);
  assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Remove Cleo', 'focus moves to the next name');
  await p.context().close();
});

test('keyboard: Settings opens as a modal dialog, Esc closes it and focus returns', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: STATES.draft, clock: false });
  await p.focus('#optionsBtn');
  await p.keyboard.press('Enter');
  assert.equal(await p.evaluate(() => settingsDialog.open && settingsDialog.contains(document.activeElement)), true);
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => settingsDialog.open), false);
  assert.equal(await p.evaluate(() => document.activeElement === optionsBtn), true);
  // every switch has a name a screen reader can say
  const unnamed = await p.evaluate(() => [...document.querySelectorAll('.switch')].filter(s => !s.labels || !s.labels.length).map(s => s.id));
  assert.deepEqual(unnamed, []);
  await p.context().close();
});

test('Space spins from the page, but not while typing or from a keyboard-focused button', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: table(N12) });
  await scriptRandom(p);
  await p.focus('#nameInput');
  await p.keyboard.press('Space');
  assert.equal(await p.evaluate(() => isSpinning), false, 'typing a space in a name does not spin');
  await p.keyboard.press('Tab');                       // keyboard focus on the + button
  await p.keyboard.press('Space');
  assert.equal(await p.evaluate(() => isSpinning), false, 'Space presses the focused button instead');
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Space');
  assert.equal(await p.evaluate(() => isSpinning), true, 'Space from the page spins');
  await p.context().close();
});

test('a screen reader hears the result of every spin, once', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: table(N12, [], { winnerSlots: 1 }) });
  await scriptRandom(p);
  await p.evaluate(() => {
    window.__said = [];
    new MutationObserver(() => { if (announcer.textContent) window.__said.push(announcer.textContent); })
      .observe(announcer, { childList: true, characterData: true, subtree: true });
  });
  await p.evaluate(() => spin());
  await p.clock.runFor(15000);
  const said = await p.evaluate(() => window.__said);
  const picks = said.filter(t => /^Pick 1: \w+\. Winner\. 11 left on the wheel\.$/.test(t));
  assert.equal(picks.length, 1, 'said: ' + JSON.stringify(said));
  assert.equal(await p.evaluate(() => canvas.getAttribute('role')), 'img');
  assert.match(await p.evaluate(() => canvas.getAttribute('aria-label')), /^Wheel with 11 names/);
  await p.context().close();
});

test('duplicates are refused out loud, not just with a red border', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: table(['Ada', 'Ben']), clock: false });
  await p.fill('#nameInput', 'ada');
  await p.press('#nameInput', 'Enter');
  assert.equal(await p.evaluate(() => nameInput.getAttribute('aria-invalid')), 'true');
  assert.match(await p.evaluate(() => starterHint.textContent), /already in the draw/);
  await p.waitForTimeout(120);
  assert.match(await p.evaluate(() => alerter.textContent), /already in the draw/);
  await p.context().close();
});

test('calm effects: no confetti, no shake, a short spin, and the winner still lit', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: table(N12, [], { panicEnabled: false }), reducedMotion: 'reduce' });
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('calm')), true);
  await scriptRandom(p);
  await p.evaluate(() => spin());
  await p.clock.runFor(3200);                         // a calm spin lasts three seconds
  assert.equal(await p.evaluate(() => phase), 'landed');
  assert.equal(await p.evaluate(() => confettiParticles.length + boostElements.length), 0);
  assert.equal(await p.evaluate(() => wheelWrap.classList.contains('shaking')), false);
  assert.notEqual(await p.evaluate(() => wheelHighlight), null);
  await p.context().close();
});

test('the slot machines fit every screen: every cabinet on the canvas, the canvas and Skip on screen', async () => {
  for (const [vp, vpSize] of Object.entries(VIEWPORTS)) {
    for (const n of [3, 12, 30]) {
      const p = await open(browser, site.url, { viewport: vp, state: table(['W1', 'W2'], N50.slice(0, n)) });
      await p.evaluate(() => { isBusy = true; startSlotRace(); });
      await p.clock.runFor(600);
      const m = await p.evaluate(() => {
        const c = marbleCanvas.getBoundingClientRect(), s = marbleSkip.getBoundingClientRect();
        const boxes = lastSlots.map((_, i) => machineRect(i));
        return {
          canvasOn: c.top >= -1 && c.left >= -1 && c.bottom <= innerHeight + 1 && c.right <= innerWidth + 1,
          skipOn: s.bottom <= innerHeight + 1 && s.top >= 0,
          inside: boxes.every(b => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= CANVAS_W + 0.5 && b.y + b.h <= MH + 0.5),
          minW: Math.min(...boxes.map(b => b.w)),
          scroll: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.deepEqual({ canvasOn: m.canvasOn, skipOn: m.skipOn, inside: m.inside, scroll: m.scroll },
                       { canvasOn: true, skipOn: true, inside: true, scroll: false }, `${vp} x${n}`);
      if (n <= 12) assert.ok(m.minW >= 60, `${vp} x${n}: machines ${Math.round(m.minW)}px wide`);
      assert.deepEqual(p.errors, [], `${vp} x${n}`);
      await p.context().close();
    }
  }
});

test('Calm effects play the slots at double pace rather than skipping them', async () => {
  const p = await open(browser, site.url, { state: table(['A'], ['D', 'E', 'F', 'G']), reducedMotion: 'reduce' });
  await scriptRandom(p);                              // 0.5 forever: no 7 ever lands
  await p.evaluate(() => { isBusy = true; startSlotRace(); });
  await p.clock.runFor(3000);
  assert.equal(await p.evaluate(() => marbleOverlay.classList.contains('done')), false, 'still playing');
  assert.ok(await p.evaluate(() => lastSlotsAt) > 5000, 'two seconds of game for every one on the clock');
  assert.deepEqual(p.errors, []);
  await p.context().close();
});

test('the Calm effects switch overrides the system setting and is remembered', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: table(N12), clock: false });
  assert.equal(await p.evaluate(() => calmToggle.checked), false);
  await p.evaluate(() => { calmToggle.checked = true; calmToggle.dispatchEvent(new Event('change')); });
  await p.reload();
  assert.equal(await p.evaluate(() => document.documentElement.classList.contains('calm')), true);
  await p.context().close();
});

test('the sound switch silences everything and is remembered', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: table(N12), clock: false });
  await p.evaluate(() => soundBtn.click());
  assert.equal(await p.evaluate(() => soundBtn.getAttribute('aria-pressed')), 'false');
  await p.reload();
  assert.equal(await p.evaluate(() => soundOn), false);
  assert.equal(await p.evaluate(() => { ensureAudio(); return sfx(); }), false);
  await p.context().close();
});

test('the long-form guide lives in About, so crawlers and readers still get it', async () => {
  const p = await open(browser, site.url, { viewport: 'd1366', state: null, clock: false });
  const text = await p.evaluate(() => document.querySelector('#aboutDialog .guide').textContent);
  assert.match(text, /A spinning wheel that picks a name/);
  assert.match(text, /Is the wheel actually random\?/);
  await p.context().close();
});
