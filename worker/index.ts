import { Hono, type Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildClearSessionCookie,
  buildSessionSetCookie,
  parseSessionCookie,
  verifyPassword
} from './auth';
import {
  buildAppState,
  checkAuthRateLimit,
  computeElapsedSeconds,
  countUsers,
  createSession,
  createSupabaseAdminClient,
  createUser,
  findUserById,
  findUserByUsername,
  getNextOrderCode,
  mapNoticeRow,
  mapOperatorRow,
  mapOrderRow,
  mapUnitRow,
  mapUserRow,
  resolveSession,
  revokeSessionByToken,
  revokeUserSessions,
  updateUserPassword
} from './db';
import { createEmailNotifier, type EmailNotifier } from './email';
import {
  changePasswordSchema,
  claimOrderSchema,
  completeOrderSchema,
  createOperatorSchema,
  createOrderSchema,
  createUnitSchema,
  loginAuthSchema,
  notesSchema,
  noticeCreateSchema,
  noticeUpdateSchema,
  pauseOrderSchema,
  setupAuthSchema,
  updateOperatorSchema,
  updateUnitSchema
} from './schemas';
import { captureWorkerException } from './sentry';
import { createWorkerTelegramNotifier, type TelegramNotifier } from './telegram';
import { isAllowedFrontendPath, matchBotProbe } from './bot-guard';
import type { AuthUser, WorkerEnv } from './types';

type AppVars = {
  authUser: AuthUser;
  sessionTokenHash: string;
};

type AppContext = Context<{ Bindings: WorkerEnv; Variables: AppVars }>;

export interface WorkerAppOptions {
  createDb?: (env: WorkerEnv) => SupabaseClient;
  createTelegram?: (env: WorkerEnv) => TelegramNotifier;
  createEmail?: (env: WorkerEnv) => EmailNotifier;
  captureError?: (
    err: unknown,
    env: WorkerEnv,
    ctx: { method?: string; path?: string; status?: number }
  ) => Promise<void>;
  authRateLimitMax?: number;
  notifyAllRequests?: boolean;
  onBackgroundTask?: (promise: Promise<unknown>) => void;
}

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://us.i.posthog.com https://eu.i.posthog.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function applySecurityHeaders(headers: Headers): void {
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Content-Security-Policy', CSP_DIRECTIVES);
}

function getClientIp(c: AppContext): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'desconhecido'
  );
}

