import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '..', 'data');
export const DEFAULT_DB_PATH = path.join(DATA_DIR, 'os-flow.db');

export function openDatabase(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      badge TEXT NOT NULL,
      station TEXT NOT NULL,
      shift TEXT NOT NULL,
      shift_goal INTEGER NOT NULL DEFAULT 6
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      unit TEXT NOT NULL,
      sector TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      urgent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('queued', 'in_progress', 'paused', 'completed')),
      created_at TEXT NOT NULL,
      started_at TEXT,
      paused_at TEXT,
      pause_reason TEXT,
      completed_at TEXT,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'Despacho Central',
      assigned_operator_id TEXT,
      assigned_operator_name TEXT,
      assigned_station TEXT,
      operator_notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      order_code TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL DEFAULT 'NÃO INICIADO',
      text TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Despacho Central',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'sac',
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  const cols = db.prepare('PRAGMA table_info(work_orders)').all();
  if (!cols.some((c) => c.name === 'completed_by')) {
    db.exec('ALTER TABLE work_orders ADD COLUMN completed_by TEXT');
  }

  return db;
}

export function ensureBaseSettings(db) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('plantName', 'Planta Sul • Pavilhão 3');
  insertSetting.run('shiftLabel', 'Tempo de Ciclo Turno 02 • Atualização: 1 seg');
  insertSetting.run('dailyGoal', '40');
  insertSetting.run('totalBenches', '8');
}

export function mapOrderRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    unit: row.unit,
    sector: row.sector ?? '',
    title: row.title,
    description: row.description,
    urgent: Boolean(row.urgent),
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    pausedAt: row.paused_at ?? null,
    pauseReason: row.pause_reason ?? null,
    completedAt: row.completed_at ?? null,
    elapsedSeconds: Number(row.elapsed_seconds ?? 0),
    createdBy: row.created_by ?? 'Despacho Central',
    assignedOperatorId: row.assigned_operator_id ?? null,
    assignedOperatorName: row.assigned_operator_name ?? null,
    assignedStation: row.assigned_station ?? null,
    completedBy: row.completed_by ?? row.assigned_operator_name ?? null,
    operatorNotes: row.operator_notes ?? ''
  };
}

export function mapOperatorRow(row) {
  return {
    id: row.id,
    name: row.name,
    badge: row.badge,
    station: row.station,
    shift: row.shift,
    shiftGoal: Number(row.shift_goal ?? 6)
  };
}

export function mapAlertRow(row) {
  return {
    id: row.id,
    orderId: row.order_id ?? null,
    orderCode: row.order_code,
    type: row.type,
    message: row.message,
    actor: row.actor,
    createdAt: row.created_at,
    acknowledged: Boolean(row.acknowledged)
  };
}

export function mapNoticeRow(row) {
  return {
    id: row.id,
    label: row.label || 'NÃO INICIADO',
    text: row.text,
    author: row.author || 'Despacho Central',
    createdAt: row.created_at
  };
}

export function mapUnitRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at
  };
}

export function getNextOrderCode(db) {
  const rows = db.prepare('SELECT code FROM work_orders').all();
  let maxNum = 0;
  for (const r of rows) {
    const match = String(r.code || '').match(/(\d+)/);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `#${maxNum + 1}`;
}

export function computeElapsedSeconds(orderRow, nowMs = Date.now()) {
  const base = Number(orderRow.elapsed_seconds ?? 0);
  if (orderRow.status === 'in_progress' && orderRow.started_at) {
    const startMs = Date.parse(orderRow.started_at);
    if (Number.isFinite(startMs)) {
      const delta = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      return base + delta;
    }
  }
  return base;
}

export function buildAppState(db) {
  const now = new Date();
  const nowMs = now.getTime();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  const orderRows = db
    .prepare(`
      SELECT * FROM work_orders
      ORDER BY
        CASE status
          WHEN 'in_progress' THEN 0
          WHEN 'paused' THEN 1
          WHEN 'queued' THEN 2
          WHEN 'completed' THEN 3
        END ASC,
        urgent DESC,
        created_at ASC,
        id DESC
    `)
    .all();

  const orders = orderRows.map(mapOrderRow);
  const operators = db.prepare('SELECT * FROM operators ORDER BY name ASC').all().map(mapOperatorRow);
  const units = db.prepare('SELECT * FROM units ORDER BY name ASC').all().map(mapUnitRow);
  const alerts = db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT 30').all().map(mapAlertRow);
  const notices = db.prepare('SELECT * FROM notices ORDER BY id DESC').all().map(mapNoticeRow);

  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const s of settingsRows) {
    settings[s.key] = s.value;
  }

  const queued = orders.filter((o) => o.status === 'queued');
  const urgentQueued = queued.filter((o) => o.urgent);
  const inProgress = orders.filter((o) => o.status === 'in_progress' || o.status === 'paused');
  const completedToday = orders.filter((o) => {
    if (o.status !== 'completed' || !o.completedAt) return false;
    const ms = Date.parse(o.completedAt);
    return Number.isFinite(ms) && ms >= todayStartMs;
  });

  // Tempo médio em fila das ordens em fila + recém-iniciadas hoje
  let waitTotalMin = 0;
  let waitCount = 0;
  for (const o of queued) {
    const cMs = Date.parse(o.createdAt);
    if (Number.isFinite(cMs)) {
      waitTotalMin += Math.max(1, Math.round((nowMs - cMs) / 60000));
      waitCount++;
    }
  }
  for (const o of inProgress) {
    const cMs = Date.parse(o.createdAt);
    const sMs = o.startedAt ? Date.parse(o.startedAt) : nowMs;
    if (Number.isFinite(cMs) && Number.isFinite(sMs)) {
      waitTotalMin += Math.max(1, Math.round((sMs - cMs) / 60000));
      waitCount++;
    }
  }

  const avgQueueWaitMinutes = waitCount > 0 ? Math.max(1, Math.round(waitTotalMin / waitCount)) : 0;
  const totalBenches = Number.parseInt(settings.totalBenches || '8', 10) || 8;
  const busyBenches = Math.min(totalBenches, inProgress.filter((o) => o.status === 'in_progress').length);
  const freeBenches = Math.max(0, totalBenches - busyBenches);
  const dailyGoal = Number.parseInt(settings.dailyGoal || '40', 10) || 40;

  // SLA: % de ordens finalizadas hoje cujo atendimento durou <= 90min (ou todas se vazio)
  const completedTodayWithinSla = completedToday.filter((o) => o.elapsedSeconds <= 5400).length;
  const slaRate = completedToday.length > 0
    ? Number(((completedTodayWithinSla / completedToday.length) * 100).toFixed(1))
    : 100;

  return {
    orders,
    operators,
    units,
    alerts,
    notices,
    settings,
    metrics: {
      queuedCount: queued.length,
      urgentQueuedCount: urgentQueued.length,
      inProgressCount: inProgress.length,
      completedTodayCount: completedToday.length,
      totalCompletedCount: orders.filter((o) => o.status === 'completed').length,
      dailyGoal,
      avgQueueWaitMinutes,
      freeBenches,
      totalBenches,
      slaRate
    },
    nextCode: getNextOrderCode(db),
    serverTime: now.toISOString()
  };
}
