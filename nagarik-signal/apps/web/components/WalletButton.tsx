'use client';

import { useState } from 'react';
import { Wallet } from '@phosphor-icons/react';
import { connectWalletIdentity, getStoredWalletIdentity } from '@/lib/session/walletMode';
import { shortText } from '@/lib/ui/format';

export function WalletButton() {
  const [message, setMessage] = useState('Optional wallet preview');
  const [publicKey, setPublicKey] = useState<string | null>(null);

  async function connectWallet() {
    const existing = getStoredWalletIdentity();
    if (existing) {
      setPublicKey(existing.publicKey);
      setMessage('Wallet identity selected.');
      return;
    }
    const result = await connectWalletIdentity();
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setPublicKey(result.identity.publicKey);
    setMessage('Wallet identity selected.');
  }

  return (
    <button type="button" className="button secondary" onClick={connectWallet}>
      <Wallet size={17} weight="bold" />
      {publicKey ? shortText(publicKey, 8, 6) : message}
    </button>
  );
}
