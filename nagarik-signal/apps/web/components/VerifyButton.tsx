'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { getOrCreateCivicSession, type CivicSession } from '@/lib/session/civicSession';
import { getStoredWalletIdentity } from '@/lib/session/walletMode';
import type { CivicIssue } from '@/lib/types';
import { shortText } from '@/lib/ui/format';

type VerifyPayload = {
  ok: boolean;
  status: 'verified' | 'rejected';
  reason: string;
  verifierPubkey?: string;
  verificationPda?: string;
  txSig?: string | null;
  explorerUrl?: string;
  verificationCount?: number;
  issueStatus?: string;
};

function readableReason(reason: string | undefined) {
  return (reason ?? 'verification_failed').replaceAll('_', ' ');
}

export function VerifyButton({ issue }: { issue: CivicIssue }) {
  const router = useRouter();
  const [message, setMessage] = useState(
    issue.proof.proofStatus === 'seeded_demo'
      ? 'Seeded demo issues cannot create live Verification PDAs.'
      : 'Ready to create one verification for your civic session.'
  );
  const [session, setSession] = useState<CivicSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<VerifyPayload | null>(null);

  async function verify() {
    setBusy(true);
    setPayload(null);
    try {
      const currentSession = getStoredWalletIdentity() ?? getOrCreateCivicSession('citizen verifier');
      const sessionId = currentSession.mode === 'wallet'
        ? `wallet-relayed:${currentSession.publicKey}`
        : currentSession.publicKey;
      setSession(currentSession);
      setMessage('Creating Verification PDA on Solana devnet...');
      const response = await fetch(`/api/reports/${encodeURIComponent(issue.id)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          identityMode: currentSession.mode,
          walletPubkey: currentSession.mode === 'wallet' ? currentSession.publicKey : null,
          displayName: currentSession.label,
        }),
      });
      const result = await response.json() as VerifyPayload;
      setPayload(result);
      setMessage(result.ok ? 'Verification PDA created and indexed.' : readableReason(result.reason));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'verification failed');
    } finally {
      setBusy(false);
    }
  }

  const closed = issue.status === 'resolved' || issue.status === 'rejected';
  const disabled = busy || issue.proof.proofStatus === 'seeded_demo' || closed;

  return (
    <section className="panel pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Citizen verification</h2>
        <span className={`pill ${payload?.ok ? 'proof-ok' : ''}`}>
          {payload?.ok ? 'verified' : issue.verificationCount} signal{issue.verificationCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="muted" style={{ lineHeight: 1.6 }}>
        One civic session can verify an indexed open issue once. Duplicate, self, closed, and demo-only cases return explicit reasons.
      </p>
      {session ? (
        <p className="mono muted" style={{ fontSize: 12 }}>
          {session.mode === 'wallet' ? 'Wallet identity' : 'Session'}: {shortText(session.publicKey, 13, 8)}
        </p>
      ) : null}
      <button type="button" onClick={verify} className="button green" disabled={disabled}>
        {busy ? <WarningCircle size={17} weight="bold" /> : <CheckCircle size={17} weight="bold" />}
        {busy ? 'Verifying...' : 'I saw this too'}
      </button>
      <p className={payload && !payload.ok ? 'proof-bad' : 'muted'} role="status" style={{ lineHeight: 1.55 }}>
        {message}
      </p>
      {payload?.ok ? (
        <div className="notice">
          Verification PDA: <code className="mono">{shortText(payload.verificationPda, 12, 10)}</code>
          {payload.explorerUrl ? (
            <>
              {' '}
              <a href={payload.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
