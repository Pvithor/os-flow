import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempBuildDir = fs.mkdtempSync(path.join(__dirname, '.tmp-test-'));

function compileWorkerForNode() {
  const files = [
    'types.ts',
    'auth.ts',
    'bot-guard.ts',
    'schemas.ts',
    'telegram.ts',
    'email.ts',
    'sentry.ts',
    'db.ts',
    'index.ts'
  ];

  for (const file of files) {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const out = ts.transpileModule(src, {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext
      }
    });
    const rewritten = out.outputText.replace(
      /(from\s+['"])(\.\/[a-zA-Z0-9_-]+)(['"])/g,
      '$1$2.mjs$3'
    );
    fs.writeFileSync(path.join(tempBuildDir, file.replace(/\.ts$/, '.mjs')), rewritten, 'utf8');
  }
}

function createInMemorySupabase() {
  const tables = {
    users: [],
    sessions: [],
    auth_rate_limits: [],
    operators: [],
    units: [],
    work_orders: [],
    alerts: [],
    notices: [],
    settings: [
      { key: 'plantName', value: 'Planta Sul • Pavilhão 3' },
      { key: 'shiftLabel', value: 'Tempo de Ciclo Turno 02 • Atualização: 1 seg' },
      { key: 'dailyGoal', value: '40' },
      { key: 'totalBenches', value: '8' }
    ]
  };
  const counters = { users: 0, units: 0, work_orders: 0, alerts: 0, notices: 0 };

  function matchFilters(row, filters) {
    return filters.every((f) => {
      if (f.type === 'eq') return row[f.col] === f.val;
      if (f.type === 'neq') return row[f.col] !== f.val;
      if (f.type === 'lte') return String(row[f.col] ?? '') <= String(f.val ?? '');
      return true;
    });
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.op = 'select';
      this.selectOpts = null;
      this.payload = null;
      this.upsertOpts = null;
      this.filters = [];
      this.orderSpec = null;
      this.limitCount = null;
      this.mode = 'many';
    }

    select(_cols = '*', opts = null) {
      if (this.op === 'select') {
        this.selectOpts = opts;
      }
      return this;
    }

    insert(payload) {
      this.op = 'insert';
      this.payload = payload;
      return this;
    }

    update(payload) {
      this.op = 'update';
      this.payload = payload;
      return this;
    }

    upsert(payload, opts = {}) {
      this.op = 'upsert';
      this.payload = payload;
      this.upsertOpts = opts;
      return this;
    }

    delete() {
      this.op = 'delete';
      return this;
    }

    eq(col, val) {
      this.filters.push({ type: 'eq', col, val });
      return this;
    }

    neq(col, val) {
      this.filters.push({ type: 'neq', col, val });
      return this;
    }

    lte(col, val) {
      this.filters.push({ type: 'lte', col, val });
      return this;
    }

    order(col, { ascending = true } = {}) {
      this.orderSpec = { col, ascending };
      return this;
    }

    limit(n) {
      this.limitCount = n;
      return this;
    }

    single() {
      this.mode = 'single';
      return this;
    }

    maybeSingle() {
      this.mode = 'maybeSingle';
      return this;
    }

    execute() {
      const list = tables[this.table];
      if (!list) {
        return { data: null, error: { message: `Tabela desconhecida: ${this.table}` } };
      }

      if (this.op === 'insert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = [];
        for (const item of items) {
          if (this.table === 'users') {
            const dup = list.find(
              (u) => String(u.username).toLowerCase() === String(item.username).toLowerCase()
            );
            if (dup) {
              return { data: null, error: { message: 'duplicate key value', code: '23505' } };
            }
          }
          const copy = { ...item };
          if (this.table in counters && copy.id === undefined) {
            counters[this.table] += 1;
            copy.id = counters[this.table];
          }
          list.push(copy);
          inserted.push({ ...copy });
        }
        return this.formatResult(inserted);
      }

      if (this.op === 'upsert') {
        const conflictCol = this.upsertOpts?.onConflict;
        const incoming = { ...this.payload };
        const existingIdx = conflictCol
          ? list.findIndex((r) => r[conflictCol] === incoming[conflictCol])
          : -1;
        if (existingIdx >= 0) {
          if (this.upsertOpts?.ignoreDuplicates) {
            return { data: null, error: null };
          }
          list[existingIdx] = { ...list[existingIdx], ...incoming };
          return this.formatResult([{ ...list[existingIdx] }]);
        }
        if (this.table in counters && incoming.id === undefined) {
          counters[this.table] += 1;
          incoming.id = counters[this.table];
        }
        list.push(incoming);
        return this.formatResult([{ ...incoming }]);
      }

      if (this.op === 'update') {
        const updated = [];
        for (let i = 0; i < list.length; i++) {
          if (matchFilters(list[i], this.filters)) {
            list[i] = { ...list[i], ...this.payload };
            updated.push({ ...list[i] });
          }
        }
        return this.formatResult(updated);
      }

      if (this.op === 'delete') {
        const kept = [];
        const removed = [];
        for (const row of list) {
          if (matchFilters(row, this.filters)) {
            removed.push({ ...row });
          } else {
            kept.push(row);
          }
        }
        tables[this.table] = kept;
        return this.formatResult(removed);
      }

      let result = list.filter((r) => matchFilters(r, this.filters)).map((r) => ({ ...r }));
      if (this.orderSpec) {
        const { col, ascending } = this.orderSpec;
        result.sort((a, b) => {
          if (a[col] === b[col]) return 0;
          if (a[col] < b[col]) return ascending ? -1 : 1;
          return ascending ? 1 : -1;
        });
      }
      if (this.limitCount !== null) {
        result = result.slice(0, this.limitCount);
      }
      if (this.selectOpts?.head) {
        return { data: null, count: result.length, error: null };
      }
      return this.formatResult(result, this.selectOpts?.count ? result.length : undefined);
    }

    formatResult(rows, count) {
      if (this.mode === 'single') {
        if (rows.length !== 1) {
          return { data: null, error: { message: 'Row not found' } };
        }
        return { data: rows[0], error: null };
      }
      if (this.mode === 'maybeSingle') {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, count, error: null };
    }

    then(resolve, reject) {
      return Promise.resolve().then(() => this.execute()).then(resolve, reject);
    }
  }

  return {
    from(table) {
      return new QueryBuilder(table);
    }
  };
}

