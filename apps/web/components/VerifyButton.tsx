'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import type { CivicIssue } from '@/lib/types';
import { shortText } from '@/lib/ui/format';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { inferredRecordKind } from '@/lib/issues/recordKind';

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
  const kind = inferredRecordKind(issue);
  const [message, setMessage] = useState(
    publicPreviewReadOnly
      ? 'Citizen signals are temporarily paused in this public preview. The independent Solana proof check below remains available.'
      : kind === 'illustrative_sample' || kind === 'qa_fixture'
      ? 'This record is outside the public verification flow.'
      : 'A private server-minted civic session can add one public signal.'
  );
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<VerifyPayload | null>(null);

  async function verify() {
    setBusy(true);
    setPayload(null);
    try {
      setMessage('Creating a verification account on Solana devnet...');
      const response = await fetch(`/api/reports/${encodeURIComponent(issue.id)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json() as VerifyPayload;
      setPayload(result);
      setMessage(result.ok ? 'Public verification signal anchored and indexed.' : readableReason(result.reason));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'verification failed');
    } finally {
      setBusy(false);
    }
  }

  const closed = issue.status === 'resolved' || issue.status === 'rejected';
  const disabled = publicPreviewReadOnly || busy || kind === 'illustrative_sample' || kind === 'qa_fixture' || closed;

  return (
    <section className="panel pad corroboration-panel">
      <div className="panel-heading-row">
        <h2>Public corroboration</h2>
        <span className={`pill ${payload?.ok ? 'proof-ok' : ''}`}>
          {payload?.ok ? 'verified' : issue.verificationCount} signal{issue.verificationCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="muted panel-copy">
        One server-minted civic session can signal once. This is a rate-limited corroboration signal, not proof of a unique person or an official acknowledgement.
      </p>
      <button type="button" onClick={verify} className="button green" disabled={disabled}>
        {busy ? <WarningCircle size={17} weight="bold" /> : <CheckCircle size={17} weight="bold" />}
        {busy ? 'Anchoring signal...' : kind === 'public_source' ? 'This still needs follow-up' : 'I can corroborate this'}
      </button>
      <p className={payload && !payload.ok ? 'proof-bad panel-status' : 'muted panel-status'} role="status">
        {message}
      </p>
      {payload?.ok ? (
        <div className="notice">
          Verification account: <code className="mono">{shortText(payload.verificationPda, 12, 10)}</code>
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
