import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SESSION_TTL_MS,
  generateSessionToken,
  hashPassword,
  hashSessionToken
} from './auth';
import type {
  AppState,
  AuthUser,
  CustomNotice,
  DispatchAlert,
  Operator,
  OrderStatus,
  UnitItem,
  WorkOrder,
  WorkerEnv
} from './types';

const STATUS_SORT_WEIGHT: Record<OrderStatus, number> = {
  in_progress: 0,
  paused: 1,
  queued: 2,
  completed: 3
};

export function createSupabaseAdminClient(env: Partial<WorkerEnv>): SupabaseClient {
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

function assertOk<T>(result: { data: T; error: { message?: string; code?: string } | null }, context: string): T {
  if (result.error) {
    const err = new Error(`${context}: ${result.error.message || 'Erro Supabase'}`) as Error & { code?: string };
    err.code = result.error.code;
    throw err;
  }
  return result.data;
}

export function mapOrderRow(row: Record<string, any>): WorkOrder {
  const completedByRaw = row.completed_by ?? row.assigned_operator_name ?? null;
  return {
    id: Number(row.id),
    code: String(row.code),
    unit: String(row.unit),
    sector: String(row.sector ?? ''),
    title: String(row.title),
    description: String(row.description),
    urgent: Boolean(row.urgent),
    status: row.status as OrderStatus,
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    pausedAt: row.paused_at ? String(row.paused_at) : null,
    pauseReason: row.pause_reason ? String(row.pause_reason) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    elapsedSeconds: Number(row.elapsed_seconds ?? 0),
    createdBy: String(row.created_by ?? 'SAC'),
    assignedOperatorId: row.assigned_operator_id ? String(row.assigned_operator_id) : null,
    assignedOperatorName: row.assigned_operator_name ? String(row.assigned_operator_name) : null,
    assignedStation: row.assigned_station ? String(row.assigned_station) : null,
    completedBy: completedByRaw ? String(completedByRaw) : null,
    operatorNotes: String(row.operator_notes ?? '')
  };
}

export function mapOperatorRow(row: Record<string, any>): Operator {
  return {
    id: String(row.id),
    name: String(row.name),
    badge: String(row.badge ?? ''),
    station: String(row.station ?? 'Equipe Técnica'),
    shift: String(row.shift ?? 'TURNO B • POSTO ATIVO'),
    shiftGoal: Number(row.shift_goal ?? 6)
  };
}

export function mapAlertRow(row: Record<string, any>): DispatchAlert {
  return {
    id: Number(row.id),
    orderId: row.order_id !== null && row.order_id !== undefined ? Number(row.order_id) : null,
    orderCode: String(row.order_code),
    type: String(row.type),
    message: String(row.message),
    actor: String(row.actor),
    createdAt: String(row.created_at),
    acknowledged: Boolean(row.acknowledged)
  };
}

export function mapNoticeRow(row: Record<string, any>): CustomNotice {
  return {
    id: Number(row.id),
    label: String(row.label || 'NÃO INICIADO'),
    text: String(row.text),
    author: String(row.author || 'SAC'),
    createdAt: String(row.created_at)
  };
}

export function mapUnitRow(row: Record<string, any>): UnitItem {
  return {
    id: Number(row.id),
    name: String(row.name),
    createdAt: String(row.created_at)
  };
}

export function mapUserRow(row: Record<string, any> | null | undefined): AuthUser | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: String(row.role)
  };
}

export function computeElapsedSeconds(orderRow: Record<string, any>, nowMs = Date.now()): number {
  const base = Number(orderRow.elapsed_seconds ?? 0);
  if (orderRow.status === 'in_progress' && orderRow.started_at) {
    const startMs = Date.parse(String(orderRow.started_at));
    if (Number.isFinite(startMs)) {
      const delta = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      return base + delta;
    }
  }
  return base;
}

