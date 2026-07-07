'use client';

const KEY = 'nagarik:civic-session';

export type CivicSession = {
  mode: 'session' | 'wallet';
  label: string;
  publicKey: string;
  createdAt: string;
};

function randomHex(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getOrCreateCivicSession(label = 'civic participant'): CivicSession {
  const existing = window.localStorage.getItem(KEY);
  if (existing) return JSON.parse(existing) as CivicSession;
  const session: CivicSession = {
    mode: 'session',
    label,
    publicKey: `session_${randomHex(16)}`,
    createdAt: new Date().toISOString(),
  };
  window.localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function clearCivicSession() {
  window.localStorage.removeItem(KEY);
}
