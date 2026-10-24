/* ══════════════════════════════════════
   State
   ─────────────────────────────────────
   The game's globals keep their old names: the gameplay code reads them
   directly and the browser tests reach them by name. Nothing in this file
   touches the DOM, so it loads in Node too (tests/unit.test.js).
══════════════════════════════════════ */
let names           = [];
let draftOrder      = [];
let rotation        = 0;
let isSpinning      = false;
let isBusy          = false;
let autoSpin        = false;
let displayDuration = 2800;
let autoDisplay     = true;     // auto-scale winner display by table size
let winnerSlots     = 1;        // what the user asked for; clamped to the table only when shown
let lastTickSection     = -1;
let windBackEnabled     = true;
let goblinEnabled       = true;   // rare: something climbs on and creeps the wheel round by hand
let goblinSeen          = false;  // he has turned up on this device: his first-sighting odds are spent
let noisEnabled         = true;
let riggedEnabled       = false;  // session only, never saved
let riggedValue         = '';     // name/prefix the rigged mode forces to win
let powerUpsEnabled     = true;
let panicEnabled        = true;
let popOffEnabled       = true;   // allow a monster hand-flick to rip the wheel off its hub
let panicCooldown       = false;  // blocks PANIC from landing two spins in a row
let sliceWeights        = null;   // per-spin slice multipliers (null = all equal)
let nameColors          = {};     // lowercased name -> stable color (consistent everywhere)
let soundOn             = true;
let calmPref            = null;   // null: follow the system's reduce-motion setting
let lastPick            = '';     // the most recent name to win a seat, for "Latest"
let activePowerUp       = null;   // the power-up warping the current spin
let stunt               = null;   // 'windback' | 'gremlin' while one is playing, for the status line
let landed              = null;   // the pick on show while its nameplate is up
let freshPick           = '';     // the seat to animate in on the next render
// What the wheel is doing, in words the status line can use. Display only:
// the gameplay guards are still isSpinning and isBusy.
let phase               = 'ready';  // ready | warping | spinning | landed | illegal | panic | nois
// Reversible draft events, newest last. Undo walks this back, so it undoes
// what actually happened last — a pick, a stolen seat or a PANIC race —
// rather than blindly popping the last seat on the board. (Not `history`:
// a global of that name hides window.history from every other script on
// the page, the analytics among them.)
let draftHistory        = [];
// A winner who has left the wheel but has no seat yet, while No One Is
// Safe decides whose seat they take. Saves put them back on the wheel, so
// a reload at that moment can never lose them.
let pendingPick         = null;
// What has happened since the draft began. Undo does not un-spin, so spins
// only ever count up until the draft is restored, cleared or reset.
let spinLog             = freshSpinLog();

function freshSpinLog() { return { spins: 0, illegal: 0, panics: 0, steals: 0, undos: 0 }; }
function newDraftLog()  { spinLog = freshSpinLog(); lastPick = ''; draftHistory = []; }

function totalEntrants() {
    return names.length + draftOrder.length + (pendingPick ? 1 : 0);
}

function getWinnerSlots() {
    return Math.max(1, Math.min(winnerSlots, Math.max(1, totalEntrants())));
}

/* Every number the scoreboard shows comes out of here, derived from the
   wheel and the draft as they stand — so nothing can drift out of step
   with what the game actually did, whatever order events happen in.
   The pick on the nameplate counts from the frame it lands: the room has
   seen it, so Next, Left and Latest all move together, before the seat is
   formally filled. */
function draftStats() {
    const onPlate = landed && names.includes(landed.name) ? 1 : 0;
    const picked = draftOrder.length + onPlate, left = names.length - onPlate;
    const total = draftOrder.length + names.length + (pendingPick ? 1 : 0);
    // "Latest" is whoever most recently won a seat and still holds it. If
    // PANIC or undo has taken it off them, the last seat on the board stands in.
    let at = lastPick ? draftOrder.findIndex(p => p.name === lastPick) : -1;
    if (at < 0) at = draftOrder.length - 1;
    const slots = getWinnerSlots();
    return {
        total, left, picked, slots,
        next:     left > 0 ? picked + 1 : null,
        complete: picked > 0 && left === 0,
        canSpin:  left >= 2,
        latest:   at >= 0 ? { name: draftOrder[at].name, color: draftOrder[at].color, pick: at + 1, winner: at < slots } : null,
        spins:    spinLog.spins,
        illegal:  spinLog.illegal,
        panics:   spinLog.panics,
        steals:   spinLog.steals,
        undos:    spinLog.undos,
    };
}

