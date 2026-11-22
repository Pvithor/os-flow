export const SESSION_COOKIE_NAME = 'osflow_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100_000;
const HASH_BYTE_LENGTH = 32;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS
    },
    keyMaterial,
    HASH_BYTE_LENGTH * 8
  );
  return new Uint8Array(derivedBits);
}

/** Gera hash PBKDF2-SHA256 com 100.000 iterações (nativo no Cloudflare Workers Web Crypto). */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePbkdf2(password, salt);
  return `pbkdf2$${toHex(salt)}$${toHex(derived)}`;
}

const DUMMY_SALT_HEX = '00112233445566778899aabbccddeeff';
const DUMMY_HASH_HEX = '00'.repeat(HASH_BYTE_LENGTH);
const DUMMY_STORED_HASH = `pbkdf2$${DUMMY_SALT_HEX}$${DUMMY_HASH_HEX}`;

/** Verifica senha em tempo constante, executando PBKDF2 mesmo se o usuário não existir. */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  const isValidFormat = typeof storedHash === 'string' && storedHash.startsWith('pbkdf2$');
  const target = isValidFormat ? storedHash : DUMMY_STORED_HASH;
  const parts = target.split('$');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') {
    await derivePbkdf2(password, new Uint8Array(16));
    return false;
  }

  const salt = fromHex(parts[1]);
  const expected = fromHex(parts[2]);
  if (!salt || !expected || salt.length === 0 || expected.length !== HASH_BYTE_LENGTH) {
    await derivePbkdf2(password, new Uint8Array(16));
    return false;
  }

  const derived = await derivePbkdf2(password, salt);
  const match = constantTimeEqual(derived, expected);
  return isValidFormat ? match : false;
}

export async function hashSessionToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(rawToken)));
  return toHex(new Uint8Array(digest));
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function parseSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const rawValue = pair.slice(idx + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

export function shouldUseSecureCookie(req: Request): boolean {
  const protoHeader = req.headers.get('x-forwarded-proto');
  if (protoHeader) {
    return protoHeader.split(',')[0].trim().toLowerCase() === 'https';
  }
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildSessionSetCookie(rawToken: string, req: Request): string {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (shouldUseSecureCookie(req)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookie(req: Request): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (shouldUseSecureCookie(req)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}
