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
  run(`names = []; draftOrder = [{name:'A'},{name:'B'},{name:'C'}]; draftHistory = [{t:'pick',names:['A']},{t:'pick',names:['B','C']}]; lastPick = 'C';`);
  run('undoLast()');
  assert.deepEqual(run('[names.slice(), draftOrder.map(p=>p.name), lastPick]'), [['B', 'C'], ['A'], 'A']);
  // a stolen seat: Y lost pick 2 to S
  run(`names = ['Y', 'Q']; draftOrder = [{name:'X'},{name:'S'},{name:'Z'}]; draftHistory = [{t:'steal',seat:1,stealer:'S',victim:'Y'}]; lastPick = 'S';`);
  run('undoLast()');
  assert.deepEqual(run('[names.slice(), draftOrder.map(p=>p.name)]'), [['Q', 'S'], ['X', 'Y', 'Z']]);
  // a panic that sent seats 2 and 4 back to the wheel
  run(`names = ['P', 'B', 'D']; draftOrder = [{name:'A'},{name:'C'}]; draftHistory = [{t:'panic',out:[{name:'D',seat:3},{name:'B',seat:1}]}];`);
  run('undoLast()');
  assert.deepEqual(run('[names.slice(), draftOrder.map(p=>p.name)]'), [['P'], ['A', 'B', 'C', 'D']]);
  // a save from before history existed: the old rule, last seat back
  run(`names = []; draftOrder = [{name:'A'},{name:'B'}]; draftHistory = [];`);
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

test('until he has been seen once the gremlin is a little likelier: 40% fading to 10%', () => {
  const run = load();
  const first = run('[2,3,6,12,13,40].map(n => goblinFirstChance(n))');
  const after = run('[2,3,6,12,13,40].map(n => goblinChance(n))');
  assert.ok(Math.abs(first[1] - 0.40) < 1e-9 && Math.abs(first[3] - 0.10) < 1e-9 && Math.abs(first[5] - 0.10) < 1e-9);
  first.forEach((f, i) => assert.ok(f > after[i], 'likelier at every table size'));
  // One draw either way; the same draw fires him before he is seen and not after.
  run('Math.random = () => 0.35');
  assert.deepEqual(run('[goblinFires(3, false), goblinFires(3, true)]'), [true, false]);
});

test('the first sighting is saved: missing means not yet, and it survives a save', () => {
  const run = load();
  assert.equal(run('migrate({}).goblinSeen'), false);
  assert.equal(run('migrate({ goblinSeen: true }).goblinSeen'), true);
  assert.equal(run('migrate({ goblinSeen: "yes" }).goblinSeen'), false, 'only a real boolean counts');
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

test('slots: a held 7 stays put, a spinning reel lands 7 at SLOT_SEVEN, reels stop left to right', () => {
  const run = load();
  assert.deepEqual(run('slotPull([true, true, true], Math.random)'), [null, null, null]);
  const s = run(`(() => {
    const n = 200000, hits = new Array(SLOT_SYMBOLS.length).fill(0);
    let ordered = true;
    for (let i = 0; i < n / 3; i++) {
      const p = slotPull([false, false, false], Math.random);
      p.forEach(r => hits[r.sym]++);
      if (!(p[0].stop < p[1].stop && p[1].stop < p[2].stop)) ordered = false;
    }
    return { share: hits.map(h => h / (3 * Math.floor(n / 3))), ordered };
  })()`);
  assert.ok(Math.abs(s.share[0] - 0.26) < 0.005, `sevens ${s.share[0]}`);
  s.share.slice(1).forEach((x, i) => assert.ok(Math.abs(x - 0.74 / 7) < 0.005, `symbol ${i + 1}: ${x}`));
  assert.equal(s.ordered, true);
});

test('slots: the last reel teases only with a 7 on both the others', () => {
  const run = load();
  const r = run(`(() => {
    const seven = () => 0.1, blank = () => 0.9;
    return {
      twoHeld:   slotPull([true, false, true], blank),            // one reel left: it always teases
      twoLand:   slotPull([false, false, false], seven),          // all three land 7: the last teases
      noTease:   slotPull([false, false, false], blank),
      heldFirst: slotPull([true, false, false], blank),
    };
  })()`);
  assert.equal(r.twoHeld[1].tease, true);
  assert.ok(r.twoHeld[1].stop >= 1300 + 1100, 'and takes its time');
  assert.deepEqual(r.twoLand.map(x => x.tease), [false, false, true]);
  assert.deepEqual(r.noTease.map(x => x.tease), [false, false, false]);
  assert.deepEqual(r.heldFirst.map(x => x && x.tease), [null, false, false]);
});

test('slots: a table hits its safe quota in a handful of pulls', () => {
  // The whole game in pure logic: pulls until the safe quota has 7-7-7.
  const run = load();
  const med = run(`(() => {
    const out = {};
    for (const n of [2, 4, 10, 20]) {
      const safe = n - Math.max(1, Math.ceil(n / 2) - 1), runs = [];
      for (let k = 0; k < 2000; k++) {
        const held = Array.from({ length: n }, () => [false, false, false]);
        let pulls = 0, done = 0;
        while (done < safe && pulls < SLOT_MAX_PULLS) {
          pulls++;
          held.forEach(h => { if (h.every(Boolean)) return;
            slotPull(h, Math.random).forEach((r, i) => { if (r && r.sym === 0) h[i] = true; });
            if (h.every(Boolean)) done++; });
        }
        runs.push(pulls);
      }
      runs.sort((a, b) => a - b);
      out[n] = { median: runs[1000], worst: runs[1999] };
    }
    return out;
  })()`);
  for (const [n, m] of Object.entries(med)) {
    assert.ok(m.median >= 3 && m.median <= 10, `${n} machines: median ${m.median} pulls`);
    assert.ok(m.worst < 40, `${n} machines: worst ${m.worst} pulls never needs the failsafe`);
  }
});

test('slots: the grid fits every table and gives it the most room', () => {
  const run = load();
  const bad = run(`(() => {
    const bad = [];
    for (const [w, h] of [[1100, 600], [360, 420], [700, 260], [1600, 880]])
      for (let n = 1; n <= 40; n++) {
        const g = slotGrid(n, w, h, 0.76);
        if (g.cols * g.rows < n || g.cols * g.cellW > w + 0.01 || g.rows * g.cellW * 0.76 > h + 0.01) bad.push([w, h, n]);
      }
    return bad;
  })()`);
  assert.deepEqual(bad, []);
  assert.deepEqual(run('slotGrid(4, 1000, 500, 0.6)').cols, 2, 'two by two beats a strip of four');
  assert.deepEqual(run('slotGrid(4, 2000, 300, 0.6)').cols, 4, 'but not on a wide, short stage');
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

test('no two scripts declare the same global: the later one would silently replace the earlier', () => {
  // The page loads classic scripts into one global scope, so a second
  // `function fitText` in slots.js replaced the wheel's own and every
  // label on the wheel came out as a lone "…".
  const dir = path.join(__dirname, '..', 'js');
  const seen = new Map(), clashes = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(m[1])) clashes.push(`${m[1]}: ${seen.get(m[1])} and ${f}`);
      else seen.set(m[1], f);
    }
  }
  assert.deepEqual(clashes, []);
});
