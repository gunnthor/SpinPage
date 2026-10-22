/* ══════════════════════════════════════
   State
══════════════════════════════════════ */
let names           = [];
let draftOrder      = [];
let undoStack       = [];
let rotation        = 0;
let isSpinning      = false;
let isBusy          = false;
let autoSpin        = false;
let displayDuration = 2800;
let autoDisplay     = true;     // auto-scale winner display by table size
let winnerSlots     = 1;
let lastTickSection     = -1;
let windBackEnabled     = true;
let goblinEnabled       = true;   // rare: something climbs on and creeps the wheel round by hand
let noisEnabled         = true;
let riggedEnabled       = false;
let riggedValue         = '';     // name/prefix the rigged mode forces to win
let powerUpsEnabled     = true;
let panicEnabled        = true;
let popOffEnabled       = true;   // allow a monster hand-flick to rip the wheel off its hub
let panicCooldown       = false;  // blocks PANIC from landing two spins in a row
let sliceWeights        = null;   // per-spin slice multipliers (null = all equal)
let nameColors          = {};     // lowercased name -> stable color (consistent everywhere)

const POWERUPS = [
    { type: 'hotseat',  label: 'Hot Seat', emoji: '🔥', factor: 3.0,  color: '#f5a623' },
    { type: 'cursed',   label: 'Cursed',   emoji: '💀', factor: 0.25, color: '#9b59b6' },
    { type: 'wildcard', label: 'Wildcard', emoji: '🎲',               color: '#1abc9c' },
];

// The PANIC wedge is a non-player slice: landing on it starts the horse race
// instead of picking a winner. It only appears once 2+ players are drafted.
const PANIC = { label: 'PANIC', color: '#2a0a3a', textColor: '#ff5c8a', weight: 0.8 };
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

const prefersReducedMotion = () =>
    !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const PALETTE = [
    '#b03a2e','#1a5276','#1e8449','#b7950b','#6c3483',
    '#117a65','#935116','#154360','#196f3d','#7b241c',
    '#4a235a','#0e6251','#784212','#1b4f72','#922b21',
];

// Below this width the name panel sits UNDER the wheel, so on-canvas
// copy has to point down instead of left. Matches the CSS breakpoint.
const STACK_BREAKPOINT = 700;
function stackedLayout() { return window.innerWidth <= STACK_BREAKPOINT; }

function sliceColor(i) { return PALETTE[i % PALETTE.length]; }
function ordinal(n) { const s=['th','st','nd','rd'],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

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

function weightedPick(w) {
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) return Math.floor(Math.random() * w.length);
    let r = Math.random() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return w.length - 1;
}


// Winner overlay duration: linger (~2s) for small tables, snappier as the
// roster grows so big autospun drafts don't drag.
function winnerDisplayMs() {
    if (!autoDisplay) return displayDuration;
    const total = totalEntrants();
    if (total < 5) return 2000;
    return Math.max(600, Math.round(2000 - (total - 4) * 100));
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

/* ══════════════════════════════════════
   localStorage
══════════════════════════════════════ */
function saveState() {
    try { localStorage.setItem('spinpage', JSON.stringify({
        names, draftOrder, undoStack, winnerSlots, nameColors,
        noisEnabled, powerUpsEnabled, panicEnabled, windBackEnabled, goblinEnabled, popOffEnabled, displayDuration, autoDisplay, riggedValue
    })); } catch(e) {}
}

function loadState() {
    try {
        const s = JSON.parse(localStorage.getItem('spinpage') || 'null');
        if (s) {
            names = normalizeNames(s.names);
            draftOrder = normalizePicks(s.draftOrder);
            undoStack = normalizePicks(s.undoStack);
            winnerSlots = normalizeWinnerSlots(s.winnerSlots);
            if (typeof s.noisEnabled === 'boolean') noisEnabled = s.noisEnabled;
            if (typeof s.powerUpsEnabled === 'boolean') powerUpsEnabled = s.powerUpsEnabled;
            if (typeof s.panicEnabled === 'boolean') panicEnabled = s.panicEnabled;
            // plotTwistsEnabled was this setting's name before the makeover
            if (typeof s.plotTwistsEnabled === 'boolean') windBackEnabled = s.plotTwistsEnabled;
            if (typeof s.windBackEnabled === 'boolean') windBackEnabled = s.windBackEnabled;
            if (typeof s.goblinEnabled === 'boolean') goblinEnabled = s.goblinEnabled;
            if (typeof s.popOffEnabled === 'boolean') popOffEnabled = s.popOffEnabled;
            if (typeof s.displayDuration === 'number' && s.displayDuration >= 500 && s.displayDuration <= 6000) displayDuration = s.displayDuration;
            if (typeof s.autoDisplay === 'boolean') autoDisplay = s.autoDisplay;
            if (typeof s.riggedValue === 'string') riggedValue = s.riggedValue;
            if (s.nameColors && typeof s.nameColors === 'object') nameColors = s.nameColors;
            // Re-sync stable colors: current wheel names first, then drafted picks,
            // so old/positional pick colors are migrated to the consistent scheme.
            names.forEach(colorOf);
            draftOrder.forEach(p => { p.color = colorOf(p.name); });
            undoStack.forEach(p => { p.color = colorOf(p.name); });
        }
    } catch(e) {}
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
            color: typeof pick.color === 'string' ? pick.color : '#d4af37'
        }))
        .filter(pick => pick.name);
}

function normalizeWinnerSlots(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
}

function totalEntrants() {
    return names.length + draftOrder.length;
}

function getWinnerSlots() {
    return Math.max(1, Math.min(winnerSlots, Math.max(1, totalEntrants())));
}

function syncWinnerSlotsInput() {
    const max = Math.max(1, totalEntrants());
    winnerSlots = Math.max(1, Math.min(winnerSlots, max));
    // Two inputs, one number: the Options row and the one on the board.
    // Don't stomp on whichever one is being typed into.
    [winnerSlotsInput, draftSlotsInput].forEach(input => {
        input.max = max;
        // A field cleared mid-edit is left alone; anything else gets the
        // clamped number back, so typing 99 with 5 players shows 5.
        if (document.activeElement === input && input.value === '') return;
        input.value = winnerSlots;
    });
    slotsMinus.disabled = winnerSlots <= 1;
    slotsPlus.disabled  = winnerSlots >= max;
    const label = winnerSlots === 1 ? 'First position counts as winner.' : `First ${winnerSlots} positions count as winners.`;
    draftSubtitle.textContent = `${label} Everyone after that is a loser.`;
}

// Single path in for both inputs and the +/- buttons.
function setWinnerSlots(value) {
    winnerSlots = normalizeWinnerSlots(value);
    syncWinnerSlotsInput();
    renderDraft();
    saveState();
}
