// Whole drafts, thousands of them, played through the game's own odds:
// core.js and state.js load into a Node vm as in unit.test.js, and simDraft
// below walks a draft spin by spin in the order wheel.js and events.js take
// their decisions — power-up, the draw, illegal, wind-back, gremlin, PANIC,
// No One Is Safe. No animation, no clock: just what each spin does to the
// table. If those decisions move, move them here too.
//
//   node tests/balance.test.js --table     prints what every level plays like
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM = `
function simDraft(n, level) {
    names = Array.from({ length: n }, (_, i) => 'P' + i);
    draftOrder = []; pendingPick = null; panicCooldown = false; nameColors = {};
    chaosLevel = level; goblinSeen = true;
    newDraftLog();
    const seen = { spins: 0, panic: 0, nois: 0, illegal: 0, gremlin: 0, windback: 0, powerup: 0, maxOut: 0 };
    while (names.length >= 2 && seen.spins < 5000) {
        seen.spins++;
        let weights = names.map(() => 1);                        // rollPowerUp
        if (names.length >= 3 && Math.random() < chaosOdds('powerup')) {
            noteChaos('powerup'); seen.powerup++;
            const pu = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
            if (pu.type === 'wildcard') weights = names.map(() => 0.35 + Math.random() * 2.65);
            else weights[Math.floor(Math.random() * names.length)] = pu.factor;
        }
        const seg = buildSegments(weights);                       // startSpin
        const winnerIdx = weightedPick(seg.weights);
        const isIllegal = Math.random() < chaosOdds('illegal');
        const windBack  = !isIllegal && Math.random() < chaosOdds('windback');
        const goblin    = !isIllegal && !windBack && seg.labels.length >= 3 &&
                          goblinFires(names.length, goblinSeen, chaos('gremlin'));
        if (isIllegal) { noteChaos('illegal'); seen.illegal++; }
        if (windBack)  { noteChaos('windback'); seen.windback++; }
        if (goblin)    { noteChaos('gremlin'); seen.gremlin++; }
        const panicked = !isIllegal && winnerIdx === seg.panicIndex;
        if (panicked) noteChaos('panic', panicHeat(draftOrder.length));
        chaosLog.spins++;
        if (isIllegal) continue;
        if (panicked) {                                           // onPanicLanded → race or slots
            seen.panic++;
            panicCooldown = true;
            const out = panicOut(draftOrder.length);
            seen.maxOut = Math.max(seen.maxOut, out);
            for (let i = 0; i < out; i++) {
                const [p] = draftOrder.splice(Math.floor(Math.random() * draftOrder.length), 1);
                names.push(p.name);
            }
            continue;
        }
        panicCooldown = false;                                    // onSpinEnd
        const [name] = names.splice(winnerIdx, 1);
        if (names.length && draftOrder.length && Math.random() < chaosOdds('nois')) {
            noteChaos('nois'); seen.nois++;                       // the winner takes someone's seat
            const v = Math.floor(Math.random() * draftOrder.length);
            names.push(draftOrder[v].name);
            draftOrder[v] = seat(name);
            continue;
        }
        draftOrder.push(seat(name));
        if (names.length === 1) draftOrder.push(seat(names.pop()));
    }
    return seen;
}`;