const POWERUPS = [
    { type: 'hotseat',  label: 'Hot Seat', emoji: '🔥', factor: 3.0,  color: '#f2a93b' },
    { type: 'cursed',   label: 'Cursed',   emoji: '💀', factor: 0.25, color: '#b48cf0' },
    { type: 'wildcard', label: 'Wildcard', emoji: '🎲',               color: '#3fd0b4' },
];

// The PANIC wedge is a non-player slice: landing on it starts the horse race
// instead of picking a winner. It only appears once 2+ players are drafted.
const PANIC = { label: 'PANIC', color: '#170812', textColor: '#ff3d8b', weight: 0.8 };
function panicSliceActive() { return panicEnabled && draftOrder.length >= 2 && !panicCooldown; }

// The wheel's drawable slices = players (+ the PANIC wedge when active).
// baseWeights is a players-length array (equal, or the current power-up sizing).
function buildSegments(baseWeights) {
    const labels  = names.slice();
    const colors  = names.map(n => colorOf(n));
    const weights = baseWeights.slice();
    let panicIndex = -1;
    if (panicSliceActive()) {
        // Cap so the PANIC wedge is never more than 1/4 of the whole wheel:
        // panicW / (playerSum + panicW) <= 0.25  ⇒  panicW <= playerSum / 3.
        const playerSum = weights.reduce((a, b) => a + b, 0) || 1;
        panicIndex = labels.length;
        labels.push(PANIC.label);
        colors.push(PANIC.color);
        weights.push(Math.min(PANIC.weight, playerSum / 3));
    }
    return { labels, colors, weights, panicIndex };
}

/* Calm effects: the system's reduce-motion setting, unless the player has
   chosen otherwise in Settings. The gameplay gates (gremlin, pop-off) have
   always asked prefersReducedMotion(), so that name now answers for both. */
