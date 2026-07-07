'use client';

import { useState } from 'react';
import { ArrowSquareOut, CheckCircle, FileJs, WarningCircle } from '@phosphor-icons/react';
import type { CivicIssue } from '@/lib/types';
import { addressUrl, formatDateTime, shortText, txUrl } from '@/lib/ui/format';

type ProofResponse = {
  ok: boolean;
  matches?: boolean;
  mode?: string;
  error?: string;
  boundary?: string;
  issuePda?: string;
  explorerUrl?: string | null;
  metadataMatches?: boolean;
  evidenceMatches?: boolean;
  locationMatches?: boolean;
  timelineMatches?: boolean;
  resolutionMatches?: boolean;
  statusMatches?: boolean;
  countMatches?: boolean;
  computed?: {
    metadataHash?: string;
    evidenceHash?: string;
    locationHash?: string;
    timelineHash?: string;
    resolutionHash?: string | null;
  };
  stored?: {
    metadataHash?: string;
    evidenceHash?: string;
    locationHash?: string;
    timelineHash?: string;
    resolutionHash?: string | null;
  };
  onChain?: {
    metadataHash?: string;
    evidenceHash?: string;
    locationHash?: string;
    status?: string;
    verificationCount?: number;
    updateCount?: number;
    timelineHash?: string;
    resolutionHash?: string;
    proofAnchoredAt?: string | null;
  } | null;
};

function resultLabel(result: ProofResponse | null, checking: boolean, issue: CivicIssue) {
  if (checking) return 'checking devnet';
  if (!result) return issue.proof.proofStatus === 'seeded_demo' ? 'seeded demo' : 'ready to verify';
  if (result.ok) return result.mode === 'seeded_demo' ? 'local demo match' : 'on-chain match';
  if (result.error) return 'proof unavailable';
  return 'proof mismatch';
}

function resultClass(result: ProofResponse | null, issue: CivicIssue) {
  if (!result) return issue.proof.proofStatus === 'seeded_demo' ? 'status-disputed' : 'status-submitted';
  if (result.ok) return 'proof-ok';
  return 'proof-bad';
}

export function ProofPanel({ issue }: { issue: CivicIssue }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ProofResponse | null>(null);
  const [message, setMessage] = useState(
    issue.proof.proofStatus === 'seeded_demo'
      ? 'Seeded demo rows are hash-checked locally and do not claim live Solana proof.'
      : 'Run an explicit live proof check against the indexed devnet account.'
  );
  const issueAddress = addressUrl(issue.proof.issuePda);
  const createTx = txUrl(issue.proof.createTxSig);
  const latestTx = txUrl(issue.proof.latestTxSig);
  const rawJsonUrl = `/api/verify-proof/${encodeURIComponent(issue.id)}`;
  const rows = [
    ['Issue PDA', issue.proof.issuePda],
    ['Metadata hash', issue.proof.metadataHash],
    ['Evidence hash', issue.proof.evidenceHash],
    ['Location hash', issue.proof.locationHash],
    ['Timeline hash', issue.proof.timelineHash],
    ['Proof anchored', formatDateTime(issue.proofAnchoredAt)],
  ];
  const checks: Array<[string, boolean | undefined]> = result
    ? [
        ['Metadata', result.metadataMatches],
        ['Evidence', result.evidenceMatches],
        ['Location', result.locationMatches],
        ['Status', result.statusMatches],
        ['Counts', result.countMatches],
        ['Timeline hash', result.timelineMatches],
        ['Resolution hash', result.resolutionMatches],
      ]
    : [];

  async function verifyProof() {
    setChecking(true);
    setMessage('Checking stored hashes and Solana account state...');
    try {
      const response = await fetch(rawJsonUrl, { cache: 'no-store' });
      const payload = await response.json() as ProofResponse;
      setResult(payload);
      if (response.ok && payload.ok) {
        setMessage(payload.boundary ?? 'Stored proof hashes match the live devnet account.');
      } else {
        setMessage(payload.error ?? 'Proof check returned a mismatch. Inspect the raw JSON before trusting this issue.');
      }
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : 'proof_check_failed' });
      setMessage(error instanceof Error ? error.message : 'Proof check failed');
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="panel pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>ProofPanel</h2>
        <span className={`pill ${resultClass(result, issue)}`}>{resultLabel(result, checking, issue)}</span>
      </div>
      <p className="muted" style={{ lineHeight: 1.6 }}>
        This panel exposes the committed hashes, account links, and an explicit live verification action for judges.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(([label, value]) => (
          <div className="hash-row" key={label}>
            <span className="muted">{label}</span>
            <code className="mono">{label === 'Proof anchored' ? value : shortText(value, 14, 14)}</code>
          </div>
        ))}
      </div>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button type="button" className="button green" onClick={verifyProof} disabled={checking}>
          {checking ? <WarningCircle size={17} weight="bold" /> : <CheckCircle size={17} weight="bold" />}
          {checking ? 'Checking proof...' : 'Verify on-chain now'}
        </button>
        <a className="button secondary" href={rawJsonUrl} target="_blank" rel="noreferrer">
          <FileJs size={17} weight="bold" />
          Raw JSON
        </a>
        {issueAddress ? (
          <a className="button secondary" href={issueAddress} target="_blank" rel="noreferrer">
            <ArrowSquareOut size={17} weight="bold" />
            Issue account
          </a>
        ) : null}
        {createTx ? (
          <a className="button secondary" href={createTx} target="_blank" rel="noreferrer">
            Create tx
          </a>
        ) : null}
        {latestTx ? (
          <a className="button secondary" href={latestTx} target="_blank" rel="noreferrer">
            Latest tx
          </a>
        ) : null}
      </div>
      <p className={result?.ok ? 'proof-ok' : result ? 'proof-bad' : 'muted'} role="status" style={{ lineHeight: 1.55 }}>
        {message}
      </p>
      {result?.onChain ? (
        <div className="notice" style={{ display: 'grid', gap: 10 }}>
          <div>
            On-chain status: {String(result.onChain.status ?? 'unknown').replaceAll('_', ' ')}. Verifications:{' '}
            {result.onChain.verificationCount ?? 0}. Updates: {result.onChain.updateCount ?? 0}.
          </div>
          <div className="badge-row">
            {checks.map(([label, ok]) => (
              <span key={String(label)} className={`pill ${ok ? 'proof-ok' : 'proof-bad'}`}>
                {label}: {ok ? 'match' : 'mismatch'}
              </span>
            ))}
          </div>
          <div className="hash-row">
            <span className="muted">On-chain timeline</span>
            <code className="mono">{shortText(result.onChain.timelineHash, 14, 14)}</code>
          </div>
          <div className="hash-row">
            <span className="muted">On-chain resolution</span>
            <code className="mono">{shortText(result.onChain.resolutionHash, 14, 14)}</code>
          </div>
        </div>
      ) : null}
    </section>
  );
}