export function nextOrderCodeFromRows(rows: Array<{ code?: string }>): string {
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

export async function getNextOrderCode(client: SupabaseClient): Promise<string> {
  const res = await client.from('work_orders').select('code');
  const rows = assertOk(res, 'Erro ao consultar códigos de O.S') || [];
  return nextOrderCodeFromRows(rows);
}

function getCuiabaTodayStartMs(now: Date): number {
  try {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Cuiaba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    const parsed = Date.parse(`${ymd}T00:00:00-04:00`);
    if (Number.isFinite(parsed)) return parsed;
  } catch {
    // fallback abaixo
  }
  const copy = new Date(now);
  copy.setUTCHours(4, 0, 0, 0);
  return copy.getTime();
}

export async function buildAppState(client: SupabaseClient): Promise<AppState> {
  const now = new Date();
  const nowMs = now.getTime();
  const todayStartMs = getCuiabaTodayStartMs(now);

  const [ordersRes, operatorsRes, unitsRes, alertsRes, noticesRes, settingsRes] = await Promise.all([
    client.from('work_orders').select('*'),
    client.from('operators').select('*').order('name', { ascending: true }),
    client.from('units').select('*').order('name', { ascending: true }),
    client.from('alerts').select('*').order('id', { ascending: false }).limit(30),
    client.from('notices').select('*').order('id', { ascending: false }),
    client.from('settings').select('key, value')
  ]);

  const orderRows = assertOk(ordersRes, 'Erro ao carregar work_orders') || [];
  const orders = orderRows.map(mapOrderRow).sort((a, b) => {
    const wA = STATUS_SORT_WEIGHT[a.status] ?? 9;
    const wB = STATUS_SORT_WEIGHT[b.status] ?? 9;
    if (wA !== wB) return wA - wB;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const tA = Date.parse(a.createdAt) || 0;
    const tB = Date.parse(b.createdAt) || 0;
    if (tA !== tB) return tA - tB;
    return b.id - a.id;
  });

  const operators = (assertOk(operatorsRes, 'Erro ao carregar operators') || []).map(mapOperatorRow);
  const units = (assertOk(unitsRes, 'Erro ao carregar units') || []).map(mapUnitRow);
  const alerts = (assertOk(alertsRes, 'Erro ao carregar alerts') || []).map(mapAlertRow);
  const notices = (assertOk(noticesRes, 'Erro ao carregar notices') || []).map(mapNoticeRow);

  const settings: Record<string, string> = {};
  for (const s of assertOk(settingsRes, 'Erro ao carregar settings') || []) {
    settings[String(s.key)] = String(s.value);
  }

  const queued = orders.filter((o) => o.status === 'queued');
  const urgentQueued = queued.filter((o) => o.urgent);
  const inProgress = orders.filter((o) => o.status === 'in_progress' || o.status === 'paused');
  const completedToday = orders.filter((o) => {
    if (o.status !== 'completed' || !o.completedAt) return false;
    const ms = Date.parse(o.completedAt);
    return Number.isFinite(ms) && ms >= todayStartMs;
  });

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

  const completedTodayWithinSla = completedToday.filter((o) => o.elapsedSeconds <= 5400).length;
  const slaRate =
    completedToday.length > 0
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
    nextCode: nextOrderCodeFromRows(orderRows),
    serverTime: now.toISOString()
  };
}

export async function countUsers(client: SupabaseClient): Promise<number> {
  const { count, error } = await client.from('users').select('*', { count: 'exact', head: true });
  if (error) throw new Error(`Erro ao contar usuários: ${error.message}`);
  return Number(count ?? 0);
}

export async function findUserByUsername(
  client: SupabaseClient,
  username: string
): Promise<Record<string, any> | null> {
  const clean = String(username || '').trim().toLowerCase();
  if (!clean) return null;
  const res = await client.from('users').select('*').eq('username', clean).maybeSingle();
  return assertOk(res, 'Erro ao buscar usuário');
}

export async function findUserById(
  client: SupabaseClient,
  userId: number
): Promise<Record<string, any> | null> {
  const res = await client.from('users').select('*').eq('id', userId).maybeSingle();
  return assertOk(res, 'Erro ao buscar usuário por ID');
}

export async function createUser(
  client: SupabaseClient,
  { username, displayName, role = 'sac', password }: {
    username: string;
    displayName?: string;
    role?: string;
    password: string;
  }
): Promise<AuthUser> {
  const nowIso = new Date().toISOString();
  const cleanUser = String(username).trim().toLowerCase();
  const cleanDisplay = String(displayName || 'SAC • Controle Geral').trim();
  const passwordHash = await hashPassword(password);

  const res = await client
    .from('users')
    .insert({
      username: cleanUser,
      display_name: cleanDisplay,
      role,
      password_hash: passwordHash,
      active: true,
      created_at: nowIso,
      updated_at: nowIso
    })
    .select('*')
    .single();

  const created = assertOk(res, 'Erro ao criar usuário');
  const mapped = mapUserRow(created);
  if (!mapped) throw new Error('Usuário criado não retornado');
  return mapped;
}

