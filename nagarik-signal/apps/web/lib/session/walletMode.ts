'use client';

import type { CivicSession } from './civicSession';

const KEY = 'nagarik:wallet-identity';

type SolanaWindow = Window & {
  solana?: {
    isPhantom?: boolean;
    connect?: () => Promise<{ publicKey: { toBase58: () => string } }>;
  };
};

export type WalletIdentityResult =
  | { ok: true; identity: CivicSession }
  | { ok: false; reason: string };

export function getStoredWalletIdentity() {
  const raw = window.localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) as CivicSession : null;
}

export function clearStoredWalletIdentity() {
  window.localStorage.removeItem(KEY);
}

export async function connectWalletIdentity(): Promise<WalletIdentityResult> {
  const provider = (window as SolanaWindow).solana;
  if (!provider?.isPhantom || !provider.connect) {
    return { ok: false, reason: 'Phantom wallet was not detected. Civic session mode remains available.' };
  }

  try {
    const response = await provider.connect();
    const identity: CivicSession = {
      mode: 'wallet',
      label: 'connected wallet identity',
      publicKey: response.publicKey.toBase58(),
      createdAt: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(identity));
    return { ok: true, identity };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Wallet connection cancelled.' };
  }
}
