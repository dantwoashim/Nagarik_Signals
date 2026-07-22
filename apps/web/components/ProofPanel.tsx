'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowClockwise,
  ArrowSquareOut,
  CheckCircle,
  Circle,
  FileJs,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import type { CivicIssue, ProofVerificationResponse } from '@/lib/types';
import { addressUrl, formatDateTime, shortText, txUrl } from '@/lib/ui/format';

type ProofRequestResult = { responseOk: boolean; payload: ProofVerificationResponse };
const inFlightProofChecks = new Map<string, Promise<ProofRequestResult>>();

function requestProof(url: string) {
  const existing = inFlightProofChecks.get(url);
  if (existing) return existing;
  const request = fetch(url, { cache: 'no-store' })
    .then(async (response) => ({ responseOk: response.ok, payload: await response.json() as ProofVerificationResponse }))
    .finally(() => {
      if (inFlightProofChecks.get(url) === request) inFlightProofChecks.delete(url);
    });
  inFlightProofChecks.set(url, request);
  return request;
}

function resultLabel(result: ProofVerificationResponse | null, checking: boolean, sample: boolean) {
  if (checking) return 'Checking';
  if (!result) return 'Waiting';
  if (result.ok) return sample ? 'Local match' : 'Live match';
  if (result.mode === 'evidence_unavailable') return 'Incomplete check';
  return result.error ? 'Unavailable' : 'Mismatch';
}

function resultClass(result: ProofVerificationResponse | null, sample: boolean) {
  if (!result) return sample ? 'status-disputed' : '';
  if (result.ok) return 'proof-ok';
  if (result.mode === 'evidence_unavailable') return 'status-disputed';
  return 'proof-bad';
}

