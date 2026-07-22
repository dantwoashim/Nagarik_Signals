import 'server-only';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_VERSION = 'v1';
const MAX_SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;

function sessionSecret() {
  const configured = process.env.NAGARIK_COOKIE_SECRET ?? process.env.NAGARIK_SESSION_DERIVATION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('nagarik_cookie_secret_missing');
  return 'nagarik-signal-local-development-cookie-secret';
}

function signature(value: string) {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function cookieName() {
  return process.env.NODE_ENV === 'production' ? '__Host-nagarik-session' : 'nagarik-session';
}

function parseCookie(value: string | undefined) {
  if (!value) return null;
  const [version, id, issuedAtRaw, receivedSignature] = value.split('.');
  if (version !== COOKIE_VERSION || !id || !issuedAtRaw || !receivedSignature) return null;
  const signedValue = `${version}.${id}.${issuedAtRaw}`;
  const expectedSignature = signature(signedValue);
  const left = Buffer.from(receivedSignature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const issuedAt = Number(issuedAtRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(issuedAt) || issuedAt > now + 300 || issuedAt < now - MAX_SESSION_AGE_SECONDS) return null;
  return { id, issuedAt };
}

function mintCookie() {
  const id = randomBytes(24).toString('base64url');
  const issuedAt = Math.floor(Date.now() / 1000);
  const value = `${COOKIE_VERSION}.${id}.${issuedAt}`;
  return { id, issuedAt, value: `${value}.${signature(value)}` };
}

export async function getOrCreateServerSession() {
  const store = await cookies();
  const existing = parseCookie(store.get(cookieName())?.value);
  if (existing) return existing;
  const created = mintCookie();
  store.set(cookieName(), created.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_SESSION_AGE_SECONDS,
  });
  return { id: created.id, issuedAt: created.issuedAt };
}

export function sessionHash(sessionId: string) {
  return createHash('sha256').update(`nagarik-session:${sessionId}`).digest('hex');
}

export function sessionDisplayId(sessionId: string) {
  return `civic_${sessionHash(sessionId).slice(0, 16)}`;
}
