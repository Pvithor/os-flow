import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import {
  openDatabase,
  ensureBaseSettings,
  buildAppState,
  getNextOrderCode,
  computeElapsedSeconds,
  mapOrderRow,
  mapOperatorRow,
  mapNoticeRow,
  mapUnitRow,
  DEFAULT_DB_PATH
} from './db.mjs';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  countUsers,
  createSession,
  createUser,
  findUserById,
  findUserByUsername,
  mapUserRow,
  resolveSession,
  revokeSessionByToken,
  revokeUserSessions,
  setSessionCookie,
  updateUserPassword,
  verifyPassword
} from './auth.mjs';
import { seedInitialData } from './seed.mjs';
import { createTelegramNotifier, loadEnvIfPresent } from './telegram.mjs';
import { isAllowedFrontendPath, matchBotProbe } from './bot-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

function parseCreatedAt(raw) {
  if (!raw || typeof raw !== 'string') return new Date().toISOString();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

function deriveTitle(title, description) {
  const cleanTitle = (title || '').trim();
  if (cleanTitle) return cleanTitle;
  const firstLine = String(description || '').trim().split(/\r?\n/)[0] || 'Ordem de Serviço';
  if (firstLine.length <= 68) return firstLine;
  return `${firstLine.slice(0, 65).trimEnd()}...`;
}

function csvEscape(val) {
  const str = String(val ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function formatDurationPt(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(rem).padStart(2, '0')}s`;
  return `${rem}s`;
}

const createOrderSchema = z.object({
  unit: z.string().trim().min(2, 'Informe a unidade / planta / setor').max(140),
  sector: z.string().trim().max(140).optional().default(''),
  title: z.string().trim().max(140).optional().default(''),
  description: z.string().trim().min(3, 'Descreva o serviço ou ocorrência').max(2000),
  createdAt: z.string().optional(),
  urgent: z.boolean().default(false),
  startImmediately: z.boolean().default(false),
  operatorId: z.string().trim().optional(),
  createdBy: z.string().trim().max(80).optional()
});

const claimOrderSchema = z.object({
  operatorId: z.string().trim().optional()
});

const pauseOrderSchema = z.object({
  reason: z.string().trim().min(2, 'Informe o motivo da pausa').max(300)
});

const notesSchema = z.object({
  notes: z.string().max(2000).default('')
});

const completeOrderSchema = z.object({
  notes: z.string().max(2000).optional(),
  operatorId: z.string().trim().optional(),
  completedBy: z.string().trim().max(80).optional()
});

const createOperatorSchema = z.object({
  name: z.string().trim().min(2, 'Nome do operador obrigatório').max(80),
  badge: z.string().trim().max(40).optional().default(''),
  station: z.string().trim().max(100).optional().default('Equipe Técnica'),
  shift: z.string().trim().max(60).optional().default('TURNO B • POSTO ATIVO'),
  shiftGoal: z.number().int().min(1).max(50).optional().default(6)
});

const updateOperatorSchema = z.object({
  name: z.string().trim().min(2, 'Nome da pessoa obrigatório').max(80),
  badge: z.string().trim().max(40).optional(),
  station: z.string().trim().max(100).optional()
});

const createUnitSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da escola / unidade').max(140)
});

const updateUnitSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da escola / unidade').max(140)
});

const noticeCreateSchema = z.object({
  label: z.string().trim().min(1).max(24).optional().default('NÃO INICIADO'),
  text: z.string().trim().min(1, 'Digite o texto do aviso').max(280),
  author: z.string().trim().max(80).optional().default('Despacho Central')
});

const noticeUpdateSchema = z.object({
  label: z.string().trim().min(1).max(24).optional(),
  text: z.string().trim().min(1, 'Digite o texto do aviso').max(280)
});

const setupAuthSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]{3,40}$/, 'Usuário deve ter entre 3 e 40 caracteres (letras, números, . _ -)'),
  displayName: z
    .string()
    .trim()
    .min(2, 'Informe o nome de exibição')
    .max(80)
    .optional()
    .default('SAC • Controle Geral'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').max(128)
});

const loginAuthSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário').max(80),
  password: z.string().min(1, 'Informe a senha').max(128)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual').max(128),
  newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres').max(128)
});

export function createApp({
  dbPath = DEFAULT_DB_PATH,
  staticDir = DIST_DIR,
  seed = false,
  authRateLimitMax = 10,
  telegramNotifier,
  notifyAllRequests = process.env.TELEGRAM_NOTIFY_ALL_REQUESTS === 'true'
} = {}) {
  const db = openDatabase(dbPath);
  ensureBaseSettings(db);
  if (seed) {
    seedInitialData(db, { force: false });
  }

  const notifier =
    telegramNotifier ||
    createTelegramNotifier({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
      cooldownMs: Number(process.env.TELEGRAM_ALERT_COOLDOWN_MS) || 10000
    });

  function notifySecurity(type, req, detail = '', username = '') {
    notifier.notify({
      type,
      ip: req.ip || req.socket?.remoteAddress || '',
      method: req.method,
      path: req.originalUrl || req.path || '',
      userAgent: req.get('user-agent') || '',
      detail,
      username
    });
  }

  function sameOriginGuard(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }
    const host = req.get('host');
    if (!host) {
      notifySecurity('CSRF_BLOCKED', req, 'Host ausente');
      return res.status(403).json({ error: 'Host ausente' });
    }
    const origin = req.get('origin');
    const referer = req.get('referer');
    const source = origin || referer;
    if (source) {
      try {
        const parsedUrl = new URL(source);
        if (parsedUrl.host !== host) {
          notifySecurity('CSRF_BLOCKED', req, `Origem externa: ${source}`);
          return res.status(403).json({ error: 'Origem não autorizada' });
        }
      } catch {
        notifySecurity('CSRF_BLOCKED', req, 'Header Origin/Referer inválido');
        return res.status(403).json({ error: 'Origem inválida' });
      }
    }
    return next();
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null
        }
      },
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'deny' }
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const probe = matchBotProbe(req.path || '');
    if (probe.blocked) {
      res.setHeader('Cache-Control', 'no-store');
      notifySecurity('SENSITIVE_PROBE', req, probe.reason);
      return res.status(404).type('text/plain').send('Not Found');
    }
    return next();
  });

  if (notifyAllRequests) {
    app.use((req, _res, next) => {
      const reqPath = req.path || '';
      if (reqPath !== '/api/health' && reqPath !== '/favicon.ico' && !reqPath.startsWith('/assets/')) {
        notifySecurity('REQUEST_RECEIVED', req, 'Monitoramento completo ativo');
      }
      next();
    });
  }

  app.use('/api', sameOriginGuard, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      notifySecurity('RATE_LIMITED', req, 'Excesso de tentativas em autenticação (429)');
      res.status(429).json({
        error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
      });
    }
  });

  const sseClients = new Set();

  function disconnectSessions(tokenHashes) {
    const blocked = new Set(Array.isArray(tokenHashes) ? tokenHashes : [tokenHashes]);
    for (const client of sseClients) {
      if (blocked.has(client.tokenHash)) {
        try {
          client.res.end();
        } catch {
          // noop
        }
        sseClients.delete(client);
      }
    }
  }

  function broadcast(eventName, payload) {
    const state = buildAppState(db);
    const data = JSON.stringify({ event: eventName, payload, state });
    for (const client of sseClients) {
      try {
        client.res.write(`event: ${eventName}\ndata: ${data}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }
    return state;
  }

  const heartbeat = setInterval(() => {
    for (const client of sseClients) {
      try {
        client.res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }
  }, 25_000);
  heartbeat.unref?.();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/status', (req, res) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    const session = resolveSession(db, rawToken);
    if (!session && rawToken) {
      clearSessionCookie(res, req);
    }
    res.json({
      authenticated: Boolean(session),
      needsSetup: countUsers(db) === 0,
      user: session ? session.user : null
    });
  });

  app.post('/api/auth/setup', authLimiter, (req, res) => {
    if (countUsers(db) > 0) {
      notifySecurity('SETUP_BLOCKED', req, 'Setup inicial já bloqueado');
      return res.status(403).json({ error: 'Acesso inicial já configurado. Use a tela de login.' });
    }
    const parsed = setupAuthSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }

    try {
      const user = createUser(db, parsed.data);
      const session = createSession(db, user.id, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      setSessionCookie(res, req, session.token);
      notifySecurity('AUTH_SUCCESS', req, 'Configuração inicial concluída', user.username);
      return res.status(201).json({ authenticated: true, user });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Usuário já cadastrado' });
      }
      throw err;
    }
  });

  app.post('/api/auth/login', authLimiter, (req, res) => {
    if (countUsers(db) === 0) {
      notifySecurity('LOGIN_FAILED', req, 'Tentativa de login antes do setup inicial');
      return res.status(403).json({ error: 'Configure o acesso inicial primeiro.' });
    }
    const parsed = loginAuthSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Credenciais inválidas' });
    }

    const userRow = findUserByUsername(db, parsed.data.username);
    const valid = verifyPassword(parsed.data.password, userRow?.password_hash);
    if (!userRow || !userRow.active || !valid) {
      notifySecurity('LOGIN_FAILED', req, 'Usuário ou senha inválidos', parsed.data.username);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const session = createSession(db, userRow.id, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    setSessionCookie(res, req, session.token);
    notifySecurity('AUTH_SUCCESS', req, 'Login realizado', userRow.username);
    return res.json({ authenticated: true, user: mapUserRow(userRow) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    const tokenHash = revokeSessionByToken(db, rawToken);
    if (tokenHash) {
      disconnectSessions(tokenHash);
    }
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  function requireAuth(req, res, next) {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    const session = resolveSession(db, rawToken);
    if (!session) {
      if (rawToken) {
        clearSessionCookie(res, req);
      }
      notifySecurity(
        'UNAUTHORIZED_API',
        req,
        rawToken ? 'Sessão inválida ou expirada' : 'Requisição sem cookie de sessão'
      );
      return res.status(401).json({ error: 'Autenticação obrigatória' });
    }
    req.authUser = session.user;
    req.sessionTokenHash = session.tokenHash;
    return next();
  }

  app.use('/api', requireAuth);

  app.get('/api/auth/me', (req, res) => {
    res.json({ authenticated: true, user: req.authUser });
  });

  app.post('/api/auth/change-password', (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }

    const userRow = findUserById(db, req.authUser.id);
    if (!userRow || !verifyPassword(parsed.data.currentPassword, userRow.password_hash)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    if (parsed.data.newPassword === parsed.data.currentPassword) {
      return res.status(400).json({ error: 'A nova senha deve ser diferente da senha atual' });
    }

    updateUserPassword(db, req.authUser.id, parsed.data.newPassword);
    const revoked = revokeUserSessions(db, req.authUser.id, req.sessionTokenHash);
    disconnectSessions(revoked);
    notifySecurity('AUTH_SUCCESS', req, 'Senha alterada (outras sessões encerradas)', req.authUser.username);
    return res.json({ ok: true });
  });

  app.get('/api/state', (_req, res) => {
    res.json(buildAppState(db));
  });

  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const initial = JSON.stringify({ event: 'connected', state: buildAppState(db) });
    res.write(`event: connected\ndata: ${initial}\n\n`);

    const client = { res, tokenHash: req.sessionTokenHash };
    sseClients.add(client);
    req.on('close', () => {
      sseClients.delete(client);
    });
  });

  app.post('/api/orders', (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }

    const input = parsed.data;
    const nowIso = new Date().toISOString();
    const createdAtIso = parseCreatedAt(input.createdAt);
    const code = getNextOrderCode(db);
    const title = deriveTitle(input.title, input.description);

    let operator = null;
    if (input.startImmediately) {
      operator = input.operatorId
        ? db.prepare('SELECT * FROM operators WHERE id = ?').get(input.operatorId)
        : null;
    }

    const status = input.startImmediately ? 'in_progress' : 'queued';
    const startedAt = input.startImmediately ? nowIso : null;
    const actorName = input.createdBy?.trim() || (operator ? operator.name : 'SAC');

    db.prepare('INSERT OR IGNORE INTO units (name, created_at) VALUES (?, ?)').run(input.unit, nowIso);

    const result = db.prepare(`
      INSERT INTO work_orders (
        code, unit, sector, title, description, urgent, status,
        created_at, started_at, elapsed_seconds, created_by,
        assigned_operator_id, assigned_operator_name, assigned_station, operator_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, '')
    `).run(
      code,
      input.unit,
      input.sector || '',
      title,
      input.description,
      input.urgent ? 1 : 0,
      status,
      createdAtIso,
      startedAt,
      actorName,
      operator ? operator.id : null,
      operator ? operator.name : (input.startImmediately ? 'SAC' : null),
      operator ? operator.station : (input.startImmediately ? 'SAC • Controle Geral' : null)
    );

    const newId = Number(result.lastInsertRowid);
    const alertType = input.urgent ? 'urgent_dispatch' : 'new_dispatch';
    db.prepare(`
      INSERT INTO alerts (order_id, order_code, type, message, actor, created_at, acknowledged)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(
      newId,
      code,
      alertType,
      `${title} • ${input.unit}`,
      actorName,
      nowIso
    );

    const order = mapOrderRow(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(newId));
    const state = broadcast('order_created', { order });
    res.status(201).json({ order, state });
  });

  app.post('/api/orders/:id/claim', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const parsed = claimOrderSchema.safeParse(req.body || {});
    if (!Number.isFinite(id) || !parsed.success) {
      return res.status(400).json({ error: 'Parâmetros inválidos para assumir O.S' });
    }

    const orderRow = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!orderRow) return res.status(404).json({ error: 'O.S não encontrada' });
    if (orderRow.status === 'completed') {
      return res.status(409).json({ error: 'Esta O.S já foi finalizada' });
    }

    const operator = parsed.data.operatorId
      ? db.prepare('SELECT * FROM operators WHERE id = ?').get(parsed.data.operatorId)
      : null;

    const nowIso = new Date().toISOString();
    const baseElapsed = computeElapsedSeconds(orderRow);
    const opName = operator?.name || 'SAC';
    const opStation = operator?.station || 'SAC • Controle Geral';

    db.prepare(`
      UPDATE work_orders
      SET status = 'in_progress',
          started_at = ?,
          paused_at = NULL,
          pause_reason = NULL,
          elapsed_seconds = ?,
          assigned_operator_id = ?,
          assigned_operator_name = ?,
          assigned_station = ?
      WHERE id = ?
    `).run(nowIso, baseElapsed, operator ? operator.id : null, opName, opStation, id);

    db.prepare(`
      INSERT INTO alerts (order_id, order_code, type, message, actor, created_at, acknowledged)
      VALUES (?, ?, 'claimed', ?, ?, ?, 0)
    `).run(
      id,
      orderRow.code,
      opStation ? `${orderRow.title} assumida em ${opStation}` : `${orderRow.title} em atendimento`,
      opName,
      nowIso
    );

    const order = mapOrderRow(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id));
    const state = broadcast('order_claimed', { order });
    res.json({ order, state });
  });

  app.post('/api/orders/:id/pause', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const parsed = pauseOrderSchema.safeParse(req.body);
    if (!Number.isFinite(id) || !parsed.success) {
      return res.status(400).json({ error: parsed.error?.issues[0]?.message || 'Motivo da pausa obrigatório' });
    }

    const orderRow = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!orderRow) return res.status(404).json({ error: 'O.S não encontrada' });
    if (orderRow.status !== 'in_progress') {
      return res.status(409).json({ error: 'Somente O.S em atendimento pode ser pausada' });
    }

    const nowIso = new Date().toISOString();
    const elapsed = computeElapsedSeconds(orderRow);

    db.prepare(`
      UPDATE work_orders
      SET status = 'paused',
          started_at = NULL,
          paused_at = ?,
          pause_reason = ?,
          elapsed_seconds = ?
      WHERE id = ?
    `).run(nowIso, parsed.data.reason, elapsed, id);

    db.prepare(`
      INSERT INTO alerts (order_id, order_code, type, message, actor, created_at, acknowledged)
      VALUES (?, ?, 'paused', ?, ?, ?, 0)
    `).run(
      id,
      orderRow.code,
      `O.S pausada: ${parsed.data.reason}`,
      orderRow.assigned_operator_name || 'Operador',
      nowIso
    );

    const order = mapOrderRow(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id));
    const state = broadcast('order_paused', { order });
    res.json({ order, state });
  });

  app.post('/api/orders/:id/resume', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const orderRow = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!orderRow) return res.status(404).json({ error: 'O.S não encontrada' });
    if (orderRow.status !== 'paused') {
      return res.status(409).json({ error: 'Esta O.S não está pausada' });
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE work_orders
      SET status = 'in_progress',
          started_at = ?,
          paused_at = NULL,
          pause_reason = NULL
      WHERE id = ?
    `).run(nowIso, id);

    const order = mapOrderRow(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id));
    const state = broadcast('order_resumed', { order });
    res.json({ order, state });
  });

  app.post('/api/orders/:id/release', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const orderRow = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!orderRow) return res.status(404).json({ error: 'O.S não encontrada' });
    if (orderRow.status === 'completed') {
      return res.status(409).json({ error: 'Use reabrir para voltar uma O.S finalizada para a fila' });
    }

    const elapsed = computeElapsedSeconds(orderRow);
    db.prepare(`
      UPDATE work_orders
      SET status = 'queued',
          started_at = NULL,
          paused_at = NULL,
          pause_reason = NULL,
          elapsed_seconds = ?,
          assigned_operator_id = NULL,
          assigned_operator_name = NULL,
          assigned_station = NULL
      WHERE id = ?
    `).run(elapsed, id);

    const order = mapOrderRow(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id));
    const state = broadcast('order_released', { order });
    res.json({ order, state });
  });

  app.patch('/api/orders/:id/notes', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const parsed = notesSchema.safeParse(req.body);
    if (!Number.isFinite(id) || !parsed.success) {
      return res.status(400).json({ error: 'Observação inválida' });
    }

    const orderRow = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!orderRow) return res.status(404).json({ error: 'O.S não encontrada' });

    db.prepare('UPDATE work_orders SET operator_notes = ? WHERE id = ?').run(parsed.data.notes, id);
    const order = mapOrderRow(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id));
    const state = broadcast('order_updated', { order });
    res.json({ order, state });
  });

  app.post('/api/orders/:id/complete', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const parsed = completeOrderSchema.safeParse(req.body || {});
    if (!Number.isFinite(id) || !parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos ao finalizar O.S' });
    }

    const orderRow = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!orderRow) return res.status(404).json({ error: 'O.S não encontrada' });
    if (orderRow.status === 'completed') {
      return res.status(409).json({ error: 'Esta O.S já está finalizada' });
    }

    const nowIso = new Date().toISOString();
    const totalElapsed = Math.max(60, computeElapsedSeconds(orderRow));
    const notes = parsed.data.notes !== undefined ? parsed.data.notes : orderRow.operator_notes;

    let opId = orderRow.assigned_operator_id;
    let opName = orderRow.assigned_operator_name;
    let opStation = orderRow.assigned_station;

    if (parsed.data.operatorId) {
      const op = db.prepare('SELECT * FROM operators WHERE id = ?').get(parsed.data.operatorId);
      if (op) {
        opId = op.id;
        opName = op.name;
        opStation = op.station;
      }
    }

    const explicitFinisher = parsed.data.completedBy?.trim();
    if (explicitFinisher) {
      const matched = db
        .prepare('SELECT * FROM operators WHERE LOWER(name) = LOWER(?) LIMIT 1')
        .get(explicitFinisher);
      if (matched) {
        opId = matched.id;
        opName = matched.name;
        opStation = matched.station;
      } else {
        const slug = explicitFinisher
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const newOpId = `op-${slug || 'tech'}-${Date.now().toString(36).slice(-4)}`;
        db.prepare(`
          INSERT INTO operators (id, name, badge, station, shift, shift_goal)
          VALUES (?, ?, '', 'Equipe Técnica', 'TURNO B • POSTO ATIVO', 6)
        `).run(newOpId, explicitFinisher);
        opId = newOpId;
        opName = explicitFinisher;
      }
    }

    const finisherName = explicitFinisher || opName || 'Operador';

    db.prepare(`
      UPDATE work_orders
      SET status = 'completed',
          completed_at = ?,
          paused_at = NULL,
          pause_reason = NULL,
          elapsed_seconds = ?,
          operator_notes = ?,
          completed_by = ?,
          assigned_operator_id = COALESCE(?, assigned_operator_id),
          assigned_operator_name = COALESCE(?, assigned_operator_name),
          assigned_station = COALESCE(?, assigned_station)
      WHERE id = ?
    `).run(nowIso, totalElapsed, notes || '', finisherName, opId, opName || finisherName, opStation, id);

    db.prepare(`
      INSERT INTO alerts (order_id, order_code, type, message, actor, created_at, acknowledged)
      VALUES (?, ?, 'completed', ?, ?, ?, 0)
    `).run(
      id,
      orderRow.code,
      `Baixa realizada: ${orderRow.title}`,
      finisherName,
      nowIso
    );

    const order = mapOrderRow(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id));
    const state = broadcast('order_completed', { order });
    res.json({ order, state });
  });

  app.post('/api/orders/:id/reopen', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const orderRow = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id);
    if (!orderRow) return res.status(404).json({ error: 'O.S não encontrada' });

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE work_orders
      SET status = 'queued',
          started_at = NULL,
          paused_at = NULL,
          pause_reason = NULL,
          completed_at = NULL,
          assigned_operator_id = NULL,
          assigned_operator_name = NULL,
          assigned_station = NULL
      WHERE id = ?
    `).run(id);

    db.prepare(`
      INSERT INTO alerts (order_id, order_code, type, message, actor, created_at, acknowledged)
      VALUES (?, ?, 'reopened', ?, 'Supervisor', ?, 0)
    `).run(id, orderRow.code, `O.S reaberta para fila: ${orderRow.title}`, nowIso);

    const order = mapOrderRow(db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id));
    const state = broadcast('order_reopened', { order });
    res.json({ order, state });
  });

  app.delete('/api/orders/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const existing = db.prepare('SELECT id, code FROM work_orders WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'O.S não encontrada' });

    db.prepare('DELETE FROM alerts WHERE order_id = ?').run(id);
    db.prepare('DELETE FROM work_orders WHERE id = ?').run(id);
    const state = broadcast('order_deleted', { id, code: existing.code });
    res.json({ deletedId: id, state });
  });

  app.post('/api/operators', (req, res) => {
    const parsed = createOperatorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }

    const { name, badge, station, shift, shiftGoal } = parsed.data;
    const existingByName = db.prepare('SELECT * FROM operators WHERE LOWER(name) = LOWER(?) LIMIT 1').get(name);
    if (existingByName) {
      const operator = mapOperatorRow(existingByName);
      return res.json({ operator, state: buildAppState(db) });
    }

    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = `op-${slug || 'tech'}-${Date.now().toString(36).slice(-4)}`;

    db.prepare(`
      INSERT INTO operators (id, name, badge, station, shift, shift_goal)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, badge, station || 'Equipe Técnica', shift, shiftGoal);

    const operator = mapOperatorRow(db.prepare('SELECT * FROM operators WHERE id = ?').get(id));
    const state = broadcast('operator_created', { operator });
    res.status(201).json({ operator, state });
  });

  app.patch('/api/operators/:id', (req, res) => {
    const { id } = req.params;
    const parsed = updateOperatorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' });
    }

    const existing = db.prepare('SELECT * FROM operators WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Pessoa não encontrada' });

    const { name } = parsed.data;
    const duplicate = db
      .prepare('SELECT id FROM operators WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1')
      .get(name, id);
    if (duplicate) {
      return res.status(409).json({ error: 'Já existe uma pessoa com este nome' });
    }

    const nextBadge = parsed.data.badge !== undefined ? parsed.data.badge : existing.badge;
    const nextStation = parsed.data.station !== undefined && parsed.data.station !== ''
      ? parsed.data.station
      : parsed.data.station === ''
        ? 'Equipe Técnica'
        : existing.station;

    db.prepare('UPDATE operators SET name = ?, badge = ?, station = ? WHERE id = ?')
      .run(name, nextBadge, nextStation, id);
    db.prepare('UPDATE work_orders SET assigned_operator_name = ?, assigned_station = ? WHERE assigned_operator_id = ?')
      .run(name, nextStation, id);
    db.prepare('UPDATE work_orders SET completed_by = ? WHERE completed_by = ?')
      .run(name, existing.name);

    const operator = mapOperatorRow(db.prepare('SELECT * FROM operators WHERE id = ?').get(id));
    const state = broadcast('operator_updated', { operator });
    res.json({ operator, state });
  });

  app.delete('/api/operators/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM operators WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Operador não encontrado' });

    db.prepare('DELETE FROM operators WHERE id = ?').run(id);
    const state = broadcast('operator_deleted', { id });
    res.json({ deletedId: id, state });
  });

  app.post('/api/units', (req, res) => {
    const parsed = createUnitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Unidade inválida' });
    }
    const { name } = parsed.data;
    const existing = db.prepare('SELECT * FROM units WHERE LOWER(name) = LOWER(?)').get(name);
    if (existing) {
      const unit = mapUnitRow(existing);
      return res.json({ unit, state: buildAppState(db) });
    }
    const nowIso = new Date().toISOString();
    const result = db.prepare('INSERT INTO units (name, created_at) VALUES (?, ?)').run(name, nowIso);
    const unit = mapUnitRow(db.prepare('SELECT * FROM units WHERE id = ?').get(Number(result.lastInsertRowid)));
    const state = broadcast('unit_created', { unit });
    res.status(201).json({ unit, state });
  });

  app.patch('/api/units/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const parsed = updateUnitSchema.safeParse(req.body);
    if (!Number.isFinite(id) || !parsed.success) {
      return res.status(400).json({ error: parsed.error?.issues[0]?.message || 'Dados inválidos' });
    }

    const existing = db.prepare('SELECT * FROM units WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Escola / unidade não encontrada' });

    const { name } = parsed.data;
    const duplicate = db
      .prepare('SELECT id FROM units WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1')
      .get(name, id);
    if (duplicate) {
      return res.status(409).json({ error: 'Já existe uma escola/unidade com este nome' });
    }

    db.prepare('UPDATE units SET name = ? WHERE id = ?').run(name, id);
    db.prepare('UPDATE work_orders SET unit = ? WHERE unit = ?').run(name, existing.name);

    const unit = mapUnitRow(db.prepare('SELECT * FROM units WHERE id = ?').get(id));
    const state = broadcast('unit_updated', { unit });
    res.json({ unit, state });
  });

  app.delete('/api/units/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const existing = db.prepare('SELECT id FROM units WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Unidade não encontrada' });

    db.prepare('DELETE FROM units WHERE id = ?').run(id);
    const state = broadcast('unit_deleted', { id });
    res.json({ deletedId: id, state });
  });

  app.patch('/api/alerts/:id/ack', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(id);
    const state = broadcast('alert_acknowledged', { id });
    res.json({ ok: true, state });
  });

  app.post('/api/notices', (req, res) => {
    const parsed = noticeCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Aviso inválido' });
    }
    const { label, text, author } = parsed.data;
    const nowIso = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO notices (label, text, author, created_at)
      VALUES (?, ?, ?, ?)
    `).run(label.toUpperCase(), text, author, nowIso);
    const id = Number(result.lastInsertRowid);
    const notice = mapNoticeRow(db.prepare('SELECT * FROM notices WHERE id = ?').get(id));
    const state = broadcast('notice_created', { notice });
    res.status(201).json({ notice, state });
  });

  app.patch('/api/notices/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const parsed = noticeUpdateSchema.safeParse(req.body);
    if (!Number.isFinite(id) || !parsed.success) {
      return res.status(400).json({ error: parsed.error?.issues[0]?.message || 'Dados inválidos' });
    }
    const existing = db.prepare('SELECT * FROM notices WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Aviso não encontrado' });

    const nextLabel = (parsed.data.label || existing.label || 'NÃO INICIADO').toUpperCase();
    db.prepare('UPDATE notices SET label = ?, text = ? WHERE id = ?').run(nextLabel, parsed.data.text, id);
    const notice = mapNoticeRow(db.prepare('SELECT * FROM notices WHERE id = ?').get(id));
    const state = broadcast('notice_updated', { notice });
    res.json({ notice, state });
  });

  app.delete('/api/notices/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const existing = db.prepare('SELECT id FROM notices WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Aviso não encontrado' });

    db.prepare('DELETE FROM notices WHERE id = ?').run(id);
    const state = broadcast('notice_deleted', { id });
    res.json({ deletedId: id, state });
  });

  app.post('/api/alerts/ack-all', (_req, res) => {
    db.prepare('UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0').run();
    const state = broadcast('alerts_acknowledged_all', {});
    res.json({ ok: true, state });
  });

  app.get('/api/orders/export.csv', (req, res) => {
    const status = String(req.query.status || 'completed');
    const urgentParam = String(req.query.urgent || 'all');
    const operatorId = String(req.query.operatorId || 'all');
    const query = String(req.query.q || '').trim().toLowerCase();

    const state = buildAppState(db);
    const filtered = state.orders.filter((o) => {
      if (status !== 'all' && o.status !== status) return false;
      if (urgentParam === 'urgent' && !o.urgent) return false;
      if (urgentParam === 'normal' && o.urgent) return false;
      if (operatorId !== 'all' && o.assignedOperatorId !== operatorId) return false;
      if (query) {
        const hay = `${o.code} ${o.unit} ${o.title} ${o.description} ${o.assignedOperatorName || ''} ${o.operatorNotes || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    const header = [
      'Codigo',
      'Status',
      'Urgente',
      'Unidade',
      'Titulo',
      'Descricao',
      'Criado Em',
      'Iniciado Em',
      'Finalizado Em',
      'Duracao',
      'Operador',
      'Finalizado Por',
      'Estacao',
      'Observacoes'
    ].map(csvEscape).join(';');

    const lines = filtered.map((o) => [
      o.code,
      o.status,
      o.urgent ? 'SIM' : 'NAO',
      o.unit,
      o.title,
      o.description,
      o.createdAt,
      o.startedAt || '',
      o.completedAt || '',
      formatDurationPt(o.elapsedSeconds),
      o.assignedOperatorName || '',
      o.completedBy || o.assignedOperatorName || '',
      o.assignedStation || '',
      o.operatorNotes || ''
    ].map(csvEscape).join(';'));

    const csv = `\uFEFF${[header, ...lines].join('\r\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="os-flow-relatorio.csv"');
    res.send(csv);
  });

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { dotfiles: 'ignore', fallthrough: true }));
    app.use((req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint não encontrado' });
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && isAllowedFrontendPath(req.path || '')) {
        return res.sendFile('index.html', { root: staticDir });
      }
      if (req.path !== '/favicon.ico') {
        notifySecurity('SENSITIVE_PROBE', req, 'Arquivo ou caminho restrito inexistente (404)');
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).type('text/plain').send('Not Found');
    });
  } else {
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'Endpoint não encontrado' });
    });
    app.use((req, res) => {
      if (req.path !== '/favicon.ico') {
        notifySecurity('SENSITIVE_PROBE', req, 'Arquivo ou caminho restrito inexistente (404)');
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).type('text/plain').send('Not Found');
    });
  }

  app.use((err, req, res, _next) => {
    if (res.headersSent) return;
    if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
      return res.status(400).json({ error: 'JSON inválido' });
    }
    const status = Number(err?.status || err?.statusCode) || 500;
    if (req.path.startsWith('/api')) {
      return res
        .status(status)
        .json({ error: status === 404 ? 'Não encontrado' : 'Erro interno do servidor' });
    }
    return res
      .status(status)
      .type('text/plain')
      .send(status === 404 ? 'Not Found' : 'Internal Server Error');
  });

  app.locals.db = db;
  app.locals.close = () => {
    clearInterval(heartbeat);
    for (const client of sseClients) {
      try {
        client.res.end();
      } catch {
        /* noop */
      }
    }
    sseClients.clear();
    db.close();
  };

  return app;
}

function getLanAddresses() {
  const ifaces = os.networkInterfaces();
  const urls = [];
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(entry.address);
      }
    }
  }
  return urls;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  loadEnvIfPresent(path.resolve(__dirname, '..', '.env'));
  const port = Number.parseInt(process.env.PORT || '3001', 10) || 3001;
  const host = process.env.HOST || '127.0.0.1';
  const app = createApp();

  const server = app.listen(port, host, () => {
    console.log(`\n[OS FLOW] Servidor ativo!`);
    console.log(`  Local: http://127.0.0.1:${port}`);
    if (host === '0.0.0.0') {
      for (const ip of getLanAddresses()) {
        console.log(`  Rede/TV: http://${ip}:${port}`);
      }
    } else {
      console.log(`  Modo restrito: somente local (${host})`);
    }
    console.log(`  Banco: ${DEFAULT_DB_PATH}\n`);
  });

  const shutdown = () => {
    server.close(() => {
      app.locals.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
