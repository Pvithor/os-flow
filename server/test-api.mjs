import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './index.mjs';
import { createTelegramNotifier } from './telegram.mjs';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'os-flow-test-'));
const tempDbPath = path.join(tempDir, 'test.db');
const tempRateDbPath = path.join(tempDir, 'rate-limit.db');

function extractSessionCookie(res) {
  const rawList =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  const raw = rawList.find((c) => c.startsWith('osflow_session='));
  assert.ok(raw, 'Resposta deve definir cookie osflow_session');
  assert.match(raw, /HttpOnly/i, 'Cookie deve conter flag HttpOnly');
  assert.match(raw, /SameSite=Strict/i, 'Cookie deve conter flag SameSite=Strict');
  return raw.split(';')[0];
}

async function runTests() {
  const telegramEvents = [];
  const mockTelegram = {
    enabled: true,
    notify: (ev) => telegramEvents.push(ev),
    sendRaw: async () => ({ ok: true })
  };

  const app = createApp({
    dbPath: tempDbPath,
    staticDir: null,
    authRateLimitMax: 25,
    telegramNotifier: mockTelegram
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Security headers + public health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.deepEqual(await healthRes.json(), { ok: true });
    assert.equal(healthRes.headers.get('x-powered-by'), null, 'x-powered-by deve estar desabilitado');
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');
    assert.match(healthRes.headers.get('cache-control') || '', /no-store/);

    // 2. Unauthenticated rejection across all protected endpoints
    const protectedChecks = [
      ['GET', '/api/state'],
      ['GET', '/api/events'],
      ['GET', '/api/orders/export.csv'],
      ['POST', '/api/orders'],
      ['POST', '/api/units'],
      ['POST', '/api/operators'],
      ['POST', '/api/notices'],
      ['POST', '/api/demo/reset']
    ];
    for (const [method, endpoint] of protectedChecks) {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
        body: method !== 'GET' ? '{}' : undefined
      });
      assert.equal(res.status, 401, `${method} ${endpoint} sem login deve retornar 401`);
    }

    const preLoginStatus = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(preLoginStatus.status, 200);
    assert.deepEqual(await preLoginStatus.json(), {
      authenticated: false,
      needsSetup: true,
      user: null
    });

    const loginBeforeSetup = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sac', password: 'SenhaSegura#2026' })
    });
    assert.equal(loginBeforeSetup.status, 403);

    // 3. Initial setup validation + creation + single-setup lock
    const weakSetupRes = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sac', password: '123' })
    });
    assert.equal(weakSetupRes.status, 400);

    const setupRes = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'sac',
        displayName: 'SAC • Controle Geral',
        password: 'SenhaSegura#2026'
      })
    });
    assert.equal(setupRes.status, 201);
    let sessionCookie = extractSessionCookie(setupRes);
    const setupBody = await setupRes.json();
    assert.equal(setupBody.authenticated, true);
    assert.equal(setupBody.user.username, 'sac');

    const secondSetupRes = await fetch(`${baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'outro', password: 'OutraSenha#2026' })
    });
    assert.equal(secondSetupRes.status, 403, 'Segundo setup deve ser bloqueado');

    // 4. CSRF Same-Origin guard + Logout revocation + Login + Change Password
    const csrfRes = await fetch(`${baseUrl}/api/units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        Origin: 'https://evil.example'
      },
      body: JSON.stringify({ name: 'Invasor' })
    });
    assert.equal(csrfRes.status, 403, 'Origin externo deve receber 403');

    const demoResetRes = await fetch(`${baseUrl}/api/demo/reset`, {
      method: 'POST',
      headers: { Cookie: sessionCookie }
    });
    assert.equal(demoResetRes.status, 404, 'Rota /api/demo/reset deve ter sido removida');

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookie }
    });
    assert.equal(logoutRes.status, 200);

    const staleStateRes = await fetch(`${baseUrl}/api/state`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(staleStateRes.status, 401, 'Cookie revogado no logout não pode continuar válido');

    const wrongLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sac', password: 'SenhaErrada#999' })
    });
    assert.equal(wrongLoginRes.status, 401);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sac', password: 'SenhaSegura#2026' })
    });
    assert.equal(loginRes.status, 200);
    sessionCookie = extractSessionCookie(loginRes);

    const changePwdRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        currentPassword: 'SenhaSegura#2026',
        newPassword: 'NovaSenhaForte#2026'
      })
    });
    assert.equal(changePwdRes.status, 200);

    const authHeaders = (extra = {}) => ({ Cookie: sessionCookie, ...extra });
    const jsonAuthHeaders = () => ({ 'Content-Type': 'application/json', Cookie: sessionCookie });

    // 5. Empty initial operational state starting at #1
    const stateRes = await fetch(`${baseUrl}/api/state`, { headers: authHeaders() });
    assert.equal(stateRes.status, 200);
    const state = await stateRes.json();
    assert.equal(state.orders.length, 0, 'Deve iniciar sem O.S de teste');
    assert.equal(state.operators.length, 0, 'Deve iniciar sem operadores de teste');
    assert.equal(state.units.length, 0, 'Deve iniciar sem unidades de teste');
    assert.equal(state.nextCode, '#1', 'Numeração deve começar em #1');

    // 6. Authenticated SSE connection
    const sseController = new AbortController();
    const sseRes = await fetch(`${baseUrl}/api/events`, {
      headers: authHeaders(),
      signal: sseController.signal
    });
    assert.equal(sseRes.status, 200);
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    const firstChunk = await reader.read();
    const firstText = decoder.decode(firstChunk.value);
    assert.match(firstText, /event: connected/);

    // 7. Create & delete unit + auto-populate unit from order creation
    const unitRes = await fetch(`${baseUrl}/api/units`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ name: 'Matriz Cuiabá' })
    });
    assert.equal(unitRes.status, 201);
    const unitData = await unitRes.json();
    assert.equal(unitData.unit.name, 'Matriz Cuiabá');

    const badRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ unit: 'A', description: 'x' })
    });
    assert.equal(badRes.status, 400);

    const createRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        unit: 'Filial Várzea Grande',
        description: 'Troca de fonte nobreak principal.',
        urgent: true,
        startImmediately: false
      })
    });
    assert.equal(createRes.status, 201);
    const createdPayload = await createRes.json();
    assert.equal(createdPayload.order.code, '#1');
    assert.equal(createdPayload.order.status, 'queued');
    assert.ok(
      createdPayload.state.units.some((u) => u.name === 'Filial Várzea Grande'),
      'Unidade deve abastecer catálogo automaticamente'
    );

    const delUnitRes = await fetch(`${baseUrl}/api/units/${unitData.unit.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    assert.equal(delUnitRes.status, 200);

    // 8. Claim (SAC) -> Pause -> Resume -> Notes -> Complete with completedBy
    const orderId = createdPayload.order.id;

    const claimRes = await fetch(`${baseUrl}/api/orders/${orderId}/claim`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({})
    });
    assert.equal(claimRes.status, 200);
    const claimed = await claimRes.json();
    assert.equal(claimed.order.status, 'in_progress');
    assert.equal(claimed.order.assignedOperatorName, 'SAC');

    const pauseRes = await fetch(`${baseUrl}/api/orders/${orderId}/pause`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ reason: 'Aguardando peça' })
    });
    assert.equal(pauseRes.status, 200);
    assert.equal((await pauseRes.json()).order.status, 'paused');

    const resumeRes = await fetch(`${baseUrl}/api/orders/${orderId}/resume`, {
      method: 'POST',
      headers: authHeaders()
    });
    assert.equal(resumeRes.status, 200);
    assert.equal((await resumeRes.json()).order.status, 'in_progress');

    const notesRes = await fetch(`${baseUrl}/api/orders/${orderId}/notes`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ notes: 'Fonte substituída e testada.' })
    });
    assert.equal(notesRes.status, 200);

    const completeRes = await fetch(`${baseUrl}/api/orders/${orderId}/complete`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        notes: 'Finalizada em campo.',
        completedBy: 'João Pedro'
      })
    });
    assert.equal(completeRes.status, 200);
    const completed = await completeRes.json();
    assert.equal(completed.order.status, 'completed');
    assert.equal(completed.order.completedBy, 'João Pedro');
    assert.ok(
      completed.state.operators.some((o) => o.name === 'João Pedro'),
      'Nome de quem finalizou deve abastecer dropdown automaticamente'
    );

    // 9. CSV export includes Finalizado Por
    const csvRes = await fetch(`${baseUrl}/api/orders/export.csv?status=completed`, {
      headers: authHeaders()
    });
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.match(csvText, /Finalizado Por/);
    assert.match(csvText, /#1/);
    assert.match(csvText, /João Pedro/);

    // 10. Start immediately without operators creates #2
    const startNowRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        unit: 'Filial Várzea Grande',
        description: 'Reinício link Starlink.',
        urgent: false,
        startImmediately: true
      })
    });
    assert.equal(startNowRes.status, 201);
    const startNow = await startNowRes.json();
    assert.equal(startNow.order.code, '#2');
    assert.equal(startNow.order.status, 'in_progress');

    // 11. Reopen & Delete order + Edit/Delete Units & Operators
    const reopenRes = await fetch(`${baseUrl}/api/orders/${orderId}/reopen`, {
      method: 'POST',
      headers: authHeaders()
    });
    assert.equal(reopenRes.status, 200);
    assert.equal((await reopenRes.json()).order.status, 'queued');

    const vgUnit = createdPayload.state.units.find((u) => u.name === 'Filial Várzea Grande');
    assert.ok(vgUnit);
    const editUnitRes = await fetch(`${baseUrl}/api/units/${vgUnit.id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ name: 'Escola Estadual Várzea Grande' })
    });
    assert.equal(editUnitRes.status, 200);
    const editUnitData = await editUnitRes.json();
    assert.equal(editUnitData.unit.name, 'Escola Estadual Várzea Grande');
    assert.ok(
      editUnitData.state.orders.every((o) => o.unit === 'Escola Estadual Várzea Grande'),
      'Edição de escola deve propagar nas O.S existentes'
    );

    const dupUnitCreate = await fetch(`${baseUrl}/api/units`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ name: 'Escola Extra' })
    });
    assert.equal(dupUnitCreate.status, 201);
    const extraUnit = (await dupUnitCreate.json()).unit;
    const conflictUnitRes = await fetch(`${baseUrl}/api/units/${extraUnit.id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ name: 'escola estadual várzea grande' })
    });
    assert.equal(conflictUnitRes.status, 409);
    await fetch(`${baseUrl}/api/units/${extraUnit.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    const opJoao = completed.state.operators.find((o) => o.name === 'João Pedro');
    assert.ok(opJoao);
    const editOpRes = await fetch(`${baseUrl}/api/operators/${opJoao.id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ name: 'João Pedro Silva', station: 'Campo Norte' })
    });
    assert.equal(editOpRes.status, 200);
    const editOpData = await editOpRes.json();
    assert.equal(editOpData.operator.name, 'João Pedro Silva');
    assert.equal(editOpData.operator.station, 'Campo Norte');

    const tempOpRes = await fetch(`${baseUrl}/api/operators`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ name: 'Pessoa Temporária' })
    });
    assert.equal(tempOpRes.status, 201);
    const tempOp = (await tempOpRes.json()).operator;
    const conflictOpRes = await fetch(`${baseUrl}/api/operators/${tempOp.id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ name: 'joão pedro silva' })
    });
    assert.equal(conflictOpRes.status, 409);
    const delOpRes = await fetch(`${baseUrl}/api/operators/${tempOp.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    assert.equal(delOpRes.status, 200);

    const delRes = await fetch(`${baseUrl}/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    assert.equal(delRes.status, 200);

    // 12. Custom Notices CRUD
    const n1Res = await fetch(`${baseUrl}/api/notices`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ text: 'starlink0060', author: 'Equipe' })
    });
    assert.equal(n1Res.status, 201);
    const n1 = await n1Res.json();
    assert.equal(n1.notice.label, 'NÃO INICIADO');

    sseController.abort();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    app.locals.close();
  }

  // 13. Verify SQLite persistence (data + new password) across restart
  const app2 = createApp({
    dbPath: tempDbPath,
    staticDir: null,
    authRateLimitMax: 25,
    telegramNotifier: mockTelegram
  });
  const server2 = await new Promise((resolve) => {
    const s = app2.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port: port2 } = server2.address();
    const base2 = `http://127.0.0.1:${port2}`;

    assert.equal((await fetch(`${base2}/api/state`)).status, 401);

    const oldLoginRes = await fetch(`${base2}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sac', password: 'SenhaSegura#2026' })
    });
    assert.equal(oldLoginRes.status, 401);

    const newLoginRes = await fetch(`${base2}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sac', password: 'NovaSenhaForte#2026' })
    });
    assert.equal(newLoginRes.status, 200);
    const cookie2 = extractSessionCookie(newLoginRes);

    const res2 = await fetch(`${base2}/api/state`, { headers: { Cookie: cookie2 } });
    const persisted = await res2.json();
    assert.equal(persisted.orders.length, 1, 'Somente a O.S #2 deve persistir');
    assert.equal(persisted.nextCode, '#3');
    assert.ok(persisted.operators.some((o) => o.name === 'João Pedro Silva'));
    assert.ok(!persisted.operators.some((o) => o.name === 'Pessoa Temporária'));
    assert.ok(persisted.units.some((u) => u.name === 'Escola Estadual Várzea Grande'));
    assert.ok(persisted.notices.some((n) => n.text === 'starlink0060'));
  } finally {
    await new Promise((resolve) => server2.close(resolve));
    app2.locals.close();
  }

  // 14. Dedicated rate-limit verification (4th login try -> 429)
  const app3 = createApp({
    dbPath: tempRateDbPath,
    staticDir: null,
    authRateLimitMax: 3,
    telegramNotifier: mockTelegram
  });
  const server3 = await new Promise((resolve) => {
    const s = app3.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port: port3 } = server3.address();
    const base3 = `http://127.0.0.1:${port3}`;
    for (let i = 0; i < 3; i++) {
      const attempt = await fetch(`${base3}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'sac', password: '123' })
      });
      assert.ok(attempt.status < 429);
    }
    const blocked = await fetch(`${base3}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sac', password: '123' })
    });
    assert.equal(blocked.status, 429, 'Quarta tentativa deve acionar rate limit 429');
  } finally {
    await new Promise((resolve) => server3.close(resolve));
    app3.locals.close();
  }

  // 15. Static SPA fallback + zero stack trace exposure on 404/malformed JSON
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    const app4 = createApp({
      dbPath: path.join(tempDir, 'static.db'),
      staticDir: distDir,
      authRateLimitMax: 25,
      telegramNotifier: mockTelegram
    });
    const server4 = await new Promise((resolve) => {
      const s = app4.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const { port: port4 } = server4.address();
      const base4 = `http://127.0.0.1:${port4}`;

      const homeRes = await fetch(`${base4}/`);
      assert.equal(homeRes.status, 200);
      assert.match(homeRes.headers.get('content-type') || '', /text\/html/);
      const homeHtml = await homeRes.text();
      assert.match(homeHtml, /<title>OS FLOW<\/title>/);
      assert.ok(!homeHtml.includes('NotFoundError'));

      const loginGetRes = await fetch(`${base4}/api/auth/login`);
      assert.equal(loginGetRes.status, 401, 'GET /api/auth/login deve retornar 401');

      const botProbes = [
        '/dashboard',
        '/env',
        '/.env',
        '/.env.test12:54',
        '/api/v1/.env',
        '/.git/config',
        '/wp-admin/',
        '/wp-login.php',
        '/phpmyadmin/',
        '/actuator/env',
        '/data/users.json',
        '/latest/meta-data/',
        '/backup.zip',
        '/cgi-bin/luci',
        '/server/index.mjs',
        '/data/os-flow.db',
        '/assets/missing.js.map'
      ];
      for (const probePath of botProbes) {
        const probeRes = await fetch(`${base4}${probePath}`);
        assert.equal(probeRes.status, 404, `${probePath} deve retornar 404`);
        const probeText = await probeRes.text();
        assert.equal(probeText, 'Not Found', `${probePath} não pode vazar stack trace ou index.html`);
        assert.ok(!probeText.includes('node_modules') && !probeText.includes('C:\\'));
      }

      const badJsonRes = await fetch(`${base4}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
      });
      assert.equal(badJsonRes.status, 400);
      const badJsonBody = await badJsonRes.text();
      assert.ok(!badJsonBody.includes('SyntaxError') && !badJsonBody.includes('node_modules'));
      assert.deepEqual(JSON.parse(badJsonBody), { error: 'JSON inválido' });
    } finally {
      await new Promise((resolve) => server4.close(resolve));
      app4.locals.close();
    }
  }

  // 16. Verify security alert types + Telegram notifier HTTP transport, cooldown & migrate_to_chat_id
  const seenTypes = new Set(telegramEvents.map((e) => e.type));
  for (const expectedType of [
    'UNAUTHORIZED_API',
    'AUTH_SUCCESS',
    'SETUP_BLOCKED',
    'CSRF_BLOCKED',
    'LOGIN_FAILED',
    'RATE_LIMITED'
  ]) {
    assert.ok(seenTypes.has(expectedType), `Alerta Telegram ${expectedType} deve ter sido emitido`);
  }
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    assert.ok(seenTypes.has('SENSITIVE_PROBE'), 'Alerta SENSITIVE_PROBE deve ter sido emitido');
  }

  const receivedTelegramPosts = [];
  const tgMockServer = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      receivedTelegramPosts.push({ url: req.url, body });
      if (String(body.chat_id) === '-5294310413') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            error_code: 400,
            description: 'Bad Request: group chat was upgraded to a supergroup chat',
            parameters: { migrate_to_chat_id: -100999888777 }
          })
        );
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, result: { message_id: receivedTelegramPosts.length } }));
    });
  });
  await new Promise((resolve) => tgMockServer.listen(0, '127.0.0.1', resolve));
  try {
    const tgPort = tgMockServer.address().port;
    const notifier = createTelegramNotifier({
      botToken: 'TEST_TOKEN_SECRET',
      chatId: '-5294310413',
      cooldownMs: 300,
      apiBaseUrl: `http://127.0.0.1:${tgPort}`
    });
    assert.equal(notifier.enabled, true);

    const migRes = await notifier.sendRaw('Teste migração supergrupo');
    assert.equal(migRes.ok, true);
    assert.equal(migRes.migratedTo, '-100999888777');
    assert.equal(receivedTelegramPosts[0].url, '/botTEST_TOKEN_SECRET/sendMessage');
    assert.equal(receivedTelegramPosts[1].body.chat_id, '-100999888777');

    notifier.notify({ type: 'LOGIN_FAILED', ip: '127.0.0.1', method: 'POST', path: '/api/auth/login' });
    notifier.notify({ type: 'LOGIN_FAILED', ip: '127.0.0.1', method: 'POST', path: '/api/auth/login' });
    await new Promise((r) => setTimeout(r, 360));
    notifier.notify({ type: 'LOGIN_FAILED', ip: '127.0.0.1', method: 'POST', path: '/api/auth/login' });
    await new Promise((r) => setTimeout(r, 80));

    // Wait: first sendRaw triggered 2 posts (initial + migrated retry), then notify #1 -> 1 post, notify #2 suppressed, notify #3 -> 1 post with +1 suppressed
    assert.equal(receivedTelegramPosts.length, 4, 'Cooldown deve suprimir alerta duplicado');
    assert.match(receivedTelegramPosts[3].body.text, /Eventos suprimidos no cooldown: \+1/);
  } finally {
    await new Promise((resolve) => tgMockServer.close(resolve));
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('ALL PRODUCTION-READY AUTH + SECURITY + API + SSE + SQLITE TESTS PASSED!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
