'use client';

import { useEffect, useState } from 'react';
import { IdentificationBadge, Wallet } from '@phosphor-icons/react';
import { getOrCreateCivicSession, type CivicSession } from '@/lib/session/civicSession';
import { clearStoredWalletIdentity, connectWalletIdentity, getStoredWalletIdentity } from '@/lib/session/walletMode';
import { shortText } from '@/lib/ui/format';

export function SessionChoice({ onSession }: { onSession?: (session: CivicSession) => void }) {
  const [session, setSession] = useState<CivicSession | null>(null);
  const [message, setMessage] = useState('Civic session is selected by default.');

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const current = getStoredWalletIdentity() ?? getOrCreateCivicSession('anonymous civic session');
      setSession(current);
      onSession?.(current);
    });
    return () => {
      cancelled = true;
    };
  }, [onSession]);

  function useCivicSession() {
    clearStoredWalletIdentity();
    const current = getOrCreateCivicSession('anonymous civic session');
    setSession(current);
    setMessage('Civic session selected. The relayer sponsors devnet fees.');
    onSession?.(current);
  }

  async function useWalletIdentity() {
    const result = await connectWalletIdentity();
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setSession(result.identity);
    setMessage('Wallet connected for identity. This MVP still uses sponsored devnet transactions for the live proof flow.');
    onSession?.(result.identity);
  }

  return (
    <section className="panel pad">
      <div className="badge-row">
        <span className="eyebrow">
          <IdentificationBadge size={15} weight="bold" />
          Identity mode
        </span>
        <span className="pill">{session?.mode === 'wallet' ? 'Wallet identity' : 'Gasless civic session'}</span>
      </div>
      <p className="muted" style={{ lineHeight: 1.55 }}>
        Use a walletless civic session for accessibility or connect Phantom as an optional public identity. Transactions are sponsored on devnet, so residents do not need SOL.
      </p>
      <div className="hash-row">
        <span className="muted">{session?.mode === 'wallet' ? 'Wallet' : 'Session id'}</span>
        <code className="mono">{session?.publicKey ? shortText(session.publicKey, 18, 12) : 'creating session...'}</code>
      </div>
      <div className="row-actions">
        <button className="button secondary" type="button" onClick={useCivicSession}>
          <IdentificationBadge size={16} weight="bold" />
          Use civic session
        </button>
        <button className="button secondary" type="button" onClick={useWalletIdentity}>
          <Wallet size={16} weight="bold" />
          Connect wallet identity
        </button>
      </div>
      <p className="muted" role="status" style={{ marginBottom: 0, lineHeight: 1.55 }}>{message}</p>
    </section>
  );
}