function extractSessionCookie(res) {
  const rawList =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  const raw = rawList.find((c) => c.startsWith('osflow_session='));
  assert.ok(raw, 'Resposta deve definir cookie osflow_session');
  assert.match(raw, /HttpOnly/i, 'Cookie deve conter HttpOnly');
  assert.match(raw, /SameSite=Strict/i, 'Cookie deve conter SameSite=Strict');
  return raw.split(';')[0];
}

async function runTests() {
  compileWorkerForNode();
  const { createWorkerApp } = await import(pathToFileURL(path.join(tempBuildDir, 'index.mjs')).href);
  const { createWorkerTelegramNotifier } = await import(
    pathToFileURL(path.join(tempBuildDir, 'telegram.mjs')).href
  );

  const db = createInMemorySupabase();
  const telegramEvents = [];
  const emailEvents = [];
  const sentryCalls = [];
  const backgroundTasks = [];

  const mockAssets = {
    async fetch(req) {
      const p = new URL(req.url).pathname;
      if (p === '/' || p === '/index.html') {
        return new Response('<!doctype html><html><body>OS FLOW</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      return new Response('Not Found', { status: 404 });
    }
  };

  const env = {
    ASSETS: mockAssets,
    SUPABASE_URL: 'https://demo.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-mock-key',
    TELEGRAM_BOT_TOKEN: '123456:fake-telegram-token',
    TELEGRAM_CHAT_ID: '-100123456',
    TELEGRAM_ALERT_COOLDOWN_MS: '0',
    RESEND_API_KEY: 're_mock_key',
    ALERT_EMAIL_TO: 'ops@example.com',
    SENTRY_DSN: 'https://publicKey@o1.ingest.sentry.io/12345'
  };

  const app = createWorkerApp({
    createDb: () => db,
    createTelegram: () => ({
      enabled: true,
      notify: async (ev) => {
        telegramEvents.push(ev);
      },
      sendRaw: async () => ({ ok: true })
    }),
    createEmail: () => ({
      enabled: true,
      sendUrgentOrderEmail: async (order) => {
        emailEvents.push({ kind: 'urgent_order', code: order.code });
      },
      sendSecurityEmail: async (ev) => {
        emailEvents.push({ kind: 'security', type: ev.type });
      }
    }),
    captureError: async (err, _env, ctx) => {
      sentryCalls.push({ message: err instanceof Error ? err.message : String(err), ctx });
    },
    authRateLimitMax: 4,
    onBackgroundTask: (p) => backgroundTasks.push(p)
  });

  const call = (pathStr, init = {}) => {
    const req = new Request(`https://os-flow.example.workers.dev${pathStr}`, {
      ...init,
      headers: {
        host: 'os-flow.example.workers.dev',
        'cf-connecting-ip': '203.0.113.10',
        ...(init.headers || {})
      }
    });
    return app.fetch(req, env);
  };

  const drainBackground = async () => {
    await Promise.all(backgroundTasks.splice(0, backgroundTasks.length));
  };

  // 1. Health & Security headers on API + SPA HTML
  const healthRes = await call('/api/health');
  assert.equal(healthRes.status, 200);
  assert.deepEqual(await healthRes.json(), { ok: true });
  assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');
  assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
  assert.match(healthRes.headers.get('cache-control') || '', /no-store/);

  const spaRes = await call('/');
  assert.equal(spaRes.status, 200);
  assert.equal(spaRes.headers.get('x-frame-options'), 'DENY');
  assert.match(spaRes.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);

  // 2. Unauthenticated rejection across API & exhaustive bot-probe blocking
  for (const endpoint of ['/api/auth/login', '/api/state', '/api/orders/export.csv']) {
    const r = await call(endpoint);
    assert.equal(r.status, 401, `${endpoint} sem sessão deve retornar 401`);
  }
  const botProbes = [
    '/env',
    '/.env',
    '/.env.local',
    '/.env.test12:54',
    '/admin/.env',
    '/api/v1/.env',
    '/api/v2/.env',
    '/.git/config',
    '/.git/HEAD',
    '/.svn/entries',
    '/.ssh/id_rsa',
    '/.aws/credentials',
    '/docker-compose.yml',
    '/Dockerfile',
    '/package.json',
    '/wp-admin/',
    '/wp-admin/index.php',
    '/wp-login.php',
    '/xmlrpc.php',
    '/wp-config.php.bak',
    '/phpmyadmin/',
    '/pma/',
    '/adminer.php',
    '/admin/login',
    '/dashboard',
    '/backup.zip',
    '/db.sql',
    '/database.sqlite',
    '/actuator/env',
    '/graphql',
    '/swagger-ui.html',
    '/phpinfo.php',
    '/_profiler',
    '/telescope',
    '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php',
    '/cgi-bin/luci',
    '/boaform/admin/formLogin',
    '/solr/admin/info/system',
    '/console/',
    '/latest/meta-data/',
    '/data/users.json',
    '/server/db.mjs',
    '/worker/index.ts',
    '/supabase/schema.sql'
  ];
  for (const probe of botProbes) {
    const r = await call(probe);
    assert.equal(r.status, 404, `${probe} deve retornar 404`);
    assert.equal(await r.text(), 'Not Found', `${probe} não pode expor body customizado`);
    assert.match(r.headers.get('cache-control') || '', /no-store/);
  }
  await drainBackground();
  assert.ok(telegramEvents.some((e) => e.type === 'UNAUTHORIZED_API'));
  assert.ok(telegramEvents.some((e) => e.type === 'SENSITIVE_PROBE'));

  // 3. Initial setup & lock on second attempt
  const preStatus = await (await call('/api/auth/status')).json();
  assert.deepEqual(preStatus, { authenticated: false, needsSetup: true, user: null });

  const setupRes = await call('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sac', displayName: 'SAC Central', password: 'SenhaForte#2026' })
  });
  assert.equal(setupRes.status, 201);
  const cookie = extractSessionCookie(setupRes);
  assert.match(setupRes.headers.get('set-cookie') || '', /Secure/i);

  const secondSetup = await call('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'intruder', password: 'SenhaForte#2026' })
  });
  assert.equal(secondSetup.status, 403);
  await drainBackground();
  assert.ok(telegramEvents.some((e) => e.type === 'SETUP_BLOCKED'));
  assert.ok(emailEvents.some((e) => e.kind === 'security' && e.type === 'SETUP_BLOCKED'));

  // 4. CSRF protection on mutating endpoints
  const csrfRes = await call('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.attacker.example',
      Cookie: cookie
    },
    body: JSON.stringify({ unit: 'Unidade X', description: 'Teste CSRF' })
  });
  assert.equal(csrfRes.status, 403);
  await drainBackground();
  assert.ok(telegramEvents.some((e) => e.type === 'CSRF_BLOCKED'));

  // 5. Persistent Rate Limiting in Supabase mock (authRateLimitMax: 4)
  await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.77' },
    body: JSON.stringify({ username: 'sac', password: 'errada' })
  });
  await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.77' },
    body: JSON.stringify({ username: 'sac', password: 'errada' })
  });
  await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.77' },
    body: JSON.stringify({ username: 'sac', password: 'errada' })
  });
  await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.77' },
    body: JSON.stringify({ username: 'sac', password: 'errada' })
  });
  const blockedRate = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.77' },
    body: JSON.stringify({ username: 'sac', password: 'SenhaForte#2026' })
  });
  assert.equal(blockedRate.status, 429);
  await drainBackground();
  assert.ok(telegramEvents.some((e) => e.type === 'RATE_LIMITED'));

  // 6. Authenticated polling endpoint + OS workflow + Urgent Resend email + CSV export
  const eventsRes = await call('/api/events', { headers: { Cookie: cookie } });
  assert.equal(eventsRes.status, 501);
  assert.equal((await eventsRes.json()).mode, 'polling');

  const createUrgent = await call('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      unit: 'EMEB Horizonte',
      description: 'Queda total de rede elétrica no bloco A',
      urgent: true
    })
  });
  assert.equal(createUrgent.status, 201);
  const { order } = await createUrgent.json();
  assert.equal(order.code, '#1');
  await drainBackground();
  assert.ok(emailEvents.some((e) => e.kind === 'urgent_order' && e.code === '#1'));

  const claimRes = await call(`/api/orders/${order.id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({})
  });
  assert.equal(claimRes.status, 200);

  const pauseRes = await call(`/api/orders/${order.id}/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ reason: 'Aguardando peça de reposição' })
  });
  assert.equal(pauseRes.status, 200);

  const resumeRes = await call(`/api/orders/${order.id}/resume`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  assert.equal(resumeRes.status, 200);

  const completeRes = await call(`/api/orders/${order.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ completedBy: 'Técnico Carlos', notes: 'Disjuntor trocado' })
  });
  assert.equal(completeRes.status, 200);
  const completedPayload = await completeRes.json();
  assert.equal(completedPayload.order.status, 'completed');
  assert.equal(completedPayload.order.completedBy, 'Técnico Carlos');

  const csvRes = await call('/api/orders/export.csv?status=completed', {
    headers: { Cookie: cookie }
  });
  assert.equal(csvRes.status, 200);
  const csvBytes = new Uint8Array(await csvRes.arrayBuffer());
  assert.equal(csvBytes[0], 0xef, 'CSV deve iniciar com BOM UTF-8 (0xEF)');
  assert.equal(csvBytes[1], 0xbb, 'CSV deve iniciar com BOM UTF-8 (0xBB)');
  assert.equal(csvBytes[2], 0xbf, 'CSV deve iniciar com BOM UTF-8 (0xBF)');
  const csvText = new TextDecoder('utf-8').decode(csvBytes.subarray(3));
  assert.match(csvText, /EMEB Horizonte/);

  // 7. Logout revokes session
  const logoutRes = await call('/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  assert.equal(logoutRes.status, 200);
  assert.match(logoutRes.headers.get('set-cookie') || '', /Max-Age=0/);
  const afterLogout = await call('/api/state', { headers: { Cookie: cookie } });
  assert.equal(afterLogout.status, 401);

  // 8. Sentry error capture on unexpected Worker error (sanitized 500 response)
  const brokenApp = createWorkerApp({
    createDb: () => {
      throw new Error('Falha simulada Supabase');
    },
    createTelegram: () => ({ enabled: false, notify: async () => {}, sendRaw: async () => ({ ok: true }) }),
    captureError: async (err, _env, ctx) => {
      sentryCalls.push({ message: err instanceof Error ? err.message : String(err), ctx });
    },
    onBackgroundTask: (p) => backgroundTasks.push(p)
  });
  const errRes = await brokenApp.fetch(
    new Request('https://os-flow.example.workers.dev/api/auth/status'),
    env
  );
  assert.equal(errRes.status, 500);
  assert.deepEqual(await errRes.json(), { error: 'Erro interno do servidor' });
  await drainBackground();
  assert.equal(sentryCalls.length, 1);
  assert.equal(sentryCalls[0].message, 'Falha simulada Supabase');

  // Verify bot probes return 404 cleanly without touching Supabase
  const probeWithoutDb = await brokenApp.fetch(
    new Request('https://os-flow.example.workers.dev/wp-admin/'),
    env
  );
  assert.equal(probeWithoutDb.status, 404);
  assert.equal(await probeWithoutDb.text(), 'Not Found');

  // 9. Per-IP Telegram anti-flood across distinct bot probe paths
  const sentTelegramPayloads = [];
  const notifier = createWorkerTelegramNotifier(
    {
      TELEGRAM_BOT_TOKEN: '123456:mock-token',
      TELEGRAM_CHAT_ID: '-100123456',
      TELEGRAM_ALERT_COOLDOWN_MS: '60000'
    },
    async (_url, init) => {
      sentTelegramPayloads.push(JSON.parse(String(init?.body || '{}')));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  );
  await notifier.notify({ type: 'SENSITIVE_PROBE', ip: '198.51.100.88', method: 'GET', path: '/env' });
  await notifier.notify({
    type: 'SENSITIVE_PROBE',
    ip: '198.51.100.88',
    method: 'GET',
    path: '/wp-admin/'
  });
  await notifier.notify({
    type: 'SENSITIVE_PROBE',
    ip: '198.51.100.99',
    method: 'GET',
    path: '/phpmyadmin/'
  });
  assert.equal(sentTelegramPayloads.length, 2, 'Cooldown por IP deve agrupar probes diferentes do mesmo IP');

  console.log('ALL CLOUDFLARE WORKER + SUPABASE + TELEGRAM + RESEND + SENTRY TESTS PASSED!');
}

runTests()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(tempBuildDir, { recursive: true, force: true });
  });