function systemReducedMotion() {
    return !!(typeof window !== 'undefined' && window.matchMedia &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function calmEffects() { return calmPref === null ? systemReducedMotion() : calmPref; }
const prefersReducedMotion = () => calmEffects();

/* Sixteen "jewels", alternating deep and bright so neighbouring slices never
   blur together. Deep jewels carry ivory labels and bright ones carry ink,
   every pairing at least 5.5:1. Jewels are for slices, pips and ribbons —
   never for text on the dark page. */
const JEWELS = [
    { hex: '#9b1f2e', ink: '#fbf4e2' },   // oxblood
    { hex: '#f0b43a', ink: '#17110a' },   // marigold
    { hex: '#1d4fa3', ink: '#fbf4e2' },   // sapphire
    { hex: '#f2846b', ink: '#17110a' },   // coral
    { hex: '#0f7148', ink: '#fbf4e2' },   // emerald
    { hex: '#74b9f0', ink: '#17110a' },   // sky
    { hex: '#6a2c9a', ink: '#fbf4e2' },   // amethyst
    { hex: '#4fd09c', ink: '#17110a' },   // jade
    { hex: '#0b6470', ink: '#fbf4e2' },   // teal
    { hex: '#f08fb0', ink: '#17110a' },   // rose
    { hex: '#8a4a12', ink: '#fbf4e2' },   // umber
    { hex: '#bfa2f0', ink: '#17110a' },   // lilac
    { hex: '#3a2f8f', ink: '#fbf4e2' },   // indigo
    { hex: '#b6d957', ink: '#17110a' },   // lime
    { hex: '#8a1f62', ink: '#fbf4e2' },   // plum
    { hex: '#f7cf6a', ink: '#17110a' },   // saffron
];
const PALETTE = JEWELS.map(j => j.hex);
// The palette before the redesign, slot for slot, so a saved table keeps the
// same colour order when its colours are carried over.
const OLD_PALETTE = [
    '#b03a2e','#1a5276','#1e8449','#b7950b','#6c3483',
    '#117a65','#935116','#154360','#196f3d','#7b241c',
    '#4a235a','#0e6251','#784212','#1b4f72','#922b21',
];

// Label colour for text drawn ON a jewel. Anything unknown (an old saved
// colour, a hand-edited one) gets whichever of ink or ivory reads better.
function inkOn(hex) {
    const j = JEWELS.find(x => x.hex === hex);
    if (j) return j.ink;
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '#fbf4e2';
    const lin = v => { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
    return L > 0.22 ? '#17110a' : '#fbf4e2';
}

// A player keeps one stable color for the whole session — assigned on first
// sight and reused on the wheel, draft cards, the NOIS wheel, and the horse race.
function colorOf(name) {
    const key = name.trim().toLowerCase();
    if (!nameColors[key]) nameColors[key] = PALETTE[Object.keys(nameColors).length % PALETTE.length];
    return nameColors[key];
}

// Current slice multipliers, or all-equal. The length guard makes a stale
// array (after names change) fall back to equal sizes — no index desync.
function getWeights() {
    return (sliceWeights && sliceWeights.length === names.length)
        ? sliceWeights
        : names.map(() => 1);
}

// Winner overlay duration: linger (~2s) for small tables, snappier as the
// roster grows so big autospun drafts don't drag.
function winnerDisplayMs() {
    if (!autoDisplay) return displayDuration;
    const total = totalEntrants();
    if (total < 5) return 2000;
    return Math.max(600, Math.round(2000 - (total - 4) * 100));
}

function onWheel(name)   { const k = name.toLowerCase(); return names.some(n => n.toLowerCase() === k); }
function isNameInUse(name) {
    const key = name.trim().toLowerCase();
    return names.some(n => n.toLowerCase() === key) ||
           draftOrder.some(p => p.name.toLowerCase() === key);
}

/* Pasted lists arrive as one string: split on new lines, tabs, commas and
   semicolons, trim, and hold each name to the 30 characters a slice fits.
   Characters, not UTF-16 units, so an emoji is never cut in half. */
const NAME_MAX = 30;
function clip(text, n) { const a = Array.from(text); return a.length > n ? a.slice(0, n).join('') : text; }
function splitNames(text) {
    return String(text || '').split(/[\r\n\t,;]+/)
        .map(s => clip(s.trim().replace(/\s+/g, ' '), NAME_MAX).trim())
        .filter(Boolean);
}

/* ══════════════════════════════════════
   Undo
   ─────────────────────────────────────
   Each history entry knows how to put the table back exactly as it was
   before that event. Saves from before the redesign have no history; for
   them Undo falls back to the old rule and returns the last seat.
══════════════════════════════════════ */
function nextUndo() {
    if (draftHistory.length) return draftHistory[draftHistory.length - 1];
    if (draftOrder.length) return { t: 'pick', names: [draftOrder[draftOrder.length - 1].name] };
    return null;
}

function seat(name) { return { name, color: colorOf(name) }; }

function undoLast() {
    const ev = nextUndo();
    if (!ev) return null;
    if (draftHistory.length) draftHistory.pop();
    if (ev.t === 'pick') {
        ev.names.forEach(n => {
            const i = draftOrder.findIndex(p => p.name === n);
            if (i >= 0) draftOrder.splice(i, 1);
            if (!onWheel(n)) names.push(n);
        });
    } else if (ev.t === 'steal') {
        const i = ev.stealer ? draftOrder.findIndex(p => p.name === ev.stealer) : -1;
        if (i >= 0) draftOrder[i] = seat(ev.victim);
        else draftOrder.splice(Math.min(ev.seat, draftOrder.length), 0, seat(ev.victim));
        names = names.filter(n => n.toLowerCase() !== ev.victim.toLowerCase());
        if (ev.stealer && !onWheel(ev.stealer)) names.push(ev.stealer);
    } else if (ev.t === 'panic') {
        const out = ev.out.slice().sort((a, b) => a.seat - b.seat);
        out.forEach(o => { names = names.filter(n => n.toLowerCase() !== o.name.toLowerCase()); });
        out.forEach(o => draftOrder.splice(Math.min(o.seat, draftOrder.length), 0, seat(o.name)));
    }
    spinLog.undos++;
    lastPick = latestFromHistory();
    return ev;
}

// After an undo, "Latest" is whoever the newest remaining event seated.
function latestFromHistory() {
    for (let i = draftHistory.length - 1; i >= 0; i--) {
        const ev = draftHistory[i];
        if (ev.t === 'pick')  return ev.names[ev.names.length - 1];
        if (ev.t === 'steal' && ev.stealer) return ev.stealer;
    }
    return '';
}

// Snapshot and restore the whole table, for the undo toast after Restore,
// Clear and Reset.
function snapshotTable() {
    return JSON.stringify({ names, draftOrder, history: draftHistory, spinLog, lastPick, nameColors, winnerSlots, panicCooldown });
}
function restoreTable(json) {
    const s = JSON.parse(json);
    names = s.names; draftOrder = s.draftOrder; draftHistory = s.history; spinLog = s.spinLog;
    lastPick = s.lastPick; nameColors = s.nameColors; winnerSlots = s.winnerSlots; panicCooldown = s.panicCooldown;
}

const CONGRATS = [
    'JACKPOT, CHAMP!',
    'WINNER WINNER, CHICKEN DINNER!',
    'YOU HIT THE BIG ONE!',
    'LADY LUCK JUST CALLED YOUR NAME!',
    'THE STARS HAVE ALIGNED!',
    'YOU\'RE ROLLING IN GLORY!',
    'CONGRATULATIONS, HIGH ROLLER!',
    'THE HOUSE NEVER SAW YOU COMING!',
    'FORTUNE FAVORS YOU TODAY!',
    'YOU\'VE STRUCK GOLD!',
    'A LEGENDARY WIN APPEARS!',
    'THE ODDS BOW BEFORE YOU!',
    'YOU CRACKED THE JACKPOT!',
    'THIS IS YOUR LUCKY DAY!',
    'ALL IN, ALL WIN!',
    'THE CASINO GODS SMILE UPON YOU!',
    'YOU BEAT THE SYSTEM!',
    'BIG MONEY! BIG MONEY! BIG MONEY!',
    'THE REELS HAVE SPOKEN!',
    'CASH IT IN, HERO!',
    'THE TREASURE IS YOURS!',
    'YOU JUST PRINTED MONEY!',
    'YOUR LUCK STAT IS MAXED!',
    'VICTORY HAS FOUND YOU!',
    'YOU\'RE ON FIRE!',
    'THE VAULT IS OPEN!',
    'TODAY, YOU ARE THE HOUSE!',
    'A FORTUNE FIT FOR A KING!',
    'YOU WON THE GOLDEN TICKET!',
    'INCREDIBLE! ABSOLUTELY INCREDIBLE!',
    'THE CROWD GOES WILD!',
    'YOU HAVE ASCENDED!',
    'LUCK LEVEL: OVER 9000!',
    'THE WHEEL HAS CHOSEN YOU!',
    'A WIN FOR THE AGES!',
    'FATE JUST HIGH-FIVED YOU!',
    'YOU\'VE LANDED THE BIG FISH!',
    'SWEET VICTORY IS YOURS!',
    'THE CHEERS ARE DEAFENING!',
    'YOUR MOMENT HAS ARRIVED!',
    'RARE DROP DETECTED!',
    'FACTORY NEW LUCK ACQUIRED!',
    'YOU OPENED THE GOOD CASE!',
    'RED ITEM INCOMING!',
    'KNIFE PULL! KNIFE PULL! KNIFE PULL!',
    'GABE NODDED APPROVINGLY!',
    'THE RNG GODS HAVE SPOKEN!',
    'STAT-TRAK YOUR SUCCESS!',
    'STRAIGHT TO INVENTORY!',
    'THAT\'S GOING IN THE HIGHLIGHTS!',
    'YOU WON\'T BELIEVE THIS DROP!',
    'MARKET VALUE: STONKS!',
    'UNBOXING HISTORY RIGHT HERE!',
    'THE CASE NEVER STOOD A CHANCE!',
    'A SKIN SO NICE IT SHOULD BE ILLEGAL!',
    'CLIP IT AND SHIP IT!',
    'INVENTORY VALUE INCREASED!',
    'THAT\'S A FLEX ITEM!',
    'YOUR FRIENDS ARE JEALOUS ALREADY!',
    'THAT\'S TRADE-UP MATERIAL!',
    'SEVEN! SEVEN! SEVEN!',
    'CHERRY CHERRY JACKPOT!',
    'THE REELS LINE UP PERFECTLY!',
    'THE SLOTS ARE SINGING!',
    'PAYOUT INCOMING!',
    'CASH RAIN ACTIVATED!',
    'FORTUNE HAS ARRIVED!',
    'YOUR CHIPS ARE STACKING HIGH!',
    'THE TABLE ERUPTS IN APPLAUSE!',
    'THE DEALER IS SHOOK!',
    'YOU DID IT, YOU MAGNIFICENT BASTARD!',
    'THE WIN TRAIN HAS NO BRAKES!',
    'THIS CALLS FOR A VICTORY DANCE!',
    'SUCCESS TASTES DELICIOUS!',
    'GO BUY A LOTTERY TICKET!',
    'YOUR LUCK IS ILLEGAL IN 14 COUNTRIES!',
    'ARE YOU EVEN MORTAL?',
    'THE UNIVERSE OWED YOU ONE!',
    'YOU HAVE PEAKED!',
    'THIS IS WHAT DESTINY LOOKS LIKE!',
    'NOT EVEN CLOSE!',
    'EASY MONEY!',
    'ABSOLUTE CINEMA!',
    'THE CROWD IS ON ITS FEET!',
    'A MASTERPIECE OF LUCK!',
    'LIGHTNING STRIKES TWICE!',
    'TODAY\'S MVP: YOU!',
    'THE LOOT FAIRY HAS ARRIVED!',
    'THIS IS WHY WE GAMBLE!',
    'ALL ROADS LED TO THIS MOMENT!',
    'A NEW CHAMPION EMERGES!',
    'THE KING OF RNG HAS ARRIVED!',
    'YOU JUST WON BIG TIME!',
    'THIS WIN BELONGS IN A MUSEUM!',
    'HISTORY HAS BEEN MADE!',
    'VICTORY ACHIEVEMENT UNLOCKED!',
    'YOU FOUND THE GOLDEN EGG!',
    'LUCK.EXE HAS STARTED SUCCESSFULLY!',
    'THE MEMES WERE TRUE!',
    'YEAAH BABY!!!',
    'GABE HAS BLESSED THIS OPENING!',
    'THE CHICKENS HAVE BEEN DINNERED!',
    'YOUR INVENTORY THANKS YOU!',
    'THE HOUSE IS CURRENTLY CRYING!',
    'THIS DROP HAS ITS OWN ZIP CODE!',
    'CONGRATULATIONS, YOU BEAUTIFUL DEGENERATE! 😄',
];

// For the picks after the winner cut: still a moment, just not a jackpot.
const CONSOLATION = [
    'BETTER LUCK NEXT SPIN!',
    'THE HOUSE ALWAYS WINS!',
    'THE WHEEL GIVETH, THE WHEEL TAKETH AWAY!',
    'PARTICIPATION TROPHY UNLOCKED!',
    'IT\'S NOT YOU, IT\'S THE RNG!',
    'SO CLOSE! (NOT REALLY.)',
    'A NOBLE DEFEAT!',
    'THE ODDS SEND THEIR REGARDS!',
    'TOUGH BREAK, HIGH ROLLER!',
    'THE DEALER SAYS SORRY. HE ISN\'T.',
    'NO JACKPOT TODAY!',
    'FORTUNE HAS LEFT THE CHAT!',
    'THAT\'S THE WAY THE WHEEL SPINS!',
    'MORAL VICTORY ACHIEVED!',
    'CHIN UP, CHAMP!',
    'THE REELS SAID NO!',
    'BUST! PLACE YOUR NEXT BET!',
    'COMMON DROP. STILL COUNTS!',
    'THE CROWD GOES MILD!',
    'YOU\'LL GET THEM NEXT DRAFT!',
];

/* ══════════════════════════════════════
   localStorage
   ─────────────────────────────────────
   One key, `spinpage`. Version 2 only adds fields: every key an older
   build reads keeps its name and meaning (undoStack is still written, as a
   copy of the draft), so going back to an old build never loses a table.
══════════════════════════════════════ */
const SAVE_VERSION = 2;

function saveState() {
    // A winner waiting on No One Is Safe is saved back on the wheel: the
    // event has not happened until it resolves, so a reload simply undoes it.
    const wheel = pendingPick && !names.includes(pendingPick.name) ? names.concat(pendingPick.name) : names;
    try {
        localStorage.setItem('spinpage', JSON.stringify({
            v: SAVE_VERSION,
            names: wheel, draftOrder, undoStack: draftOrder.map(p => ({ name: p.name, color: p.color })),
            winnerSlots, nameColors,
            noisEnabled, powerUpsEnabled, panicEnabled, windBackEnabled, goblinEnabled, popOffEnabled,
            displayDuration, autoDisplay, riggedValue,
            soundOn, calmPref, lastPick, spinLog, history: draftHistory, panicCooldown, goblinSeen,
        }));
        return true;
    } catch (e) { return false; }
}

function loadState() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem('spinpage') || 'null'); } catch (e) { raw = null; }
    const s = migrate(raw);
    names = s.names; draftOrder = s.draftOrder; winnerSlots = s.winnerSlots; nameColors = s.nameColors;
    noisEnabled = s.noisEnabled; powerUpsEnabled = s.powerUpsEnabled; panicEnabled = s.panicEnabled;
    windBackEnabled = s.windBackEnabled; goblinEnabled = s.goblinEnabled; popOffEnabled = s.popOffEnabled;
    displayDuration = s.displayDuration; autoDisplay = s.autoDisplay; riggedValue = s.riggedValue;
    soundOn = s.soundOn; calmPref = s.calmPref; lastPick = s.lastPick; spinLog = s.spinLog;
    draftHistory = s.history; panicCooldown = s.panicCooldown; goblinSeen = s.goblinSeen;
    // Re-sync stable colors: current wheel names first, then drafted picks,
    // so old/positional pick colors are migrated to the consistent scheme.
    names.forEach(colorOf);
    draftOrder.forEach(p => { p.color = colorOf(p.name); });
}

