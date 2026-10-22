/* ══════════════════════════════════════
   DOM
══════════════════════════════════════ */
const canvas        = document.getElementById('wheel');
const ctx           = canvas.getContext('2d');
const SIZE = canvas.width, cx = SIZE / 2, cy = SIZE / 2, R = cx - 12;
const wheelWrap     = document.getElementById('wheelWrap');

const namePanel     = document.querySelector('.name-panel');
const nameInput     = document.getElementById('nameInput');
const addBtn        = document.getElementById('addBtn');
const nameListEl    = document.getElementById('nameList');
const starterHint   = document.getElementById('starterHint');
const playerCount   = document.getElementById('playerCount');
const spinBtn       = document.getElementById('spinBtn');
const autoBtn       = document.getElementById('autoBtn');
const spinHint      = document.getElementById('spinHint');
const undoBtn       = document.getElementById('undoBtn');
const resetBtn      = document.getElementById('resetBtn');
const aboutBtn      = document.getElementById('aboutBtn');
const aboutOverlay  = document.getElementById('aboutOverlay');
const aboutClose    = document.getElementById('aboutClose');
const displaySlider = document.getElementById('displaySlider');
const displayValEl  = document.getElementById('displayVal');
const displayManual = document.getElementById('displayManual');
const autoDisplayToggle = document.getElementById('autoDisplayToggle');


const winnerSlotsInput = document.getElementById('winnerSlotsInput');
// The board's copy of the same setting, plus its stepper buttons
const draftSlotsInput  = document.getElementById('draftSlotsInput');
const slotsControl     = document.getElementById('slotsControl');
const slotsMinus       = document.getElementById('slotsMinus');
const slotsPlus        = document.getElementById('slotsPlus');
const setupSteps       = [1,2,3,4].map(n => document.getElementById('step' + n));
const winnerOverlay = document.getElementById('winnerOverlay');
const winnerNameEl  = document.getElementById('winnerName');
const winnerSubEl   = document.getElementById('winnerSub');


const winnerCard    = document.getElementById('winnerCard');
const powerUpPopup  = document.getElementById('powerUpPopup');
const powerUpRail   = document.getElementById('powerUpRail');
const railTitle     = document.getElementById('railTitle');
const railEmoji     = document.getElementById('railEmoji');
const railLabel     = document.getElementById('railLabel');
const railName      = document.getElementById('railName');
const railOdds      = document.getElementById('railOdds');
const draftSection  = document.getElementById('draftSection');
const draftGrid     = document.getElementById('draftGrid');
const draftSubtitle = document.getElementById('draftSubtitle');
const draftClear    = document.getElementById('draftClear');
const draftDock     = document.getElementById('draftDock');
const dockList      = document.getElementById('dockList');
const dockCount     = document.getElementById('dockCount');
const copyBtn       = document.getElementById('copyBtn');
