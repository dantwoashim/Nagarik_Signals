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
      ? 'Public signals are temporarily paused.'
      : kind === 'illustrative_sample' || kind === 'qa_fixture'
      ? 'This record is outside the public verification flow.'
      : ''
  );
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<VerifyPayload | null>(null);

  async function addSignal() {
    setBusy(true);
    setPayload(null);
    try {
      setMessage('Recording one public signal on Solana...');
      const response = await fetch(`/api/reports/${encodeURIComponent(issue.id)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json() as VerifyPayload;
      setPayload(result);
      setMessage(result.ok ? 'One public signal recorded on Solana.' : readableReason(result.reason));
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
    <section id="attention" className="panel pad corroboration-panel">
      <div className="panel-heading-row">
        <h2>Public attention</h2>
        <span className={`pill ${payload?.ok ? 'proof-ok' : ''}`}>
          {payload?.ok ? (payload.verificationCount ?? issue.verificationCount + 1) : issue.verificationCount} signal{(payload?.verificationCount ?? issue.verificationCount) === 1 ? '' : 's'}
        </span>
      </div>
      <p className="muted panel-copy">
        Add one signal from this browser when the issue still needs attention. A signal is not evidence or an official response.
      </p>
      <button type="button" onClick={addSignal} className="button green" disabled={disabled}>
        {busy ? <WarningCircle size={17} weight="bold" /> : <CheckCircle size={17} weight="bold" />}
        {busy ? 'Adding signal...' : closed ? 'Record closed' : 'Add public signal'}
      </button>
      {message ? <p className={payload && !payload.ok ? 'proof-bad panel-status' : 'muted panel-status'} role="status">{message}</p> : null}
      {payload?.ok ? (
        <div className="notice">
          Signal account: <code className="mono">{shortText(payload.verificationPda, 12, 10)}</code>
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
