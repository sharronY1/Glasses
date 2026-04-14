/**
 * renderer.js — Daydream Focus Timer
 *
 * Responsibilities:
 *   • Pixel-art eye canvas drawing (open / half-blink / closed states)
 *   • Blink scheduling — every 5 minutes in all states (idle / running / paused)
 *   • Timer state machine: idle → running → paused → finished → idle
 *   • Hover-overlay (pause / stop) on the eyes area
 *   • Settings & stats overlays
 *   • IPC calls to main process for persistence
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// 1. CANVAS — PIXEL ART EYE RENDERER
// ═══════════════════════════════════════════════════════════════════

const canvas = document.getElementById('eyesCanvas');
const ctx    = canvas.getContext('2d');

/**
 * Logical pixel size (1 art pixel = P × P screen pixels).
 * Canvas is 130 × 55 px; each eye occupies 10 × 8 art pixels.
 *
 * Layout:
 *   left-eye  origin → screen (5,  5)
 *   right-eye origin → screen (75, 5)
 *   gap between eyes: 20 screen px — used for the glasses bridge
 *
 * Eye anatomy (per frame):
 *   • Eye ball (sclera + iris + pupil) is centred in columns 2–7
 *   • Glasses frame spans the full 10-column width (cols 0–9)
 *     so the frame visually surrounds the eye on all four sides.
 */
const P = 5;

const LEFT_X  = 5;   // screen x of left-eye origin
const RIGHT_X = 75;  // screen x of right-eye origin
const EYE_Y   = 5;   // screen y of both eye origins

/**
 * Colour palette  (index → CSS colour; 0 = transparent)
 *
 *  1  sclera (eye white)
 *  2  pupil  (near-black)
 *  3  iris   (blue)
 *  4  eyelid (warm grey — blink)
 *  5  pupil highlight (tiny specular dot)
 *  6  glasses frame (gold)
 */
const PAL = [
  null,       // 0 — transparent
  '#f0eeff',  // 1 — sclera
  '#0c0b22',  // 2 — pupil
  '#4472d8',  // 3 — iris (blue)
  '#9898b4',  // 4 — eyelid
  '#dde8ff',  // 5 — pupil highlight
  '#0a0a0a',  // 6 — glasses frame (black)
];

/**
 * Each eye frame: 10 columns × 8 rows.
 * The "almond" eye sits in the inner 6 × 6 region (cols 2–7, rows 1–6)
 * so that glasses col 0–1 and col 8–9 cleanly frame it.
 *
 * Anatomy key:
 *   sclera (1) fills the almond
 *   iris   (3) is a 4 × 4 block centred in the almond
 *   pupil  (2) is a 2 × 2 block at the iris centre
 *   highlight (5) = 1 pixel top-left of pupil
 */
const FRAME = {
  /**
   * Open eye — almond-shaped sclera, blue iris, dark pupil + specular dot
   *
   *  col: 0  1  2  3  4  5  6  7  8  9
   */
  OPEN: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 0
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0], // row 1  upper lid arc
    [0, 0, 1, 3, 3, 3, 3, 1, 0, 0], // row 2  iris top
    [0, 0, 1, 3, 5, 2, 3, 1, 0, 0], // row 3  pupil + highlight
    [0, 0, 1, 3, 2, 2, 3, 1, 0, 0], // row 4  pupil
    [0, 0, 1, 3, 3, 3, 3, 1, 0, 0], // row 5  iris bottom
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0], // row 6  lower lid arc
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 7
  ],

  /** Half-blink — upper lid drops to cover top two iris rows */
  HALF: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 4, 4, 4, 4, 0, 0, 0], // lid falls
    [0, 0, 4, 4, 4, 4, 4, 4, 0, 0], // lid covers iris top
    [0, 0, 4, 4, 4, 4, 4, 4, 0, 0], // lid covers pupil
    [0, 0, 1, 3, 2, 2, 3, 1, 0, 0], // lower half still visible
    [0, 0, 1, 3, 3, 3, 3, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],

  /** Fully closed — a thin curved line */
  CLOSED: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
    [0, 0, 0, 4, 4, 4, 4, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
};

/**
 * Glasses frame overlay (10 × 8).
 * Uses palette index 6 (gold). The oval spans the full column width
 * (sides at col 0 & col 9) so it visually surrounds the inner eye.
 * Drawn on top of the eye frame.
 */
const GLASSES = [
  [0, 6, 6, 6, 6, 6, 6, 6, 6, 0], // row 0  top arc
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6], // row 1  sides
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6], // row 2
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6], // row 3
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6], // row 4
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6], // row 5
  [6, 0, 0, 0, 0, 0, 0, 0, 0, 6], // row 6
  [0, 6, 6, 6, 6, 6, 6, 6, 6, 0], // row 7  bottom arc
];