function parseCreatedAt(raw?: string): string {
  if (!raw || typeof raw !== 'string') return new Date().toISOString();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

function deriveTitle(title: string, description: string): string {
  const cleanTitle = (title || '').trim();
  if (cleanTitle) return cleanTitle;
  const firstLine = String(description || '').trim().split(/\r?\n/)[0] || 'Ordem de Serviço';
  if (firstLine.length <= 68) return firstLine;
  return `${firstLine.slice(0, 65).trimEnd()}...`;
}

function csvEscape(val: unknown): string {
  let str = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function formatDurationPt(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(rem).padStart(2, '0')}s`;
  return `${rem}s`;
}

function buildOperatorSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function readJsonBody(
  c: AppContext,
  maxBytes = 65_536
): Promise<{ ok: true; data: Record<string, any> } | { ok: false }> {
  try {
    const contentLength = Number(c.req.header('content-length') || 0);
    if (contentLength > maxBytes) return { ok: false };
    const raw = await c.req.text();
    if (raw.length > maxBytes) return { ok: false };
    if (!raw.trim()) return { ok: true, data: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, data: parsed as Record<string, any> };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export function createWorkerApp(options: WorkerAppOptions = {}) {
  const app = new Hono<{ Bindings: WorkerEnv; Variables: AppVars }>();

  const getDb = (c: AppContext) =>
    options.createDb ? options.createDb(c.env) : createSupabaseAdminClient(c.env);
  const getTelegram = (c: AppContext) =>
    options.createTelegram ? options.createTelegram(c.env) : createWorkerTelegramNotifier(c.env);
  const getEmail = (c: AppContext) =>
    options.createEmail ? options.createEmail(c.env) : createEmailNotifier(c.env);

  function scheduleBackground(c: AppContext, promise: Promise<unknown>): void {
    const safe = promise.catch(() => {});
    options.onBackgroundTask?.(safe);
    try {
      c.executionCtx.waitUntil(safe);
    } catch {
      // Sem ExecutionContext em testes unitários
    }
  }

  function notifySecurity(c: AppContext, type: string, detail = '', username = ''): void {
    const notifier = getTelegram(c);
    const url = new URL(c.req.url);
    const pathWithQuery = `${url.pathname}${url.search}`;
    scheduleBackground(
      c,
      notifier.notify({
        type,
        ip: getClientIp(c),
        method: c.req.method,
        path: pathWithQuery,
        userAgent: c.req.header('user-agent') || '',
        detail,
        username
      })
    );
  }

  function notifyCritical(c: AppContext, type: string, detail = '', username = ''): void {
    notifySecurity(c, type, detail, username);
    const email = getEmail(c);
    if (email.enabled) {
      const url = new URL(c.req.url);
      scheduleBackground(
        c,
        email.sendSecurityEmail({
          type,
          ip: getClientIp(c),
          path: `${url.pathname}${url.search}`,
          detail,
          username
        })
      );
    }
  }

  app.use('*', async (c, next) => {
    const reqUrl = new URL(c.req.url);
    const probe = matchBotProbe(reqUrl.pathname);
    if (probe.blocked) {
      notifySecurity(c, 'SENSITIVE_PROBE', probe.reason);
      const res = c.text('Not Found', 404);
      res.headers.set('Cache-Control', 'no-store');
      applySecurityHeaders(res.headers);
      return res;
    }

    const monitorAll =
      options.notifyAllRequests ?? String(c.env?.TELEGRAM_NOTIFY_ALL_REQUESTS || '') === 'true';
    if (
      monitorAll &&
      reqUrl.pathname !== '/api/health' &&
      reqUrl.pathname !== '/favicon.ico' &&
      !reqUrl.pathname.startsWith('/assets/')
    ) {
      notifySecurity(c, 'REQUEST_RECEIVED', 'Monitoramento completo ativo');
    }

    await next();
    applySecurityHeaders(c.res.headers);
  });

  app.use('/api/*', async (c, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      const secFetchSite = c.req.header('sec-fetch-site');
      if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
        notifyCritical(c, 'CSRF_BLOCKED', `Sec-Fetch-Site inválido: ${secFetchSite}`);
        return c.json({ error: 'Origem não autorizada' }, 403);
      }
      const host = c.req.header('host');
      if (!host) {
        notifyCritical(c, 'CSRF_BLOCKED', 'Host ausente');
        return c.json({ error: 'Host ausente' }, 403);
      }
      const source = c.req.header('origin') || c.req.header('referer');
      if (source) {
        try {
          const parsedUrl = new URL(source);
          if (parsedUrl.host !== host) {
            notifyCritical(c, 'CSRF_BLOCKED', `Origem externa: ${source}`);
            return c.json({ error: 'Origem não autorizada' }, 403);
          }
        } catch {
          notifyCritical(c, 'CSRF_BLOCKED', 'Header Origin/Referer inválido');
          return c.json({ error: 'Origem inválida' }, 403);
        }
      }
    }

    await next();
    c.res.headers.set('Cache-Control', 'no-store');
    c.res.headers.set('Pragma', 'no-cache');
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/auth/status', async (c) => {
    const db = getDb(c);
    const rawToken = parseSessionCookie(c.req.header('cookie'));
    const session = await resolveSession(db, rawToken);
    if (!session && rawToken) {
      c.header('Set-Cookie', buildClearSessionCookie(c.req.raw));
    }
    const totalUsers = await countUsers(db);
    return c.json({
      authenticated: Boolean(session),
      needsSetup: totalUsers === 0,
      user: session ? session.user : null
    });
  });

  app.post('/api/auth/setup', async (c) => {
    const db = getDb(c);
    const limit = await checkAuthRateLimit(db, `auth:${getClientIp(c)}`, {
      maxAttempts: options.authRateLimitMax ?? 10
    });
    if (!limit.allowed) {
      notifyCritical(c, 'RATE_LIMITED', 'Excesso de tentativas em autenticação (429)');
      return c.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, 429);
    }

    if ((await countUsers(db)) > 0) {
      notifyCritical(c, 'SETUP_BLOCKED', 'Setup inicial já bloqueado');
      return c.json({ error: 'Acesso inicial já configurado. Use a tela de login.' }, 403);
    }

    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = setupAuthSchema.safeParse(body.data);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    try {
      const user = await createUser(db, parsed.data);
      const session = await createSession(db, user.id, {
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') || ''
      });
      c.header('Set-Cookie', buildSessionSetCookie(session.token, c.req.raw));
      notifySecurity(c, 'AUTH_SUCCESS', 'Configuração inicial concluída', user.username);
      return c.json({ authenticated: true, user }, 201);
    } catch (err: any) {
      if (err?.code === '23505') {
        return c.json({ error: 'Usuário já cadastrado' }, 409);
      }
      throw err;
    }
  });

  app.post('/api/auth/login', async (c) => {
    const db = getDb(c);
    const limit = await checkAuthRateLimit(db, `auth:${getClientIp(c)}`, {
      maxAttempts: options.authRateLimitMax ?? 10
    });
    if (!limit.allowed) {
      notifyCritical(c, 'RATE_LIMITED', 'Excesso de tentativas em autenticação (429)');
      return c.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, 429);
    }

    if ((await countUsers(db)) === 0) {
      notifySecurity(c, 'LOGIN_FAILED', 'Tentativa de login antes do setup inicial');
      return c.json({ error: 'Configure o acesso inicial primeiro.' }, 403);
    }

    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = loginAuthSchema.safeParse(body.data);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Credenciais inválidas' }, 400);
    }

    const userRow = await findUserByUsername(db, parsed.data.username);
    const valid = await verifyPassword(parsed.data.password, userRow?.password_hash);
    if (!userRow || !userRow.active || !valid) {
      notifySecurity(c, 'LOGIN_FAILED', 'Usuário ou senha inválidos', parsed.data.username);
      return c.json({ error: 'Usuário ou senha inválidos' }, 401);
    }

    const session = await createSession(db, Number(userRow.id), {
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') || ''
    });
    c.header('Set-Cookie', buildSessionSetCookie(session.token, c.req.raw));
    notifySecurity(c, 'AUTH_SUCCESS', 'Login realizado', String(userRow.username));
    return c.json({ authenticated: true, user: mapUserRow(userRow) });
  });

  app.post('/api/auth/logout', async (c) => {
    const db = getDb(c);
    const rawToken = parseSessionCookie(c.req.header('cookie'));
    await revokeSessionByToken(db, rawToken);
    c.header('Set-Cookie', buildClearSessionCookie(c.req.raw));
    return c.json({ ok: true });
  });

  app.use('/api/*', async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    const method = c.req.method;
    const isPublicGet =
      (method === 'GET' || method === 'HEAD') &&
      (pathname === '/api/health' || pathname === '/api/auth/status');
    const isPublicPost =
      method === 'POST' &&
      (pathname === '/api/auth/setup' ||
        pathname === '/api/auth/login' ||
        pathname === '/api/auth/logout');
    if (isPublicGet || isPublicPost) {
      return next();
    }

    const db = getDb(c);
    const rawToken = parseSessionCookie(c.req.header('cookie'));
    const session = await resolveSession(db, rawToken);
    if (!session) {
      if (rawToken) {
        c.header('Set-Cookie', buildClearSessionCookie(c.req.raw));
      }
      notifySecurity(
        c,
        'UNAUTHORIZED_API',
        rawToken ? 'Sessão inválida ou expirada' : 'Requisição sem cookie de sessão'
      );
      return c.json({ error: 'Autenticação obrigatória' }, 401);
    }

    c.set('authUser', session.user);
    c.set('sessionTokenHash', session.tokenHash);
    return next();
  });

  app.get('/api/auth/me', (c) => {
    return c.json({ authenticated: true, user: c.get('authUser') });
  });

  app.post('/api/auth/change-password', async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = changePasswordSchema.safeParse(body.data);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const db = getDb(c);
    const authUser = c.get('authUser');
    const userRow = await findUserById(db, authUser.id);
    if (!userRow || !(await verifyPassword(parsed.data.currentPassword, userRow.password_hash))) {
      return c.json({ error: 'Senha atual incorreta' }, 401);
    }
    if (parsed.data.newPassword === parsed.data.currentPassword) {
      return c.json({ error: 'A nova senha deve ser diferente da senha atual' }, 400);
    }

    await updateUserPassword(db, authUser.id, parsed.data.newPassword);
    await revokeUserSessions(db, authUser.id, c.get('sessionTokenHash'));
    notifySecurity(c, 'AUTH_SUCCESS', 'Senha alterada (outras sessões encerradas)', authUser.username);
    return c.json({ ok: true });
  });

  app.get('/api/state', async (c) => {
    const db = getDb(c);
    const state = await buildAppState(db);
    return c.json(state);
  });

  app.get('/api/events', (c) => {
    return c.json({ mode: 'polling', intervalMs: 4000 }, 501);
  });

  app.post('/api/orders', async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = createOrderSchema.safeParse(body.data);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const db = getDb(c);
    const input = parsed.data;
    const nowIso = new Date().toISOString();
    const createdAtIso = parseCreatedAt(input.createdAt);
    const code = await getNextOrderCode(db);
    const title = deriveTitle(input.title, input.description);

    let operator: Record<string, any> | null = null;
    if (input.startImmediately && input.operatorId) {
      const opRes = await db.from('operators').select('*').eq('id', input.operatorId).maybeSingle();
      operator = opRes.data;
    }

    const status = input.startImmediately ? 'in_progress' : 'queued';
    const startedAt = input.startImmediately ? nowIso : null;
    const actorName = input.createdBy?.trim() || (operator ? String(operator.name) : 'SAC');

    await db
      .from('units')
      .upsert({ name: input.unit, created_at: nowIso }, { onConflict: 'name', ignoreDuplicates: true });

    const insertOrderRes = await db
      .from('work_orders')
      .insert({
        code,
        unit: input.unit,
        sector: input.sector || '',
        title,
        description: input.description,
        urgent: Boolean(input.urgent),
        status,
        created_at: createdAtIso,
        started_at: startedAt,
        elapsed_seconds: 0,
        created_by: actorName,
        assigned_operator_id: operator ? String(operator.id) : null,
        assigned_operator_name: operator
          ? String(operator.name)
          : input.startImmediately
            ? 'SAC'
            : null,
        assigned_station: operator
          ? String(operator.station)
          : input.startImmediately
            ? 'SAC • Controle Geral'
            : null,
        operator_notes: ''
      })
      .select('*')
      .single();

    if (insertOrderRes.error || !insertOrderRes.data) {
      throw new Error(insertOrderRes.error?.message || 'Erro ao criar O.S');
    }

    const order = mapOrderRow(insertOrderRes.data);
    const alertType = input.urgent ? 'urgent_dispatch' : 'new_dispatch';
    await db.from('alerts').insert({
      order_id: order.id,
      order_code: code,
      type: alertType,
      message: `${title} • ${input.unit}`,
      actor: actorName,
      created_at: nowIso,
      acknowledged: false
    });

    if (order.urgent) {
      const email = getEmail(c);
      if (email.enabled) {
        scheduleBackground(c, email.sendUrgentOrderEmail(order));
      }
    }

    const state = await buildAppState(db);
    return c.json({ order, state }, 201);
  });

  app.post('/api/orders/:id/claim', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = claimOrderSchema.safeParse(body.data);
    if (!Number.isFinite(id) || !parsed.success) {
      return c.json({ error: 'Parâmetros inválidos para assumir O.S' }, 400);
    }

    const db = getDb(c);
    const { data: orderRow } = await db.from('work_orders').select('*').eq('id', id).maybeSingle();
    if (!orderRow) return c.json({ error: 'O.S não encontrada' }, 404);
    if (orderRow.status === 'completed') {
      return c.json({ error: 'Esta O.S já foi finalizada' }, 409);
    }

    let operator: Record<string, any> | null = null;
    if (parsed.data.operatorId) {
      const opRes = await db
        .from('operators')
        .select('*')
        .eq('id', parsed.data.operatorId)
        .maybeSingle();
      operator = opRes.data;
    }

    const nowIso = new Date().toISOString();
    const baseElapsed = computeElapsedSeconds(orderRow);
    const opName = operator?.name ? String(operator.name) : 'SAC';
    const opStation = operator?.station ? String(operator.station) : 'SAC • Controle Geral';

    const updRes = await db
      .from('work_orders')
      .update({
        status: 'in_progress',
        started_at: nowIso,
        paused_at: null,
        pause_reason: null,
        elapsed_seconds: baseElapsed,
        assigned_operator_id: operator ? String(operator.id) : null,
        assigned_operator_name: opName,
        assigned_station: opStation
      })
      .eq('id', id)
      .select('*')
      .single();

    await db.from('alerts').insert({
      order_id: id,
      order_code: orderRow.code,
      type: 'claimed',
      message: opStation ? `${orderRow.title} assumida em ${opStation}` : `${orderRow.title} em atendimento`,
      actor: opName,
      created_at: nowIso,
      acknowledged: false
    });

    const order = mapOrderRow(updRes.data || orderRow);
    const state = await buildAppState(db);
    return c.json({ order, state });
  });

  app.post('/api/orders/:id/pause', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = pauseOrderSchema.safeParse(body.data);
    if (!Number.isFinite(id) || !parsed.success) {
      return c.json(
        { error: parsed.error?.issues[0]?.message || 'Motivo da pausa obrigatório' },
        400
      );
    }

    const db = getDb(c);
    const { data: orderRow } = await db.from('work_orders').select('*').eq('id', id).maybeSingle();
    if (!orderRow) return c.json({ error: 'O.S não encontrada' }, 404);
    if (orderRow.status !== 'in_progress') {
      return c.json({ error: 'Somente O.S em atendimento pode ser pausada' }, 409);
    }

    const nowIso = new Date().toISOString();
    const elapsed = computeElapsedSeconds(orderRow);
    const updRes = await db
      .from('work_orders')
      .update({
        status: 'paused',
        started_at: null,
        paused_at: nowIso,
        pause_reason: parsed.data.reason,
        elapsed_seconds: elapsed
      })
      .eq('id', id)
      .select('*')
      .single();

    await db.from('alerts').insert({
      order_id: id,
      order_code: orderRow.code,
      type: 'paused',
      message: `O.S pausada: ${parsed.data.reason}`,
      actor: orderRow.assigned_operator_name || 'Operador',
      created_at: nowIso,
      acknowledged: false
    });

    const order = mapOrderRow(updRes.data || orderRow);
    const state = await buildAppState(db);
    return c.json({ order, state });
  });

  app.post('/api/orders/:id/resume', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ error: 'ID inválido' }, 400);

    const db = getDb(c);
    const { data: orderRow } = await db.from('work_orders').select('*').eq('id', id).maybeSingle();
    if (!orderRow) return c.json({ error: 'O.S não encontrada' }, 404);
    if (orderRow.status !== 'paused') {
      return c.json({ error: 'Esta O.S não está pausada' }, 409);
    }

    const nowIso = new Date().toISOString();
    const updRes = await db
      .from('work_orders')
      .update({
        status: 'in_progress',
        started_at: nowIso,
        paused_at: null,
        pause_reason: null
      })
      .eq('id', id)
      .select('*')
      .single();

    const order = mapOrderRow(updRes.data || orderRow);
    const state = await buildAppState(db);
    return c.json({ order, state });
  });

  app.post('/api/orders/:id/release', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ error: 'ID inválido' }, 400);

    const db = getDb(c);
    const { data: orderRow } = await db.from('work_orders').select('*').eq('id', id).maybeSingle();
    if (!orderRow) return c.json({ error: 'O.S não encontrada' }, 404);
    if (orderRow.status === 'completed') {
      return c.json({ error: 'Use reabrir para voltar uma O.S finalizada para a fila' }, 409);
    }

    const elapsed = computeElapsedSeconds(orderRow);
    const updRes = await db
      .from('work_orders')
      .update({
        status: 'queued',
        started_at: null,
        paused_at: null,
        pause_reason: null,
        elapsed_seconds: elapsed,
        assigned_operator_id: null,
        assigned_operator_name: null,
        assigned_station: null
      })
      .eq('id', id)
      .select('*')
      .single();

    const order = mapOrderRow(updRes.data || orderRow);
    const state = await buildAppState(db);
    return c.json({ order, state });
  });

  app.patch('/api/orders/:id/notes', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = notesSchema.safeParse(body.data);
    if (!Number.isFinite(id) || !parsed.success) {
      return c.json({ error: 'Observação inválida' }, 400);
    }

    const db = getDb(c);
    const { data: orderRow } = await db.from('work_orders').select('*').eq('id', id).maybeSingle();
    if (!orderRow) return c.json({ error: 'O.S não encontrada' }, 404);

    const updRes = await db
      .from('work_orders')
      .update({ operator_notes: parsed.data.notes })
      .eq('id', id)
      .select('*')
      .single();

    const order = mapOrderRow(updRes.data || orderRow);
    const state = await buildAppState(db);
    return c.json({ order, state });
  });

  app.post('/api/orders/:id/complete', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = completeOrderSchema.safeParse(body.data);
    if (!Number.isFinite(id) || !parsed.success) {
      return c.json({ error: 'Dados inválidos ao finalizar O.S' }, 400);
    }

    const db = getDb(c);
    const { data: orderRow } = await db.from('work_orders').select('*').eq('id', id).maybeSingle();
    if (!orderRow) return c.json({ error: 'O.S não encontrada' }, 404);
    if (orderRow.status === 'completed') {
      return c.json({ error: 'Esta O.S já está finalizada' }, 409);
    }

    const nowIso = new Date().toISOString();
    const totalElapsed = Math.max(60, computeElapsedSeconds(orderRow));
    const notes = parsed.data.notes !== undefined ? parsed.data.notes : orderRow.operator_notes;

    let opId: string | null = orderRow.assigned_operator_id ?? null;
    let opName: string | null = orderRow.assigned_operator_name ?? null;
    let opStation: string | null = orderRow.assigned_station ?? null;

    if (parsed.data.operatorId) {
      const { data: op } = await db
        .from('operators')
        .select('*')
        .eq('id', parsed.data.operatorId)
        .maybeSingle();
      if (op) {
        opId = String(op.id);
        opName = String(op.name);
        opStation = String(op.station);
      }
    }

    const explicitFinisher = parsed.data.completedBy?.trim();
    if (explicitFinisher) {
      const { data: allOps } = await db.from('operators').select('*');
      const matched = (allOps || []).find(
        (r) => String(r.name || '').toLowerCase() === explicitFinisher.toLowerCase()
      );
      if (matched) {
        opId = String(matched.id);
        opName = String(matched.name);
        opStation = String(matched.station);
      } else {
        const slug = buildOperatorSlug(explicitFinisher);
        const newOpId = `op-${slug || 'tech'}-${Date.now().toString(36).slice(-4)}`;
        await db.from('operators').insert({
          id: newOpId,
          name: explicitFinisher,
          badge: '',
          station: 'Equipe Técnica',
          shift: 'TURNO B • POSTO ATIVO',
          shift_goal: 6
        });
        opId = newOpId;
        opName = explicitFinisher;
      }
    }

    const finisherName = explicitFinisher || opName || 'Operador';

    const updRes = await db
      .from('work_orders')
      .update({
        status: 'completed',
        completed_at: nowIso,
        paused_at: null,
        pause_reason: null,
        elapsed_seconds: totalElapsed,
        operator_notes: notes || '',
        completed_by: finisherName,
        assigned_operator_id: opId,
        assigned_operator_name: opName || finisherName,
        assigned_station: opStation
      })
      .eq('id', id)
      .select('*')
      .single();

    await db.from('alerts').insert({
      order_id: id,
      order_code: orderRow.code,
      type: 'completed',
      message: `Baixa realizada: ${orderRow.title}`,
      actor: finisherName,
      created_at: nowIso,
      acknowledged: false
    });

    const order = mapOrderRow(updRes.data || orderRow);
    const state = await buildAppState(db);
    return c.json({ order, state });
  });

  app.post('/api/orders/:id/reopen', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ error: 'ID inválido' }, 400);

    const db = getDb(c);
    const { data: orderRow } = await db.from('work_orders').select('*').eq('id', id).maybeSingle();
    if (!orderRow) return c.json({ error: 'O.S não encontrada' }, 404);

    const nowIso = new Date().toISOString();
    const updRes = await db
      .from('work_orders')
      .update({
        status: 'queued',
        started_at: null,
        paused_at: null,
        pause_reason: null,
        completed_at: null,
        assigned_operator_id: null,
        assigned_operator_name: null,
        assigned_station: null
      })
      .eq('id', id)
      .select('*')
      .single();

    await db.from('alerts').insert({
      order_id: id,
      order_code: orderRow.code,
      type: 'reopened',
      message: `O.S reaberta para fila: ${orderRow.title}`,
      actor: 'Supervisor',
      created_at: nowIso,
      acknowledged: false
    });

    const order = mapOrderRow(updRes.data || orderRow);
    const state = await buildAppState(db);
    return c.json({ order, state });
  });

  app.delete('/api/orders/:id', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ error: 'ID inválido' }, 400);

    const db = getDb(c);
    const { data: existing } = await db.from('work_orders').select('id').eq('id', id).maybeSingle();
    if (!existing) return c.json({ error: 'O.S não encontrada' }, 404);

    await db.from('alerts').delete().eq('order_id', id);
    await db.from('work_orders').delete().eq('id', id);
    const state = await buildAppState(db);
    return c.json({ deletedId: id, state });
  });

  app.post('/api/operators', async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = createOperatorSchema.safeParse(body.data);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const db = getDb(c);
    const { name, badge, station, shift, shiftGoal } = parsed.data;
    const { data: allOps } = await db.from('operators').select('*');
    const existingByName = (allOps || []).find(
      (r) => String(r.name || '').toLowerCase() === name.toLowerCase()
    );
    if (existingByName) {
      return c.json({ operator: mapOperatorRow(existingByName), state: await buildAppState(db) });
    }

    const slug = buildOperatorSlug(name);
    const id = `op-${slug || 'tech'}-${Date.now().toString(36).slice(-4)}`;

    const { data: inserted } = await db
      .from('operators')
      .insert({
        id,
        name,
        badge,
        station: station || 'Equipe Técnica',
        shift,
        shift_goal: shiftGoal
      })
      .select('*')
      .single();

    const operator = mapOperatorRow(inserted || { id, name, badge, station, shift, shift_goal: shiftGoal });
    const state = await buildAppState(db);
    return c.json({ operator, state }, 201);
  });

  app.patch('/api/operators/:id', async (c) => {
    const id = c.req.param('id');
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = updateOperatorSchema.safeParse(body.data);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const db = getDb(c);
    const { data: existing } = await db.from('operators').select('*').eq('id', id).maybeSingle();
    if (!existing) return c.json({ error: 'Pessoa não encontrada' }, 404);

    const { name } = parsed.data;
    const { data: allOps } = await db.from('operators').select('id, name');
    const duplicate = (allOps || []).find(
      (r) => String(r.id) !== id && String(r.name || '').toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      return c.json({ error: 'Já existe uma pessoa com este nome' }, 409);
    }

    const nextBadge = parsed.data.badge !== undefined ? parsed.data.badge : existing.badge;
    const nextStation =
      parsed.data.station !== undefined && parsed.data.station !== ''
        ? parsed.data.station
        : parsed.data.station === ''
          ? 'Equipe Técnica'
          : existing.station;

    const { data: updated } = await db
      .from('operators')
      .update({ name, badge: nextBadge, station: nextStation })
      .eq('id', id)
      .select('*')
      .single();

    await db
      .from('work_orders')
      .update({ assigned_operator_name: name, assigned_station: nextStation })
      .eq('assigned_operator_id', id);

    await db.from('work_orders').update({ completed_by: name }).eq('completed_by', existing.name);

    const operator = mapOperatorRow(updated || { ...existing, name, badge: nextBadge, station: nextStation });
    const state = await buildAppState(db);
    return c.json({ operator, state });
  });

  app.delete('/api/operators/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb(c);
    const { data: existing } = await db.from('operators').select('id').eq('id', id).maybeSingle();
    if (!existing) return c.json({ error: 'Operador não encontrado' }, 404);

    await db.from('operators').delete().eq('id', id);
    const state = await buildAppState(db);
    return c.json({ deletedId: id, state });
  });

  app.post('/api/units', async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = createUnitSchema.safeParse(body.data);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Unidade inválida' }, 400);
    }

    const db = getDb(c);
    const { name } = parsed.data;
    const { data: allUnits } = await db.from('units').select('*');
    const existing = (allUnits || []).find(
      (r) => String(r.name || '').toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      return c.json({ unit: mapUnitRow(existing), state: await buildAppState(db) });
    }

    const nowIso = new Date().toISOString();
    const { data: inserted } = await db
      .from('units')
      .insert({ name, created_at: nowIso })
      .select('*')
      .single();

    const unit = mapUnitRow(inserted || { id: 0, name, created_at: nowIso });
    const state = await buildAppState(db);
    return c.json({ unit, state }, 201);
  });

  app.patch('/api/units/:id', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = updateUnitSchema.safeParse(body.data);
    if (!Number.isFinite(id) || !parsed.success) {
      return c.json({ error: parsed.error?.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const db = getDb(c);
    const { data: existing } = await db.from('units').select('*').eq('id', id).maybeSingle();
    if (!existing) return c.json({ error: 'Escola / unidade não encontrada' }, 404);

    const { name } = parsed.data;
    const { data: allUnits } = await db.from('units').select('id, name');
    const duplicate = (allUnits || []).find(
      (r) => Number(r.id) !== id && String(r.name || '').toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      return c.json({ error: 'Já existe uma escola/unidade com este nome' }, 409);
    }

    const { data: updated } = await db
      .from('units')
      .update({ name })
      .eq('id', id)
      .select('*')
      .single();

    await db.from('work_orders').update({ unit: name }).eq('unit', existing.name);

    const unit = mapUnitRow(updated || { ...existing, name });
    const state = await buildAppState(db);
    return c.json({ unit, state });
  });

  app.delete('/api/units/:id', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ error: 'ID inválido' }, 400);

    const db = getDb(c);
    const { data: existing } = await db.from('units').select('id').eq('id', id).maybeSingle();
    if (!existing) return c.json({ error: 'Unidade não encontrada' }, 404);

    await db.from('units').delete().eq('id', id);
    const state = await buildAppState(db);
    return c.json({ deletedId: id, state });
  });

  app.patch('/api/alerts/:id/ack', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ error: 'ID inválido' }, 400);

    const db = getDb(c);
    await db.from('alerts').update({ acknowledged: true }).eq('id', id);
    const state = await buildAppState(db);
    return c.json({ ok: true, state });
  });

  app.post('/api/alerts/ack-all', async (c) => {
    const db = getDb(c);
    await db.from('alerts').update({ acknowledged: true }).eq('acknowledged', false);
    const state = await buildAppState(db);
    return c.json({ ok: true, state });
  });

  app.post('/api/notices', async (c) => {
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = noticeCreateSchema.safeParse(body.data);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Aviso inválido' }, 400);
    }

    const db = getDb(c);
    const { label, text, author } = parsed.data;
    const nowIso = new Date().toISOString();
    const { data: inserted } = await db
      .from('notices')
      .insert({ label: label.toUpperCase(), text, author, created_at: nowIso })
      .select('*')
      .single();

    const notice = mapNoticeRow(
      inserted || { id: 0, label: label.toUpperCase(), text, author, created_at: nowIso }
    );
    const state = await buildAppState(db);
    return c.json({ notice, state }, 201);
  });

  app.patch('/api/notices/:id', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    const body = await readJsonBody(c);
    if (!body.ok) return c.json({ error: 'JSON inválido' }, 400);

    const parsed = noticeUpdateSchema.safeParse(body.data);
    if (!Number.isFinite(id) || !parsed.success) {
      return c.json({ error: parsed.error?.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const db = getDb(c);
    const { data: existing } = await db.from('notices').select('*').eq('id', id).maybeSingle();
    if (!existing) return c.json({ error: 'Aviso não encontrado' }, 404);

    const nextLabel = (parsed.data.label || existing.label || 'NÃO INICIADO').toUpperCase();
    const { data: updated } = await db
      .from('notices')
      .update({ label: nextLabel, text: parsed.data.text })
      .eq('id', id)
      .select('*')
      .single();

    const notice = mapNoticeRow(updated || { ...existing, label: nextLabel, text: parsed.data.text });
    const state = await buildAppState(db);
    return c.json({ notice, state });
  });

  app.delete('/api/notices/:id', async (c) => {
    const id = Number.parseInt(c.req.param('id'), 10);
    if (!Number.isFinite(id)) return c.json({ error: 'ID inválido' }, 400);

    const db = getDb(c);
    const { data: existing } = await db.from('notices').select('id').eq('id', id).maybeSingle();
    if (!existing) return c.json({ error: 'Aviso não encontrado' }, 404);

    await db.from('notices').delete().eq('id', id);
    const state = await buildAppState(db);
    return c.json({ deletedId: id, state });
  });

  app.get('/api/orders/export.csv', async (c) => {
    const status = String(c.req.query('status') || 'completed');
    const urgentParam = String(c.req.query('urgent') || 'all');
    const operatorId = String(c.req.query('operatorId') || 'all');
    const query = String(c.req.query('q') || '').trim().toLowerCase();

    const db = getDb(c);
    const state = await buildAppState(db);
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
    ]
      .map(csvEscape)
      .join(';');

    const lines = filtered.map((o) =>
      [
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
      ]
        .map(csvEscape)
        .join(';')
    );

    const csv = `\uFEFF${[header, ...lines].join('\r\n')}`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="os-flow-relatorio.csv"'
      }
    });
  });

  app.all('/api/*', (c) => {
    return c.json({ error: 'Endpoint não encontrado' }, 404);
  });

  app.all('*', async (c) => {
    const reqPath = new URL(c.req.url).pathname;

    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      c.header('Cache-Control', 'no-store');
      return c.text('Not Found', 404);
    }

    if (isAllowedFrontendPath(reqPath)) {
      if (c.env?.ASSETS) {
        const indexUrl = new URL('/index.html', c.req.url);
        const indexReq = new Request(indexUrl.toString(), { headers: c.req.raw.headers });
        const assetRes = await c.env.ASSETS.fetch(indexReq);
        const htmlRes = new Response(assetRes.body, assetRes);
        applySecurityHeaders(htmlRes.headers);
        return htmlRes;
      }
      return c.text('Not Found', 404);
    }

    if (c.env?.ASSETS && (reqPath.startsWith('/assets/') || reqPath === '/favicon.ico')) {
      const assetRes = await c.env.ASSETS.fetch(c.req.raw);
      if (assetRes.status !== 404) {
        const proxied = new Response(assetRes.body, assetRes);
        applySecurityHeaders(proxied.headers);
        return proxied;
      }
    }

    if (reqPath !== '/favicon.ico') {
      notifySecurity(c, 'SENSITIVE_PROBE', 'Arquivo ou caminho restrito inexistente (404)');
    }
    c.header('Cache-Control', 'no-store');
    return c.text('Not Found', 404);
  });

  app.onError((err, c) => {
    const reqPath = new URL(c.req.url).pathname;
    const capture = options.captureError ?? captureWorkerException;
    scheduleBackground(
      c,
      capture(err, c.env, { method: c.req.method, path: reqPath, status: 500 })
    );
    notifySecurity(c, 'INTERNAL_ERROR', 'Exceção capturada no Worker');

    if (reqPath.startsWith('/api')) {
      return c.json({ error: 'Erro interno do servidor' }, 500);
    }
    return c.text('Internal Server Error', 500);
  });

  return app;
}

const workerApp = createWorkerApp();

export default {
  fetch: (request: Request, env: WorkerEnv, ctx: ExecutionContext) =>
    workerApp.fetch(request, env, ctx)
};
