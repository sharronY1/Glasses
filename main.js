const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
let mainWindow = null;
const WINDOW_WIDTH          = 145;
const WINDOW_HEIGHT_FULL    = 265;
const WINDOW_HEIGHT_COMPACT = 130;  // timer running, no footer
const WINDOW_HEIGHT_PEEK    = 158;  // timer running, footer visible, no gap

// ── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  const saved = store.get('windowPosition', null);
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const x = saved ? saved.x : sw - WINDOW_WIDTH - 16;
  const y = saved ? saved.y : Math.floor(sh / 2 - WINDOW_HEIGHT_FULL / 2);

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = fs.existsSync(iconPath) ? iconPath : undefined;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT_FULL,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,        // must be true so setSize() works on Windows
    minWidth: WINDOW_WIDTH,
    maxWidth: WINDOW_WIDTH, // user cannot resize horizontally
    skipTaskbar: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('moved', savePosition);
  mainWindow.on('move', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window-moving');
  });
  mainWindow.on('close', savePosition);

  // Dev tools: remove before shipping if desired
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function savePosition() {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  store.set('windowPosition', { x, y });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-stats', () => {
  const today = new Date().toDateString();
  const raw = store.get('stats', { date: '', count: 0, totalMinutes: 0 });
  return raw.date === today ? raw : { date: today, count: 0, totalMinutes: 0 };
});

ipcMain.handle('save-stats', (_evt, stats) => {
  stats.date = new Date().toDateString();
  store.set('stats', stats);
});

ipcMain.handle('get-settings', () => {
  return store.get('settings', {
    encouragement: '你真棒！',
    glasses: false,
    defaultDuration: 25,
  });
});

ipcMain.handle('save-settings', (_evt, settings) => {
  store.set('settings', settings);
});

ipcMain.handle('quit-app', () => {
  app.quit();
});

ipcMain.handle('set-window-height', (_evt, h) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const target = Math.round(h);
  const [, curr] = mainWindow.getSize();
  if (curr === target) return;
  mainWindow.setSize(WINDOW_WIDTH, target);
});

// Keep for backward compat (not used anymore, safe to leave)
ipcMain.handle('set-window-compact', (_evt, compact) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setSize(WINDOW_WIDTH, compact ? WINDOW_HEIGHT_COMPACT : WINDOW_HEIGHT_FULL);
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
