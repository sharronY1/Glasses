/**
 * Lightweight local persistence for focus sessions (JSON file, no SQL).
 * - Dev:  <project>/data/focus-data.json  (gitignored)
 * - Packaged: %APPDATA%/daydream/focus-data.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function localDateKey(d = new Date()) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function getDataFilePath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'focus-data.json');
  }
  const dir = path.join(__dirname, '..', 'data');
  return path.join(dir, 'focus-data.json');
}

function readDb(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return emptyDb();
    if (data.version !== 1) return migrateOrReset(data, filePath);
    return {
      version: 1,
      byDay: data.byDay && typeof data.byDay === 'object' ? data.byDay : {},
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
    };
  } catch (e) {
    if (e.code === 'ENOENT') return emptyDb();
    console.error('[focus-db] read error:', e.message);
    return emptyDb();
  }
}

function emptyDb() {
  return { version: 1, byDay: {}, sessions: [] };
}

function migrateOrReset(_old, filePath) {
  // Unknown shape — start fresh but keep file backup could be overkill; reset
  return emptyDb();
}

function writeDb(filePath, db) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf8');
}

function getTodayStats(filePath) {
  const key = localDateKey();
  const db = readDb(filePath);
  const day = db.byDay[key];
  return {
    date: key,
    count: day ? day.count : 0,
    totalMinutes: day ? day.minutes : 0,
  };
}

function recordSession(filePath, minutes) {
  const key = localDateKey();
  const db = readDb(filePath);
  if (!db.byDay[key]) db.byDay[key] = { count: 0, minutes: 0 };
  db.byDay[key].count += 1;
  db.byDay[key].minutes += minutes;
  db.sessions.push({
    date: key,
    minutes,
    ts: Date.now(),
  });
  // Optional cap to avoid huge files (keep last 2000 sessions)
  if (db.sessions.length > 2000) {
    db.sessions = db.sessions.slice(-2000);
  }
  writeDb(filePath, db);
  return getTodayStats(filePath);
}

function replaceTodayStats(filePath, stats, options = {}) {
  const key = stats.date && /^\d{4}-\d{2}-\d{2}$/.test(stats.date)
    ? stats.date
    : localDateKey();
  const db = readDb(filePath);
  const prev = db.byDay[key] || { count: 0, minutes: 0 };
  const nextCount = Math.max(0, Number(stats.count) || 0);
  const nextMin = Math.max(0, Number(stats.totalMinutes) || 0);
  db.byDay[key] = { count: nextCount, minutes: nextMin };

  const appendMin = Number(options.appendSessionMinutes) || 0;
  if (appendMin > 0) {
    db.sessions.push({ date: key, minutes: appendMin, ts: Date.now() });
    if (db.sessions.length > 2000) db.sessions = db.sessions.slice(-2000);
  }

  writeDb(filePath, db);
  return getTodayStats(filePath);
}

module.exports = {
  localDateKey,
  getDataFilePath,
  getTodayStats,
  recordSession,
  replaceTodayStats,
};