function load(seed) {
  const ctx = vm.createContext({ console, Math: Object.create(Math), queueMicrotask, structuredClone });
  for (const f of ['core.js', 'state.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  }
  vm.runInContext(SIM, ctx);
  vm.runInContext(`(function(){ let s = ${seed}; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })()`, ctx);
  return ctx;
}

// runs drafts of n names at a level: spin counts sorted, and how often each
// twist turned up at all.
function play(n, level, runs = 2000) {
  const ctx = load(1000 + n * 7 + level);
  const drafts = Array.from({ length: runs }, () => ctx.simDraft(n, level));
  const spins = drafts.map(d => d.spins).sort((a, b) => a - b);
  const at = p => spins[Math.min(spins.length - 1, Math.floor(p * spins.length))];
  const mean = k => drafts.reduce((a, d) => a + d[k], 0) / runs;
  const share = k => drafts.filter(d => d[k] > 0).length / runs;
  return { n, level, mean: mean('spins'), p50: at(0.5), p90: at(0.9), p99: at(0.99), max: spins[spins.length - 1],
           per: k => mean(k), share };
}

const NORMAL = 2, MAYHEM = 4;

test('a twenty-name draft at Normal ends in about one and a half times its names, and never drags on', () => {
  const r = play(20, NORMAL);
  assert.ok(r.mean < 19 * 1.7, `mean ${r.mean.toFixed(1)} spins`);
  assert.ok(r.p99 <= 19 * 2.6, `1 in 100 drafts takes ${r.p99} spins`);
});

test('even a big table at Mayhem finishes: setbacks ease off as a draft runs long', () => {
  for (const [n, level, cap] of [[30, NORMAL, 2.4], [30, MAYHEM, 3.0], [50, MAYHEM, 2.8]]) {
    const r = play(n, level, 1000);
    assert.ok(r.p99 <= (n - 1) * cap, `${n} names at level ${level}: 1 in 100 takes ${r.p99} spins`);
  }
});

test('the twists still turn up: most drafts see a PANIC, a gremlin, a wind-back and a steal', () => {
  const r = play(12, NORMAL);
  assert.ok(r.share('panic') > 0.65, `PANIC in ${r.share('panic')}`);
  assert.ok(r.share('gremlin') > 0.85, `gremlin in ${r.share('gremlin')}`);
  assert.ok(r.share('windback') > 0.9, `wind-back in ${r.share('windback')}`);
  assert.ok(r.share('nois') > 0.7, `No One Is Safe in ${r.share('nois')}`);
});

test('more chaos, longer drafts and more twists, level by level', () => {
  const rs = [0, 1, 2, 3, 4].map(level => play(20, level, 1000));
  for (let i = 1; i < rs.length; i++) {
    assert.ok(rs[i].mean > rs[i - 1].mean, `level ${i} is no longer than level ${i - 1}`);
    for (const k of ['powerup', 'windback', 'gremlin', 'nois']) {
      assert.ok(rs[i].per(k) > rs[i - 1].per(k), `${k} is no commoner at level ${i}`);
    }
  }
});

test('repeats are held back: PANIC lands far less often than its first-spin odds would give', () => {
  // With no memory, a PANIC wedge at Normal hits ~4 times in a 20-name draft.
  const r = play(20, NORMAL);
  assert.ok(r.per('panic') < 2, `${r.per('panic').toFixed(2)} PANICs a draft`);
  assert.ok(r.share('panic') > 0.75, 'but most drafts still get one');
});

if (process.argv.includes('--table')) {
  const levels = vm.runInContext('CHAOS.levels.slice()', load(1));
  for (let level = 0; level < 5; level++) {
    console.log(`\n${levels[level]}`);
    console.log('names  spins: mean  p50  p90  p99  max   per draft: panic  steal  gremlin  wind-back  illegal  power-up');
    for (const n of [3, 5, 8, 12, 20, 30, 50]) {
      const r = play(n, level, 5000);
      const f = k => r.per(k).toFixed(1).padStart(5);
      console.log(`${String(n).padStart(5)}  ${r.mean.toFixed(1).padStart(11)} ${String(r.p50).padStart(4)} ${String(r.p90).padStart(4)} ${String(r.p99).padStart(4)} ${String(r.max).padStart(4)}   ${f('panic').padStart(15)}  ${f('nois')}  ${f('gremlin').padStart(7)}  ${f('windback').padStart(9)}  ${f('illegal').padStart(7)}  ${f('powerup').padStart(8)}`);
    }
  }
}
