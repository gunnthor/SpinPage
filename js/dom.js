/* ══════════════════════════════════════
   DOM
══════════════════════════════════════ */
const $ = id => document.getElementById(id);

const canvas        = $('wheel');
const ctx           = canvas.getContext('2d');
// Wheel space: everything is drawn in these 480 units and scaled to the
// real backing store, so the gremlin and pop-off geometry never changes.
const SIZE = canvas.width, cx = SIZE / 2, cy = SIZE / 2, R = cx - 12;
const app           = $('app');
const wheelWrap     = $('wheelWrap');
const wheelStage    = $('wheelStage');
const wheelFrame    = $('wheelFrame');
const wheelEmpty    = $('wheelEmpty');

const nameInput     = $('nameInput');
const quickInput    = $('quickInput');
const addForm       = $('addForm');
const quickAdd      = $('quickAdd');
const nameListEl    = $('nameList');
const starterHint   = $('starterHint');
const playerCount   = $('playerCount');
const playersFoot   = $('playersFoot');
const playersPanel  = $('playersPanel');
const boardPanel    = $('boardPanel');

const spinBtn       = $('spinBtn');
const spinLabel     = $('spinLabel');
const autoBtn       = $('autoBtn');
const autoLabel     = $('autoLabel');
const spinHint      = $('spinHint');
const undoBtn       = $('undoBtn');
const resetBtn      = $('resetBtn');
const soundBtn      = $('soundBtn');
const optionsBtn    = $('optionsBtn');
const aboutBtn      = $('aboutBtn');
const rigDot        = $('rigDot');

const settingsDialog = $('settingsDialog');
const aboutDialog    = $('aboutDialog');
const displaySlider  = $('displaySlider');
const displayValEl   = $('displayVal');
const displayManual  = $('displayManual');
const autoDisplayToggle = $('autoDisplayToggle');
const winnerSlotsInput  = $('winnerSlotsInput');
const soundToggle    = $('soundToggle');
const calmToggle     = $('calmToggle');
const riggedToggle   = $('riggedToggle');
const riggedInput    = $('riggedInput');
const noisToggle     = $('noisToggle');
const powerUpToggle  = $('powerUpToggle');
const panicToggle    = $('panicToggle');
const popOffToggle   = $('popOffToggle');
const windBackToggle = $('windBackToggle');
const goblinToggle   = $('goblinToggle');

// The board's copy of the winner-slots setting, plus its stepper buttons
const draftSlotsInput  = $('draftSlotsInput');
const slotsControl     = $('slotsControl');
const slotsMinus       = $('slotsMinus');
const slotsPlus        = $('slotsPlus');
const draftSubtitle    = $('draftSubtitle');
const draftGrid        = $('draftGrid');
const boardCount       = $('boardCount');
const boardLog         = $('boardLog');
const copyBtn          = $('copyBtn');
const restoreBtn       = $('restoreBtn');
const draftClear       = $('draftClear');
const setupSteps       = [1, 2, 3, 4].map(n => $('step' + n));

// Scoreboard and status line
const statNext       = $('statNext');
const statNextSub    = $('statNextSub');
const statLeft       = $('statLeft');
const statLeftNum    = $('statLeftNum');
const statLeftSub    = $('statLeftSub');
const statLatest     = $('statLatest');
const statLatestDot  = $('statLatestDot');
const statLatestName = $('statLatestName');
const statLatestSub  = $('statLatestSub');
const statSpins      = $('statSpins');
const statSpinsSub   = $('statSpinsSub');
const scoreFill      = $('scoreFill');
const scoreCut       = $('scoreCut');
const ticker         = $('ticker');
const tickerText     = $('tickerText');
const tickerOdds     = $('tickerOdds');

// Phone dock and tab bar
const dockPicks      = $('dockPicks');
const dockStrip      = $('dockStrip');
const tabPlayers     = $('tabPlayers');
const tabBoard       = $('tabBoard');
const tabSettings    = $('tabSettings');
const tabPlayersBadge = $('tabPlayersBadge');
const tabBoardBadge  = $('tabBoardBadge');
const scrim          = $('scrim');

// The winner's moment, and the stunt banners that share the stage
const winCallout     = $('winCallout');
const winKicker      = $('winKicker');
const winName        = $('winName');
const winSub         = $('winSub');
const powerUpPopup   = $('powerUpPopup');
const announcer      = $('announcer');
const alerter        = $('alerter');
