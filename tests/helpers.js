// Test harness: a tiny static server for the site, plus playwright-core
// driving a locally installed Chromium. No test framework beyond node:test.
//
//   SPINPAGE_ROOT  serve a different copy of the site (default: the repo)
//   CHROME_PATH    use this Chromium/Chrome binary
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(process.env.SPINPAGE_ROOT || path.join(__dirname, '..'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml',
};

function serve(root = ROOT) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    // Vercel injects its analytics script in production; locally it is a no-op.
    if (p.startsWith('/_vercel/')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(''); }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise(resolve => server.listen(0, () => {
    resolve({ server, url: `http://localhost:${server.address().port}/` });
  }));
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (e) { /* not installed through playwright-core */ }
  // Any Chromium a Playwright install has already downloaded.
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const cache = [path.join(home, 'AppData/Local/ms-playwright'), path.join(home, '.cache/ms-playwright'),
                 path.join(home, 'Library/Caches/ms-playwright')];
  for (const dir of cache) {
    if (!fs.existsSync(dir)) continue;
    const builds = fs.readdirSync(dir).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const b of builds) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome',
                         'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(dir, b, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  throw new Error('No Chromium found. Set CHROME_PATH or run: npx playwright-core install chromium');
}

function launch() {
  return chromium.launch({ executablePath: findChrome(), args: ['--autoplay-policy=no-user-gesture-required'] });
}

const VIEWPORTS = {
  d1366: { width: 1366, height: 768 },
  d1440: { width: 1440, height: 900 },
  d1920: { width: 1920, height: 1080 },
  d1280x620: { width: 1280, height: 620 },
  d1024: { width: 1024, height: 700 },
  m320: { width: 320, height: 568, mobile: true },
  m360: { width: 360, height: 640, mobile: true },
  m375: { width: 375, height: 667, mobile: true },
  m390: { width: 390, height: 844, mobile: true },
  m430: { width: 430, height: 932, mobile: true },
  m375safari: { width: 375, height: 548, mobile: true },   // iPhone SE with both Safari bars
  t768: { width: 768, height: 1024, mobile: true },
  l667: { width: 667, height: 375, mobile: true },
  l844: { width: 844, height: 390, mobile: true },
};

// A fresh context per test. `clock: true` installs Playwright's fake timers
// (Date, setTimeout, requestAnimationFrame, performance) so a ten-second spin
// can be fast-forwarded with page.clock.runFor().
async function open(browser, url, { viewport = 'd1366', state, clock = true, reducedMotion } = {}) {
  const vp = typeof viewport === 'string' ? VIEWPORTS[viewport] : viewport;
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: !!vp.mobile, hasTouch: !!vp.mobile,
    reducedMotion: reducedMotion || 'no-preference',
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  if (clock) await page.clock.install();
  await page.goto(url);
  await page.evaluate(s => {
    if (s === undefined) return;
    if (s === null) localStorage.removeItem('spinpage');
    else localStorage.setItem('spinpage', typeof s === 'string' ? s : JSON.stringify(s));
  }, state === undefined ? null : state);
  await page.goto(url);
  return page;
}

// The saved table is the one contract every version of the page shares.
function saved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('spinpage') || 'null'));
}

// Math.random replaced by a queue: each call takes the next value, then 0.5
// forever. 0.5 is a "plain" spin: no power-up, no illegal stamp, no stunt.
function scriptRandom(page, values = []) {
  return page.evaluate(v => {
    const q = v.slice();
    Math.random = () => (q.length ? q.shift() : 0.5);
  }, values);
}

// Every optional twist off, so a spin consumes randomness predictably.
const PLAIN = {
  powerUpsEnabled: false, windBackEnabled: false, goblinEnabled: false,
  noisEnabled: false, panicEnabled: false, popOffEnabled: false,
};

function table(names, drafted = [], extra = {}) {
  const picks = drafted.map(n => ({ name: n, color: '#d4af37' }));
  return { names, draftOrder: picks, undoStack: picks.map(p => ({ ...p })), winnerSlots: 1, nameColors: {}, ...PLAIN, ...extra };
}

// Destructive buttons may ask for a second press to confirm. Press once; if
// nothing changed, press again.
async function pressConfirmed(page, selector) {
  const before = JSON.stringify(await saved(page));
  await page.evaluate(sel => document.querySelector(sel).click(), selector);
  await page.clock.runFor(50);
  if (JSON.stringify(await saved(page)) !== before) return;
  await page.evaluate(sel => document.querySelector(sel).click(), selector);
  await page.clock.runFor(50);
}

module.exports = { ROOT, serve, launch, open, saved, scriptRandom, table, pressConfirmed, PLAIN, VIEWPORTS };