/* Whatever is in storage → a clean table. Pure: no globals read or written,
   so the unit tests can feed it every shape a save has ever had. */
function migrate(raw) {
    const out = {
        names: [], draftOrder: [], winnerSlots: 1, nameColors: {},
        noisEnabled: true, powerUpsEnabled: true, panicEnabled: true,
        windBackEnabled: true, goblinEnabled: true, popOffEnabled: true,
        displayDuration: 2800, autoDisplay: true, riggedValue: '',
        soundOn: true, calmPref: null, lastPick: '', spinLog: freshSpinLog(), history: [], panicCooldown: false,
        goblinSeen: false,
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;

    // One player, one place: the draft beats the wheel, first beats later.
    const seen = new Set();
    normalizePicks(raw.draftOrder).forEach(p => {
        const k = p.name.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.draftOrder.push(p); }
    });
    normalizeNames(raw.names).forEach(n => {
        const k = n.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.names.push(n); }
    });

    out.winnerSlots = normalizeWinnerSlots(raw.winnerSlots);
    for (const k of ['noisEnabled', 'powerUpsEnabled', 'panicEnabled', 'goblinEnabled', 'popOffEnabled', 'autoDisplay', 'soundOn', 'panicCooldown', 'goblinSeen']) {
        if (typeof raw[k] === 'boolean') out[k] = raw[k];
    }
    // plotTwistsEnabled was this setting's name before the makeover
    if (typeof raw.plotTwistsEnabled === 'boolean') out.windBackEnabled = raw.plotTwistsEnabled;
    if (typeof raw.windBackEnabled === 'boolean') out.windBackEnabled = raw.windBackEnabled;
    if (typeof raw.displayDuration === 'number' && raw.displayDuration >= 500 && raw.displayDuration <= 6000) out.displayDuration = raw.displayDuration;
    if (typeof raw.riggedValue === 'string') out.riggedValue = raw.riggedValue;
    if (raw.calmPref === true || raw.calmPref === false) out.calmPref = raw.calmPref;
    if (typeof raw.lastPick === 'string') out.lastPick = raw.lastPick;

    if (raw.nameColors && typeof raw.nameColors === 'object') {
        for (const [k, v] of Object.entries(raw.nameColors)) {
            if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) continue;
            const old = OLD_PALETTE.indexOf(v.toLowerCase());
            out.nameColors[k] = old >= 0 ? PALETTE[old] : v;
        }
    }
    // Saves from before the redesign have no log; they start counting now.
    if (raw.spinLog && typeof raw.spinLog === 'object') {
        for (const k of Object.keys(out.spinLog)) {
            const v = raw.spinLog[k];
            if (Number.isInteger(v) && v >= 0) out.spinLog[k] = v;
        }
    }
    if (Array.isArray(raw.history)) out.history = raw.history.filter(validEvent);
    return out;
}