/** Render one pixel-art grid at the given screen origin (ox, oy). */
function renderGrid(grid, ox, oy) {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const v = grid[row][col];
      if (v === 0) continue;
      ctx.fillStyle = PAL[v];
      ctx.fillRect(ox + col * P, oy + row * P, P, P);
    }
  }
}

/**
 * Draw both eyes (and optional glasses) onto the canvas.
 * @param {number[][]} eyeFrame  - One of FRAME.OPEN / HALF / CLOSED
 * @param {boolean}    glasses   - Whether to overlay glasses frames
 */
function drawEyes(eyeFrame, glasses) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  renderGrid(eyeFrame, LEFT_X,  EYE_Y);
  renderGrid(eyeFrame, RIGHT_X, EYE_Y);

  if (glasses) {
    renderGrid(GLASSES, LEFT_X,  EYE_Y);
    renderGrid(GLASSES, RIGHT_X, EYE_Y);

    // Glasses bridge connecting the two frames.
    // Right wall of left glasses (col 9):  x = LEFT_X + 9*P = 50; right edge = 55
    // Left  wall of right glasses (col 0): x = RIGHT_X = 75
    // Bridge spans x = 55 → 75 (20 px = 4 art px).
    // Drawn at rows 3–4 (mid-height) for a 2-art-pixel-tall bridge.
    ctx.fillStyle = PAL[6];
    const bridgeX = LEFT_X + 10 * P;           // x = 55
    const bridgeW = RIGHT_X - bridgeX;          // w = 20 px
    ctx.fillRect(bridgeX, EYE_Y + 3 * P, bridgeW, P);
    ctx.fillRect(bridgeX, EYE_Y + 4 * P, bridgeW, P);
  }
}

// ─── Blink animation ────────────────────────────────────────────────────────

let blinking = false;