export async function updateUserPassword(
  client: SupabaseClient,
  userId: number,
  newPassword: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const passwordHash = await hashPassword(newPassword);
  const res = await client
    .from('users')
    .update({ password_hash: passwordHash, updated_at: nowIso })
    .eq('id', userId);
  assertOk(res, 'Erro ao atualizar senha');
}

export async function purgeExpiredSessions(client: SupabaseClient): Promise<void> {
  const nowIso = new Date().toISOString();
  await client.from('sessions').delete().lte('expires_at', nowIso);
}

export async function createSession(
  client: SupabaseClient,
  userId: number,
  { ip = '', userAgent = '' }: { ip?: string; userAgent?: string } = {}
): Promise<{ token: string; tokenHash: string; expiresAt: string }> {
  await purgeExpiredSessions(client);
  const rawToken = generateSessionToken();
  const tokenHash = await hashSessionToken(rawToken);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SESSION_TTL_MS).toISOString();

  const res = await client.from('sessions').insert({
    token_hash: tokenHash,
    user_id: userId,
    created_at: nowIso,
    expires_at: expiresAt,
    last_seen_at: nowIso,
    ip: String(ip || '').slice(0, 120),
    user_agent: String(userAgent || '').slice(0, 240)
  });
  assertOk(res, 'Erro ao criar sessão');
  return { token: rawToken, tokenHash, expiresAt };
}

export async function resolveSession(
  client: SupabaseClient,
  rawToken: string | null | undefined
): Promise<{ tokenHash: string; user: AuthUser } | null> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 20) {
    return null;
  }
  const tokenHash = await hashSessionToken(rawToken);
  const nowIso = new Date().toISOString();

  const sessionRes = await client
    .from('sessions')
    .select('token_hash, user_id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  const sessionRow = assertOk(sessionRes, 'Erro ao validar sessão');
  if (!sessionRow) return null;

  const expiresMs = Date.parse(String(sessionRow.expires_at));
  const nowMs = Date.now();
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    await client.from('sessions').delete().eq('token_hash', tokenHash);
    return null;
  }

  const userRow = await findUserById(client, Number(sessionRow.user_id));
  if (!userRow || !userRow.active) {
    await client.from('sessions').delete().eq('token_hash', tokenHash);
    return null;
  }

  await client.from('sessions').update({ last_seen_at: nowIso }).eq('token_hash', tokenHash);
  const user = mapUserRow(userRow);
  return user ? { tokenHash, user } : null;
}

export async function revokeSessionByToken(
  client: SupabaseClient,
  rawToken: string | null | undefined
): Promise<string | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = await hashSessionToken(rawToken);
  await client.from('sessions').delete().eq('token_hash', tokenHash);
  return tokenHash;
}

export async function revokeUserSessions(
  client: SupabaseClient,
  userId: number,
  exceptTokenHash: string | null = null
): Promise<void> {
  let query = client.from('sessions').delete().eq('user_id', userId);
  if (exceptTokenHash) {
    query = query.neq('token_hash', exceptTokenHash);
  }
  const res = await query;
  assertOk(res, 'Erro ao revogar sessões');
}

export async function checkAuthRateLimit(
  client: SupabaseClient,
  rateKey: string,
  { windowMs = 15 * 60 * 1000, maxAttempts = 10 } = {}
): Promise<{ allowed: boolean; remaining: number }> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const res = await client
    .from('auth_rate_limits')
    .select('rate_key, attempts, window_start')
    .eq('rate_key', rateKey)
    .maybeSingle();
  const row = assertOk(res, 'Erro ao consultar limite de tentativas');

  if (!row || nowMs - Date.parse(String(row.window_start)) >= windowMs) {
    const upsertRes = await client.from('auth_rate_limits').upsert(
      {
        rate_key: rateKey,
        attempts: 1,
        window_start: nowIso
      },
      { onConflict: 'rate_key' }
    );
    assertOk(upsertRes, 'Erro ao registrar janela de rate limit');
    return { allowed: true, remaining: Math.max(0, maxAttempts - 1) };
  }

  const currentAttempts = Number(row.attempts ?? 0);
  if (currentAttempts >= maxAttempts) {
    return { allowed: false, remaining: 0 };
  }

  const nextAttempts = currentAttempts + 1;
  const updRes = await client
    .from('auth_rate_limits')
    .update({ attempts: nextAttempts })
    .eq('rate_key', rateKey);
  assertOk(updRes, 'Erro ao incrementar rate limit');

  return { allowed: true, remaining: Math.max(0, maxAttempts - nextAttempts) };
}