export function ProofPanel({ issue }: { issue: CivicIssue }) {
  const sample = issue.proof.proofStatus === 'seeded_demo';
  const rawJsonUrl = `/api/verify-proof/${encodeURIComponent(issue.id)}`;
  const sectionRef = useRef<HTMLElement>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const startedRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ProofVerificationResponse | null>(null);
  const [message, setMessage] = useState('Ready to check the delivered evidence and public record.');
  const issueAddress = addressUrl(issue.proof.issuePda);
  const createTx = txUrl(issue.proof.createTxSig);
  const latestTx = txUrl(issue.proof.latestTxSig);

  const runProofCheck = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setChecking(true);
    setMessage('Checking the delivered evidence and public record...');
    try {
      const { responseOk, payload } = await requestProof(rawJsonUrl);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setResult(payload);
      if (responseOk && payload.ok) {
        const bytes = typeof payload.evidenceByteLength === 'number'
          ? `${payload.evidenceByteLength.toLocaleString()} evidence bytes and `
          : '';
        setMessage(sample ? 'The sample evidence and issue details match their stored hashes.' : `${bytes}the current public record match.`);
      } else if (payload.mode === 'evidence_unavailable') {
        setMessage('The evidence file could not be retrieved, so this check is incomplete.');
      } else {
        setMessage(payload.error?.replaceAll('_', ' ') ?? 'The public record does not match every stored commitment.');
      }
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const detail = error instanceof Error ? error.message : 'proof check failed';
      setResult({ ok: false, error: detail });
      setMessage('The live integrity check is temporarily unavailable.');
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setChecking(false);
    }
  }, [rawJsonUrl, sample]);

  useEffect(() => {
    mountedRef.current = true;
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (startedRef.current || !entries.some((entry) => entry.isIntersecting)) return;
      startedRef.current = true;
      observer.disconnect();
      void runProofCheck();
    }, { rootMargin: '500px' });
    observer.observe(node);
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      startedRef.current = false;
      observer.disconnect();
    };
  }, [runProofCheck]);

  const chainMatches = useMemo(() => {
    if (!result || sample) return undefined;
    const checks = [
      result.storedEvidenceMatchesOnChain,
      result.locationMatches,
      result.timelineMatches,
      result.resolutionMatches,
      result.statusMatches,
      result.countMatches,
    ];
    if (!checks.every((value) => typeof value === 'boolean')) return undefined;
    return checks.every(Boolean);
  }, [result, sample]);

  const visibleChecks: Array<[string, boolean | undefined]> = [
    ['Evidence unchanged', result?.evidenceMatches],
    ['Issue details unchanged', result?.metadataMatches],
    [sample ? 'Stored sample hashes' : 'Current Solana record', sample ? result?.ok : chainMatches],
  ];

  const technicalChecks: Array<[string, boolean]> = result
    ? ([
        ['Metadata', result.metadataMatches],
        ['Delivered evidence bytes', result.evidenceMatches],
        ['Stored evidence hash', result.storedEvidenceMatchesOnChain],
        ['Approximate location', result.locationMatches],
        ['Record status', result.statusMatches],
        ['Account counts', result.countMatches],
        ['Timeline commitment', result.timelineMatches],
        ['Resolution commitment', result.resolutionMatches],
      ] as Array<[string, boolean | null | undefined]>).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
      )
    : [];

  const verdictClass = !result
    ? 'proof-verdict'
    : result.ok
      ? 'proof-verdict proof-ok'
      : result.mode === 'evidence_unavailable' || result.error
        ? 'proof-verdict proof-warning'
        : 'proof-verdict proof-bad';

  const rows = [
    ['Checked', result?.checkedAt ? formatDateTime(result.checkedAt) : 'Waiting'],
    ['Network', sample ? 'Local sample' : result?.network ?? 'Solana devnet'],
    ['Program', result?.programId ?? 'Not returned'],
    ['Issue PDA', issue.proof.issuePda],
    ['Metadata hash', issue.proof.metadataHash],
    ['Evidence hash', issue.proof.evidenceHash],
    ['Location hash', issue.proof.locationHash],
    ['Timeline hash', issue.proof.timelineHash],
    ['Proof anchored', formatDateTime(issue.proofAnchoredAt)],
  ];

  return (
    <section ref={sectionRef} id="proof" className="panel pad proof-panel record-integrity" aria-busy={checking}>
      <div className="proof-panel-heading">
        <div>
          <span className="eyebrow">{sample ? 'Sample integrity' : 'Live integrity check'}</span>
          <h2>Record integrity</h2>
        </div>
        <span className={`pill ${resultClass(result, sample)}`}>{resultLabel(result, checking, sample)}</span>
      </div>

      <p className="proof-explainer">
        {sample
          ? 'Checks whether this sample still matches its stored evidence and issue details.'
          : 'Checks whether this page still matches its delivered evidence and Solana record.'}
      </p>

      <div className="integrity-checks">
        {visibleChecks.map(([label, matches]) => (
          <div key={label} className={checking ? 'checking' : matches === true ? 'match' : matches === false ? 'mismatch' : 'pending'}>
            {checking
              ? <SpinnerGap className="progress-spinner" size={18} weight="bold" />
              : matches === true
                ? <CheckCircle size={18} weight="fill" />
                : matches === false
                  ? <WarningCircle size={18} weight="fill" />
                  : <Circle size={18} weight="regular" />}
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className={verdictClass} role="status">
        {message}
      </div>

      <p className="proof-boundary">
        {sample
          ? 'This check confirms local sample consistency. It does not claim a live Solana record or a real civic observation.'
          : 'This check confirms that the public record matches its Solana commitment. It does not confirm that the report is true, identify a resident, or prove that an authority acted.'}
      </p>

      <button type="button" className="button secondary proof-refresh" onClick={runProofCheck} disabled={checking}>
        <ArrowClockwise size={17} weight="bold" /> {checking ? 'Checking...' : result ? 'Check again' : 'Check now'}
      </button>

      <details className="proof-details">
        <summary>Technical record</summary>
        <div className="proof-detail-body">
          {technicalChecks.length ? (
            <div className="proof-checks">
              {technicalChecks.map(([label, matches]) => (
                <span key={label} className={matches ? 'proof-ok' : 'proof-bad'}>
                  {matches ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />}
                  {label} {matches ? 'matches' : 'mismatch'}
                </span>
              ))}
            </div>
          ) : null}
          {rows.map(([label, value]) => (
            <div className="hash-row" key={label}>
              <span className="muted">{label}</span>
              <code className="mono">{label === 'Checked' || label === 'Network' || label === 'Proof anchored' ? value : shortText(value, 14, 14)}</code>
            </div>
          ))}
          <div className="row-actions technical-actions">
            <a className="button secondary" href={rawJsonUrl} target="_blank" rel="noreferrer"><FileJs size={17} weight="bold" /> Raw JSON</a>
            {issueAddress ? <a className="button secondary" href={issueAddress} target="_blank" rel="noreferrer"><ArrowSquareOut size={17} weight="bold" /> Issue account</a> : null}
            {createTx ? <a className="button secondary" href={createTx} target="_blank" rel="noreferrer">Create transaction</a> : null}
            {latestTx ? <a className="button secondary" href={latestTx} target="_blank" rel="noreferrer">Latest transaction</a> : null}
          </div>
        </div>
      </details>
    </section>
  );
}
