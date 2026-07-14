'use client';

import { useState } from 'react';
import { ArrowSquareOut, CheckCircle, Cube, FileJs, Fingerprint, WarningCircle } from '@phosphor-icons/react';
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
  evidenceStatus?: 'match' | 'mismatch' | 'unavailable';
  evidenceAvailable?: boolean;
  evidenceError?: string | null;
  evidenceByteLength?: number | null;
  storedEvidenceMatchesOnChain?: boolean | null;
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
  if (!result) return issue.proof.proofStatus === 'seeded_demo' ? 'sample record' : 'ready to verify';
  if (result.mode === 'evidence_unavailable') return 'evidence unavailable';
  if (result.ok) return result.mode === 'seeded_demo' ? 'local sample match' : 'on-chain match';
  if (result.error) return 'proof unavailable';
  return 'proof mismatch';
}

function resultClass(result: ProofResponse | null, issue: CivicIssue) {
  if (!result) return issue.proof.proofStatus === 'seeded_demo' ? 'status-disputed' : 'status-submitted';
  if (result.ok) return 'proof-ok';
  if (result.mode === 'evidence_unavailable') return 'status-disputed';
  return 'proof-bad';
}

export function ProofPanel({ issue }: { issue: CivicIssue }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ProofResponse | null>(null);
  const [message, setMessage] = useState(
    issue.proof.proofStatus === 'seeded_demo'
      ? 'Sample records are hash-checked locally and do not claim live Solana proof.'
      : 'Run an explicit live proof check against the indexed devnet account.'
  );
  const issueAddress = addressUrl(issue.proof.issuePda);
  const createTx = txUrl(issue.proof.createTxSig);
  const latestTx = txUrl(issue.proof.latestTxSig);
  const rawJsonUrl = `/api/verify-proof/${encodeURIComponent(issue.id)}`;
  const sample = issue.proof.proofStatus === 'seeded_demo';
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
        ['Delivered evidence bytes', result.evidenceMatches],
        ...(typeof result.storedEvidenceMatchesOnChain === 'boolean'
          ? [['Stored evidence hash', result.storedEvidenceMatchesOnChain] as [string, boolean]]
          : []),
        ['Location', result.locationMatches],
        ['Status', result.statusMatches],
        ['Counts', result.countMatches],
        ['Timeline hash', result.timelineMatches],
        ['Resolution hash', result.resolutionMatches],
      ]
    : [];

  async function verifyProof() {
    setChecking(true);
    setMessage('Fetching the displayed artifact, hashing its bytes, and checking the Solana account...');
    try {
      const response = await fetch(rawJsonUrl, { cache: 'no-store' });
      const payload = await response.json() as ProofResponse;
      setResult(payload);
      if (response.ok && payload.ok) {
        setMessage(payload.boundary ?? 'Delivered evidence bytes, displayed metadata, and live devnet state all match.');
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
    <section id="proof" className="panel pad proof-panel" aria-busy={checking}>
      <div className="proof-panel-heading">
        <div>
          <span className="proof-kicker">{sample ? 'Sample integrity' : 'Independent verification'}</span>
          <h2>Verify this record</h2>
        </div>
        <span className={`pill ${resultClass(result, issue)}`}>{resultLabel(result, checking, issue)}</span>
      </div>
      <p className="proof-explainer">
        {sample
          ? 'This is an illustrative public record. Check that its displayed evidence and metadata still match the stored hashes.'
          : 'Fetch and hash the delivered artifact, recompute the displayed metadata, then compare both with the indexed Solana devnet account.'}
      </p>
      <div className="proof-method" aria-label="Verification method">
        <span><FileJs size={17} weight="bold" />Delivered bytes</span>
        <span><Fingerprint size={17} weight="bold" />Displayed metadata</span>
        <span><Cube size={17} weight="bold" />Solana account</span>
      </div>
      {checking ? <div className="verification-scan" role="status"><span />Recomputing the public record</div> : null}
      <div className="row-actions proof-actions">
        <button type="button" className="button green" onClick={verifyProof} disabled={checking}>
          {checking ? <WarningCircle size={17} weight="bold" /> : <CheckCircle size={17} weight="bold" />}
          {checking ? 'Checking record...' : sample ? 'Check sample integrity' : 'Verify against Solana'}
        </button>
      </div>
      <p className={result?.ok ? 'proof-verdict proof-ok' : result ? 'proof-verdict proof-bad' : 'proof-verdict'} role="status" aria-live="polite">
        {message}
      </p>
      {result?.onChain ? (
        <div className="proof-result">
          <strong>On-chain record: {String(result.onChain.status ?? 'unknown').replaceAll('_', ' ')}</strong>
          <span>{result.onChain.verificationCount ?? 0} verification signals / {result.onChain.updateCount ?? 0} status updates</span>
          <span>{result.evidenceAvailable ? `${result.evidenceByteLength ?? 0} delivered evidence bytes checked` : `Delivered evidence unavailable: ${(result.evidenceError ?? 'unknown').replaceAll('_', ' ')}`}</span>
          <div className="proof-checks">
            {checks.map(([label, ok]) => (
              <span key={String(label)} className={ok ? 'proof-ok' : 'proof-bad'}>
                {ok ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />}
                {label} {ok ? 'matches' : 'mismatch'}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <details className="proof-details">
        <summary>Technical proof details</summary>
        <div className="proof-detail-body">
          {rows.map(([label, value]) => (
            <div className="hash-row" key={label}>
              <span className="muted">{label}</span>
              <code className="mono">{label === 'Proof anchored' ? value : shortText(value, 14, 14)}</code>
            </div>
          ))}
          {result?.onChain ? (
            <>
              <div className="hash-row">
                <span className="muted">On-chain timeline</span>
                <code className="mono">{shortText(result.onChain.timelineHash, 14, 14)}</code>
              </div>
              <div className="hash-row">
                <span className="muted">On-chain resolution</span>
                <code className="mono">{shortText(result.onChain.resolutionHash, 14, 14)}</code>
              </div>
            </>
          ) : null}
          <div className="row-actions technical-actions">
            <a className="button secondary" href={rawJsonUrl} target="_blank" rel="noreferrer"><FileJs size={17} weight="bold" />Raw JSON</a>
            {issueAddress ? <a className="button secondary" href={issueAddress} target="_blank" rel="noreferrer"><ArrowSquareOut size={17} weight="bold" />Issue account</a> : null}
            {createTx ? <a className="button secondary" href={createTx} target="_blank" rel="noreferrer">Create tx</a> : null}
            {latestTx ? <a className="button secondary" href={latestTx} target="_blank" rel="noreferrer">Latest tx</a> : null}
          </div>
        </div>
      </details>
    </section>
  );
}