/** Animate a single blink (open → half → closed → half → open). */
async function blink() {
  if (blinking) return;
  blinking = true;

  const seq    = [FRAME.HALF, FRAME.CLOSED, FRAME.HALF, FRAME.OPEN];
  const delays = [80, 130, 80, 0];

  for (let i = 0; i < seq.length; i++) {
    drawEyes(seq[i], settings.glasses);
    if (delays[i] > 0) await sleep(delays[i]);
  }

  blinking = false;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Blink schedulers ───────────────────────────────────────────────────────

/** Global cadence: one blink every 5 minutes (ms). */
const BLINK_INTERVAL_MS = 5 * 60 * 1000;

let runBlinkHandle = null;   // setInterval while timer is running
let idleBlinkHandle = null;  // setInterval while idle / paused / finished

/** Start the 5-minute blink interval (running state — separate handle from idle). */
function startRunBlink() {
  clearInterval(runBlinkHandle);
  runBlinkHandle = setInterval(blink, BLINK_INTERVAL_MS);
}

/** Stop the running-state blink interval. */
function stopRunBlink() {
  clearInterval(runBlinkHandle);
  runBlinkHandle = null;
}

/** Start 5-minute blink interval when not in running countdown (idle / paused / finished). */
function startIdleBlink() {
  stopIdleBlink();
  idleBlinkHandle = setInterval(blink, BLINK_INTERVAL_MS);
}

function stopIdleBlink() {
  clearInterval(idleBlinkHandle);
  idleBlinkHandle = null;
}


// ═══════════════════════════════════════════════════════════════════
// 2. APPLICATION STATE
// ═══════════════════════════════════════════════════════════════════

/**
 * @type {'idle'|'running'|'paused'|'finished'}
 */
let state = 'idle';

/** Persisted user preferences (loaded from main process on init). */
let settings = {
  encouragement:   '你真棒！',
  glasses:         false,
  defaultDuration: 25,
};

/** Today's statistics (reset each calendar day). */
let stats = {
  date:         '',
  count:        0,
  totalMinutes: 0,
};

/** Duration currently shown in the picker (minutes). */
let selectedDuration = 25;

/** Remaining seconds in the current session. */
let timeLeft = 0;

/** Active countdown interval handle. */
let tickHandle = null;


// ═══════════════════════════════════════════════════════════════════
// 3. DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════

const eyesWrap         = document.getElementById('eyesWrap');
const eyeHoverControls = document.getElementById('eyeHoverControls');
const appRoot          = document.getElementById('app');

const panelIdle        = document.getElementById('panelIdle');
const panelTimer       = document.getElementById('panelTimer');
const panelFinished    = document.getElementById('panelFinished');

const durationDisplay  = document.getElementById('durationDisplay');
const timerDisplay     = document.getElementById('timerDisplay');
const timerStatus      = document.getElementById('timerStatus');
const encourageDisplay = document.getElementById('encourageDisplay');
const sessionSummary   = document.getElementById('sessionSummary');

const pauseResumeBtn   = document.getElementById('pauseResumeBtn');

const overlayStats     = document.getElementById('overlayStats');
const overlaySettings  = document.getElementById('overlaySettings');

// ── Window-height constants (must match main.js) ─────────────────────────────
const H_FULL    = 265;
const H_COMPACT = 130;
const H_PEEK    = 158;
let movingLockUntil = 0;

function isSessionActive() {
  return state === 'running' || state === 'paused';
}

function isOverlayOpen() {
  return !overlayStats.classList.contains('hidden')
      || !overlaySettings.classList.contains('hidden');
}

function setWinH(h) {
  window.api.setWindowHeight(h);
}

function isMoveLocked() {
  return Date.now() < movingLockUntil;
}


// ═══════════════════════════════════════════════════════════════════
// 4. STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Switch the active panel and update eye-hover overlay visibility.
 * @param {'idle'|'running'|'paused'|'finished'} newState
 */
function setState(newState) {
  state = newState;

  panelIdle.classList.toggle    ('hidden', state !== 'idle');
  panelTimer.classList.toggle   ('hidden', state !== 'running' && state !== 'paused');
  panelFinished.classList.toggle('hidden', state !== 'finished');

  // Hover controls visible only when a session is active
  const sessionActive = isSessionActive();
  eyeHoverControls.classList.toggle('active', sessionActive);
  appRoot.classList.toggle('compact-mode', sessionActive);
  if (sessionActive) {
    appRoot.classList.remove('footer-expanded');
    setWinH(H_COMPACT);
  } else {
    appRoot.classList.remove('footer-expanded');
    setWinH(H_FULL);
  }

  // Pulsing glow on the eye container only while running
  eyesWrap.classList.toggle('running', state === 'running');
}

// ─── Idle ───────────────────────────────────────────────────────────────────

function goIdle() {
  clearInterval(tickHandle);
  tickHandle = null;
  stopRunBlink();
  startIdleBlink();
  pauseResumeBtn.textContent = '⏸';
  setState('idle');
  drawEyes(FRAME.OPEN, settings.glasses);
}

// ─── Running ────────────────────────────────────────────────────────────────

function startTimer() {
  timeLeft = selectedDuration * 60;
  stopIdleBlink();
  startRunBlink();
  setState('running');
  timerStatus.textContent = '专注中…';
  renderTimer();
  tick();
}

function tick() {
  tickHandle = setInterval(() => {
    timeLeft -= 1;
    renderTimer();
    if (timeLeft <= 0) finishTimer();
  }, 1_000);
}

// ─── Paused ─────────────────────────────────────────────────────────────────

function pauseTimer() {
  clearInterval(tickHandle);
  tickHandle = null;
  stopRunBlink();
  startIdleBlink();
  pauseResumeBtn.textContent = '▶';
  timerStatus.textContent    = '已暂停';
  setState('paused');
}

function resumeTimer() {
  stopIdleBlink();
  startRunBlink();
  pauseResumeBtn.textContent = '⏸';
  timerStatus.textContent    = '专注中…';
  setState('running');
  tick();
}

// ─── Finished ───────────────────────────────────────────────────────────────

async function finishTimer() {
  clearInterval(tickHandle);
  tickHandle = null;
  stopRunBlink();
  startIdleBlink();
  pauseResumeBtn.textContent = '⏸';

  // Persist updated stats
  stats.count        += 1;
  stats.totalMinutes += selectedDuration;
  stats.date          = new Date().toDateString();
  await window.api.saveStats(stats);

  // Populate finished panel
  encourageDisplay.textContent = settings.encouragement || '你真棒！';
  sessionSummary.textContent   =
    `完成 ${selectedDuration} 分钟 · 今日第 ${stats.count} 次`;

  setState('finished');
  drawEyes(FRAME.OPEN, settings.glasses);

  // Short celebratory double-blink
  await sleep(400);
  await blink();
  await sleep(300);
  await blink();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function renderTimer() {
  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${m}:${s}`;
}


// ═══════════════════════════════════════════════════════════════════
// 5. EVENT WIRING
// ═══════════════════════════════════════════════════════════════════

// ─── Duration picker ────────────────────────────────────────────────────────

document.getElementById('decBtn').addEventListener('click', () => {
  if (selectedDuration > 1) {
    selectedDuration -= 1;
    durationDisplay.textContent = selectedDuration;
  }
});

document.getElementById('incBtn').addEventListener('click', () => {
  if (selectedDuration < 120) {
    selectedDuration += 1;
    durationDisplay.textContent = selectedDuration;
  }
});

// ─── Primary actions ────────────────────────────────────────────────────────

document.getElementById('startBtn').addEventListener('click', startTimer);

document.getElementById('againBtn').addEventListener('click', goIdle);

pauseResumeBtn.addEventListener('click', () => {
  if (state === 'running') pauseTimer();
  else if (state === 'paused') resumeTimer();
});

document.getElementById('stopBtn').addEventListener('click', goIdle);

// ─── Stats overlay ──────────────────────────────────────────────────────────

document.getElementById('statsBtn').addEventListener('click', () => {
  document.getElementById('statCount').textContent   = stats.count   + ' 次';
  document.getElementById('statMinutes').textContent = stats.totalMinutes + ' 分钟';
  appRoot.classList.add('overlay-stats-compact');
  overlayStats.classList.remove('hidden');
  setWinH(H_COMPACT);
});

document.getElementById('closeStatsBtn').addEventListener('click', () => {
  overlayStats.classList.add('hidden');
  appRoot.classList.remove('overlay-stats-compact');
  if (isSessionActive()) setWinH(H_COMPACT);
  else setWinH(H_FULL);
});

// ─── Settings overlay ───────────────────────────────────────────────────────

document.getElementById('settingsBtn').addEventListener('click', () => {
  document.getElementById('encourageInput').value   = settings.encouragement  || '';
  document.getElementById('glassesToggle').checked  = !!settings.glasses;
  document.getElementById('defaultDurInput').value  = settings.defaultDuration || 25;
  overlaySettings.classList.remove('hidden');
  if (isSessionActive()) setWinH(H_FULL);
});

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const raw = document.getElementById('encourageInput').value.trim();
  settings.encouragement   = raw || '你真棒！';
  settings.glasses         = document.getElementById('glassesToggle').checked;
  settings.defaultDuration = Math.min(
    120,
    Math.max(1, parseInt(document.getElementById('defaultDurInput').value) || 25)
  );

  await window.api.saveSettings(settings);
  overlaySettings.classList.add('hidden');
  if (isSessionActive()) setWinH(H_COMPACT);

  // Refresh eye with the new glasses preference
  drawEyes(FRAME.OPEN, settings.glasses);

  // Sync the duration picker with the new default (only when idle)
  if (state === 'idle') {
    selectedDuration = settings.defaultDuration;
    durationDisplay.textContent = selectedDuration;
  }
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  overlaySettings.classList.add('hidden');
  if (isSessionActive()) setWinH(H_COMPACT);
});

// ─── Quit ───────────────────────────────────────────────────────────────────

document.getElementById('quitBtn').addEventListener('click', () => {
  window.api.quitApp();
});

// ─── Footer reveal (compact timer mode) ─────────────────────────────────────
function expandFooterPeek() {
  if (!isSessionActive()) return;
  if (isMoveLocked()) return;
  if (isOverlayOpen()) return;
  if (appRoot.classList.contains('footer-expanded')) return;
  appRoot.classList.add('footer-expanded');
  setWinH(H_PEEK);
}

function collapseFooterPeek() {
  if (!isSessionActive()) return;
  if (isMoveLocked()) return;
  if (isOverlayOpen()) return;
  appRoot.classList.remove('footer-expanded');
  setWinH(H_COMPACT);
}

appRoot.addEventListener('mouseenter', expandFooterPeek);
appRoot.addEventListener('mousemove',  expandFooterPeek);
appRoot.addEventListener('mouseleave', collapseFooterPeek);

// Fallback: pointer leaves the BrowserWindow entirely
document.addEventListener('mouseleave', (e) => {
  if (e.relatedTarget === null) collapseFooterPeek();
});

// Freeze auto expand/collapse briefly while user drags window.
window.api.onWindowMoving(() => {
  movingLockUntil = Date.now() + 260;
});


// ═══════════════════════════════════════════════════════════════════
// 6. INITIALISATION
// ═══════════════════════════════════════════════════════════════════

async function init() {
  // Load persisted data from main process
  settings = await window.api.getSettings();
  const rawStats  = await window.api.getStats();
  const today     = new Date().toDateString();
  stats = rawStats.date === today
    ? rawStats
    : { date: today, count: 0, totalMinutes: 0 };

  // Apply saved defaults to the duration picker
  selectedDuration = settings.defaultDuration || 25;
  durationDisplay.textContent = selectedDuration;

  // Initial canvas draw and state
  drawEyes(FRAME.OPEN, settings.glasses);
  startIdleBlink();
  setState('idle');
}

init();
