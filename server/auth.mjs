import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'osflow_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEYLEN = 64;

/** Gera hash scrypt com salt aleatório de 16 bytes. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

const DUMMY_PASSWORD_HASH = hashPassword('osflow-dummy-timing-guard-password');

/** Verifica senha em tempo constante (executa scrypt mesmo quando o usuário não existe). */
export function verifyPassword(password, storedHash) {
  const target = typeof storedHash === 'string' && storedHash.startsWith('scrypt$')
    ? storedHash
    : DUMMY_PASSWORD_HASH;
  const parts = target.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length !== SCRYPT_KEYLEN) {
    return false;
  }
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  const match = crypto.timingSafeEqual(derived, expected);
  return target === storedHash ? match : false;
}

export function hashSessionToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

export function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role
  };
}

export function countUsers(db) {
  const row = db.prepare('SELECT COUNT(*) AS total FROM users').get();
  return Number(row?.total ?? 0);
}

export function findUserByUsername(db, username) {
  return db
    .prepare('SELECT * FROM users WHERE lower(username) = lower(?)')
    .get(String(username || '').trim());
}

export function findUserById(db, userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

export function createUser(db, { username, displayName, role = 'sac', password }) {
  const nowIso = new Date().toISOString();
  const cleanUser = String(username).trim().toLowerCase();
  const cleanDisplay = String(displayName || 'SAC • Controle Geral').trim();
  const passwordHash = hashPassword(password);

  const result = db.prepare(`
    INSERT INTO users (username, display_name, role, password_hash, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(cleanUser, cleanDisplay, role, passwordHash, nowIso, nowIso);

  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
  return mapUserRow(created);
}

export function updateUserPassword(db, userId, newPassword) {
  const nowIso = new Date().toISOString();
  const passwordHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    passwordHash,
    nowIso,
    userId
  );
}

export function purgeExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}

export function createSession(db, userId, { ip = '', userAgent = '' } = {}) {
  purgeExpiredSessions(db);
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(rawToken);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SESSION_TTL_MS).toISOString();

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tokenHash,
    userId,
    nowIso,
    expiresAt,
    nowIso,
    String(ip || '').slice(0, 120),
    String(userAgent || '').slice(0, 240)
  );

  return { token: rawToken, tokenHash, expiresAt };
}

export function resolveSession(db, rawToken) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 20) {
    return null;
  }
  const tokenHash = hashSessionToken(rawToken);
  const nowIso = new Date().toISOString();

  const row = db.prepare(`
    SELECT
      s.token_hash,
      s.expires_at,
      u.id,
      u.username,
      u.display_name,
      u.role,
      u.active
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash);

  if (!row) return null;
  if (!row.active || row.expires_at <= nowIso) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(nowIso, tokenHash);
  return {
    tokenHash,
    user: mapUserRow(row)
  };
}

export function revokeSessionByToken(db, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashSessionToken(rawToken);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  return tokenHash;
}

export function revokeUserSessions(db, userId, exceptTokenHash = null) {
  const rows = exceptTokenHash
    ? db
        .prepare('SELECT token_hash FROM sessions WHERE user_id = ? AND token_hash != ?')
        .all(userId, exceptTokenHash)
    : db.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').all(userId);

  if (exceptTokenHash) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(
      userId,
      exceptTokenHash
    );
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  return rows.map((r) => r.token_hash);
}

function shouldUseSecureCookie(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return Boolean(req?.secure || req?.headers?.['x-forwarded-proto'] === 'https');
}

export function setSessionCookie(res, req, rawToken) {
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: shouldUseSecureCookie(req),
    path: '/',
    maxAge: SESSION_TTL_MS
  });
}

export function clearSessionCookie(res, req) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: shouldUseSecureCookie(req),
    path: '/'
  });
}
