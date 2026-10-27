// The names on the wheel, read back from what the face canvas actually
// draws: every slice gets its name, a long name takes the first form that
// fits (whole, two lines, "First L.", first name, cut), and no two slices
// ever say the same thing.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve, launch, open, table } = require('./helpers');

let browser, site;
before(async () => { site = await serve(); browser = await launch(); });
after(async () => { await browser.close(); site.server.close(); });

const N12 = ['Ada', 'Ben', 'Cleo', 'Dmitri', 'Esme', 'Farouk', 'Gwen', 'Hiro', 'Ines', 'Jonas', 'Kaia', 'Luca'];
const LONG = ['Alexandria Ocasio-Cortez', 'Benedict Cumberbatch', 'Christopher', 'Dmitri Shostakovich',
  'Esmeralda Villalobos', 'Jean-Baptiste Grenouille', 'Gunnþór Karl Rafnsson', 'Hiroshi Yamamoto',
  'Bartholomew', 'Maximiliano Rodríguez', 'Ben Smith', 'Ben Jones', 'Ólafur Arnalds',
  'Wolfgang Amadeus Mozart', 'Anna', 'Mary-Kate Olsen', 'Leonardo DiCaprio', 'Bo', 'Kristín Sól',
  'Þorgerður Katrín', 'Muhammad Ali', 'Fitzgerald', 'Rumpelstiltskin', 'Zoë'];

// One entry per labelled slice: its lines, top to bottom. Lines of one
// slice share its rotation, so the transform groups them.
async function drawnLabels(viewport, names) {
  const p = await open(browser, site.url, { viewport, state: table(names), clock: false });
  const slices = await p.evaluate(async () => {
    await document.fonts.ready;
    const bySlice = new Map(), fill = faceCtx.fillText;
    faceCtx.fillText = function (text) {
      const m = this.getTransform(), key = m.a.toFixed(4) + ',' + m.b.toFixed(4);
      if (!bySlice.has(key)) bySlice.set(key, []);
      bySlice.get(key).push(text);
      return fill.apply(this, arguments);
    };
    faceKey = ''; redraw();
    faceCtx.fillText = fill;
    return [...bySlice.values()];
  });
  assert.deepEqual(p.errors, []);
  await p.context().close();
  return slices;
}
const joined = lines => lines.reduce((a, l) => a + (a && !a.endsWith('-') ? ' ' : '') + l, '');

test('every name is written whole on its slice, on a phone and on a desktop', async () => {
  for (const vp of ['m375', 'd1366']) {
    const labels = (await drawnLabels(vp, N12)).map(joined);
    assert.deepEqual(labels.slice().sort(), N12.slice().sort(), vp);
  }
});

test('long names on a roomy phone wheel go whole, over two lines where they need it', async () => {
  const slices = await drawnLabels('m320', LONG.slice(0, 8));
  assert.deepEqual(slices.map(joined).sort(), LONG.slice(0, 8).sort());
  assert.ok(slices.some(l => l.length === 2), 'some name took two lines');
  assert.ok(slices.every(l => l.length <= 2));
});

test('a crowded phone wheel shortens names, but every slice still names one person', async () => {
  const slices = await drawnLabels('m320', LONG);
  const labels = slices.map(joined);
  assert.equal(labels.length, LONG.length, 'every slice is labelled');
  assert.equal(new Set(labels).size, labels.length, `two slices say the same thing: ${labels}`);
  assert.ok(!labels.includes('Ben'), 'Ben Smith and Ben Jones are never both "Ben"');
  for (const label of labels) {
    const owners = LONG.filter(n => label === n || label === n.split(' ')[0] ||
      label === n.split(' ')[0] + ' ' + Array.from(n.split(' ').pop())[0] + '.' ||
      (label.endsWith('…') && n.startsWith(label.slice(0, -1))));
    assert.equal(owners.length, 1, `"${label}" names ${owners.length} players`);
  }
});