function validEvent(ev) {
    if (!ev || typeof ev !== 'object') return false;
    const str = v => typeof v === 'string' && v.length > 0;
    if (ev.t === 'pick')  return Array.isArray(ev.names) && ev.names.length > 0 && ev.names.every(str);
    if (ev.t === 'steal') return str(ev.victim) && Number.isInteger(ev.seat) && ev.seat >= 0 && (ev.stealer === null || str(ev.stealer));
    if (ev.t === 'panic') return Array.isArray(ev.out) && ev.out.every(o => o && str(o.name) && Number.isInteger(o.seat) && o.seat >= 0);
    return false;
}

function normalizeNames(value) {
    if (!Array.isArray(value)) return [];
    return value
        .filter(name => typeof name === 'string')
        .map(name => name.trim())
        .filter(Boolean);
}

function normalizePicks(value) {
    if (!Array.isArray(value)) return [];
    return value
        .filter(pick => pick && typeof pick.name === 'string')
        .map(pick => ({
            name: pick.name.trim(),
            color: typeof pick.color === 'string' ? pick.color : '#e2b94a'
        }))
        .filter(pick => pick.name);
}

function normalizeWinnerSlots(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(99, parsed)) : 1;
}

/* ══════════════════════════════════════
   Commit
   ─────────────────────────────────────
   Every change to the table ends here: save once, then render once on the
   next microtask, however many things changed in between. There is no
   other way for the screen to update, so no panel can be left stale.
══════════════════════════════════════ */
let renderQueued = false;
function commit(opts) {
    if (!opts || opts.save !== false) saveState();
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => { renderQueued = false; render(); });
}

// The draft as text: winners, then losers, by pick.
function formatPicks(picks, slots) {
    const winners = picks.slice(0, slots);
    const losers = picks.slice(slots);
    const lines = [];
    if (winners.length) {
        lines.push('WINNERS');
        winners.forEach((p, i) => lines.push(`${ordinal(i + 1)} pick: ${p.name}`));
    }
    if (losers.length) {
        if (lines.length) lines.push('');
        lines.push('LOSERS');
        losers.forEach((p, i) => lines.push(`${ordinal(slots + i + 1)} pick: ${p.name}`));
    }
    return lines.join('\n');
}
function formatDraftCopy() { return formatPicks(draftOrder, getWinnerSlots()); }
