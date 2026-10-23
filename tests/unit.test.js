// Pure logic, no browser: core.js and state.js load straight into a Node
// vm context (neither touches the DOM when it loads). Fast enough to run
// on every save.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const ctx = vm.createContext({ console, Math: Object.create(Math), queueMicrotask, structuredClone });
  for (const f of ['core.js', 'state.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  }
  // Results are copied out as plain data: arrays made inside the context
  // have that realm's prototypes and would never deep-equal ours.
  const run = code => {
    const v = vm.runInContext(code, ctx);
    return v === undefined || typeof v === 'function' ? v : JSON.parse(JSON.stringify(v));
  };
  // A seedable Math.random inside the context, so statistics are repeatable.
  run(`(function(){ let s = 12345; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })()`);
  return run;
}

test('weightedPick follows the weights', () => {
  const run = load();
  const share = run(`(() => { let hits = [0,0,0]; for (let i = 0; i < 300000; i++) hits[weightedPick([1, 2, 7])]++; return hits.map(h => h / 300000); })()`);
  [0.1, 0.2, 0.7].forEach((p, i) => assert.ok(Math.abs(share[i] - p) < 0.005, `slice ${i}: ${share[i]}`));
});

test('splitNames handles lists from anywhere', () => {
  const run = load();
  assert.deepEqual(run(`splitNames('Ada, Ben;Cleo\\tDmitri\\r\\nEsme\\n\\n  Farouk  ')`), ['Ada', 'Ben', 'Cleo', 'Dmitri', 'Esme', 'Farouk']);
  assert.deepEqual(run(`splitNames('  Mary   Ann  ')`), ['Mary Ann']);
  assert.equal(run(`splitNames('x'.repeat(40))[0].length`), 30);
  assert.deepEqual(run(`splitNames(' , ;; ')`), []);
  assert.deepEqual(run(`splitNames('Þór, Guðrún, Łukasz')`), ['Þór', 'Guðrún', 'Łukasz']);
});

test('formatPicks lists winners then losers', () => {
  const run = load();
  assert.equal(run(`formatPicks([{name:'A'},{name:'B'},{name:'C'}], 1)`), 'WINNERS\n1st pick: A\n\nLOSERS\n2nd pick: B\n3rd pick: C');
  assert.equal(run(`formatPicks([{name:'A'}], 3)`), 'WINNERS\n1st pick: A');
  assert.equal(run(`[1,2,3,4,11,12,13,21,22,101,111].map(ordinal).join(' ')`), '1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 101st 111th');
});

test('migrate turns anything into a clean table', () => {
  const run = load();
  for (const raw of ['null', '[]', '42', '"x"', '{}']) {
    const s = run(`migrate(${raw})`);
    assert.deepEqual([s.names, s.draftOrder, s.winnerSlots, s.windBackEnabled], [[], [], 1, true], raw);
  }
  const s = run(`migrate({
    names: ['Ada', ' ada ', 'Ben', 7, '', 'Cleo'],
    draftOrder: [{ name: 'Cleo', color: '#b03a2e' }, { name: 'Dee', color: 'red' }, { nope: 1 }],
    winnerSlots: '250', plotTwistsEnabled: false, displayDuration: 99999, calmPref: 'yes',
    nameColors: { cleo: '#b03a2e', dee: 'red', ada: '#123456' },
    spinLog: { spins: 4, illegal: -1, panics: 1.5 },
    history: [{ t: 'pick', names: ['Cleo'] }, { t: 'pick', names: [] }, { t: 'steal', seat: 0, stealer: null, victim: 'X' }, { t: 'bogus' }],
  })`);
  assert.deepEqual(s.names, ['Ada', 'Ben'], 'case duplicates and anything already drafted are dropped');
  assert.deepEqual(s.draftOrder.map(p => p.name), ['Cleo', 'Dee']);
  assert.equal(s.winnerSlots, 99);
  assert.equal(s.windBackEnabled, false, 'the old plot-twist switch still counts');
  assert.equal(s.displayDuration, 2800);
  assert.equal(s.calmPref, null);
  assert.deepEqual(s.nameColors, { cleo: '#9b1f2e', ada: '#123456' }, 'old palette remapped, junk dropped');
  assert.deepEqual([s.spinLog.spins, s.spinLog.illegal, s.spinLog.panics], [4, 0, 0]);
  assert.equal(s.history.length, 2);
  assert.equal(run(`migrate({ plotTwistsEnabled: false, windBackEnabled: true }).windBackEnabled`), true, 'the new name wins');
});

test('draftStats derives every number from the table', () => {
  const run = load();
  run(`names = ['C', 'D', 'E']; draftOrder = [{name:'A',color:'#111111'},{name:'B',color:'#222222'}]; winnerSlots = 1; lastPick = 'A';`);
  let st = run('draftStats()');
  assert.deepEqual([st.total, st.left, st.picked, st.next, st.complete, st.canSpin, st.slots], [5, 3, 2, 3, false, true, 1]);
  assert.deepEqual([st.latest.name, st.latest.pick, st.latest.winner], ['A', 1, true]);
  run(`lastPick = 'gone'`);
  assert.equal(run('draftStats().latest.name'), 'B', 'falls back to the last seat');
  run(`names = []`);
  st = run('draftStats()');
  assert.deepEqual([st.next, st.complete, st.canSpin], [null, true, false]);
  run(`winnerSlots = 50`);
  assert.equal(run('draftStats().slots'), 2, 'slots shown are clamped to the table...');
  assert.equal(run('winnerSlots'), 50, '...but the setting itself is left alone');
});

test('undo reverses picks, stolen seats and panics exactly', () => {
  const run = load();
  // a pick that also drafted the last name standing
  run(`names = []; draftOrder = [{name:'A'},{name:'B'},{name:'C'}]; history = [{t:'pick',names:['A']},{t:'pick',names:['B','C']}]; lastPick = 'C';`);
  run('undoLast()');
  assert.deepEqual(run('[names.slice(), draftOrder.map(p=>p.name), lastPick]'), [['B', 'C'], ['A'], 'A']);
  // a stolen seat: Y lost pick 2 to S
  run(`names = ['Y', 'Q']; draftOrder = [{name:'X'},{name:'S'},{name:'Z'}]; history = [{t:'steal',seat:1,stealer:'S',victim:'Y'}]; lastPick = 'S';`);
  run('undoLast()');
  assert.deepEqual(run('[names.slice(), draftOrder.map(p=>p.name)]'), [['Q', 'S'], ['X', 'Y', 'Z']]);
  // a panic that sent seats 2 and 4 back to the wheel
  run(`names = ['P', 'B', 'D']; draftOrder = [{name:'A'},{name:'C'}]; history = [{t:'panic',out:[{name:'D',seat:3},{name:'B',seat:1}]}];`);
  run('undoLast()');
  assert.deepEqual(run('[names.slice(), draftOrder.map(p=>p.name)]'), [['P'], ['A', 'B', 'C', 'D']]);
  // a save from before history existed: the old rule, last seat back
  run(`names = []; draftOrder = [{name:'A'},{name:'B'}]; history = [];`);
  run('undoLast()');
  assert.deepEqual(run('[names.slice(), draftOrder.map(p=>p.name)]'), [['B'], ['A']]);
  assert.equal(run('undoLast() && undoLast()'), null, 'nothing left to undo');
});

test('wind-back: ordinary out, held, and back to exactly the drawn landing', () => {
  const run = load();
  const r = run(`(() => { const e = makeWindBackEase(0.4, 20); return { a: e(0), stop: e(WB.stop), hold: e((WB.stop + WB.hold) / 2), end: e(1) }; })()`);
  assert.equal(r.a, 0);
  assert.ok(Math.abs(r.stop - 1.4) < 1e-9, 'overshoots by exactly the wind-back');
  assert.ok(Math.abs(r.hold - 1.4) < 0.01, 'sits still while held');
  assert.ok(Math.abs(r.end - 1) < 1e-9, 'lands where the draw said');
});

test('the gremlin always ends exactly on the drawn landing', () => {
  const run = load();
  for (let i = 0; i < 40; i++) {
    const r = run(`(() => {
      const rounds = goblinRounds(), seg = [1,1,1,1,1,1,1,1], total = 8;
      const arc = goblinCreepArc(seg, total, Math.random() * 2 * Math.PI, rounds);
      const totalRot = (4 + Math.ceil(arc / (2 * Math.PI))) * 2 * Math.PI + 1;
      const run = buildGoblinRun(totalRot, arc, rounds, 2 * Math.PI / 8);
      return { start: run.ease(0), end: run.ease(1), first: run.beats[0].kind, last: run.beats[run.beats.length - 1].kind,
               rounds, dur: run.duration };
    })()`);
    assert.equal(r.start, 0);
    assert.ok(Math.abs(r.end - 1) < 1e-9, `round ${r.rounds}: ends at ${r.end}`);
    assert.equal(r.first, 'arrive');
    assert.equal(r.last, 'release');
    assert.ok(r.dur > 8000 && r.dur < 120000, `duration ${r.dur}`);
  }
});

test('the gremlin chance fades from 30% to 5% as the table grows', () => {
  const run = load();
  const c = run('[2,3,6,12,13,40].map(goblinChance)');
  assert.ok(Math.abs(c[0] - 0.30) < 1e-9 && Math.abs(c[1] - 0.30) < 1e-9);
  assert.ok(c[2] < c[1] && c[2] > c[3]);
  assert.ok(Math.abs(c[3] - 0.05) < 1e-9 && Math.abs(c[5] - 0.05) < 1e-9);
});

test('the peg ring gives at least 30 clicks a lap and accents each slice', () => {
  const run = load();
  for (const n of [2, 3, 7, 12, 30, 50]) {
    const r = run(`pegRing(${n})`);
    assert.ok(n * r.per >= 30);
    assert.ok(Math.abs(r.arc * n * r.per - 2 * Math.PI) < 1e-9);
  }
  assert.equal(run('isAccentPeg(-6, 3)'), true);
});

test('a hand flick and the stock spin share one landing curve', () => {
  const run = load();
  const r = run(`(() => { const e = decayEase(STOCK_SLOPE); let worst = 0; for (let t = 0; t <= 1; t += 0.01) worst = Math.max(worst, Math.abs(e(t) - easeOut(t))); return worst; })()`);
  assert.ok(r < 1e-3, `max difference ${r}`);
});

test('hurdles: two to four rails inside the track, odds with a floor', () => {
  const run = load();
  for (let i = 0; i < 50; i++) {
    const h = run('makeHurdles()');
    assert.ok(h.length >= 2 && h.length <= 4);
    assert.ok(h.every(x => x > 0.18 && x < 0.78));
  }
  assert.equal(run('hurdleOdds(0.3, 10, 1)'), 0.25);
});

test('every jewel label reads at 4.5:1 or better on its slice', () => {
  const run = load();
  const worst = run(`(() => {
    const lum = h => { const c = [1,3,5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
    return Math.min(...JEWELS.map(j => { const a = lum(j.hex), b = lum(j.ink); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }));
  })()`);
  assert.ok(worst >= 4.5, `worst label contrast ${worst.toFixed(2)}`);
  assert.equal(run(`inkOn('#ffffff')`), '#17110a');
  assert.equal(run(`inkOn('#000000')`), '#fbf4e2');
});
