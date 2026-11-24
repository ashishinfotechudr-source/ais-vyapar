import crypto from 'crypto';

// Ephemeral fallback keeps dev/preview functional when SESSION_SECRET is unset;
// setting process.env.SESSION_SECRET persists sessions across server restarts.
const FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || FALLBACK_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) {
    return false;
  }
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) {
    return false;
  }
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export interface SessionClaims {
  uid: string;
  email: string;
  username: string;
  role: string;
  exp: number;
}

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function issueSessionToken(
  claims: Omit<SessionClaims, 'exp'>,
  ttlSeconds = 60 * 60 * 24
): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      ...claims,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    })
  );
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${header}.${payload}`)
    .digest();
  return `${header}.${payload}.${toBase64Url(sig)}`;
}

export function verifySessionToken(token: string): SessionClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed session token');
  }
  const [header, payload, sigB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${header}.${payload}`)
    .digest();
  const actualSig = Buffer.from(
    sigB64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((sigB64.length + 3) % 4),
    'base64'
  );
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    throw new Error('Invalid session signature');
  }
  const decoded = JSON.parse(fromBase64Url(payload)) as SessionClaims;
  if (!decoded.uid || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Session expired');
  }
  return decoded;
}
