'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  Fingerprint,
  ImageSquare,
  MapPin,
  Newspaper,
  PaperPlaneTilt,
  ShieldCheck,
  ShieldWarning,
  WarningCircle,
} from '@phosphor-icons/react';

import { PublicLocation } from './PublicLocation';
import { SignalButton } from './SignalButton';
import { PublicApiError, readPublicApi } from '@/lib/public/api';
import {
  categoryName,
  formatPublicDate,
  lifecycleLabel,
  publicWard,
  type PublicIssueDetail,
  type PublicIssueTombstone,
  type PublicProof,
} from '@/lib/public/contracts';

type DetailState = PublicIssueDetail | PublicIssueTombstone;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function eventLabel(value: string) {
  const labels: Record<string, string> = {
    published: 'Public record created',
    approved: 'Public version approved',
    lifecycle_changed: 'Status updated',
    handoff_checkpointed: 'Official follow-up recorded',
    metadata_version_committed: 'Public record corrected',
    publication_removed: 'Public content removed',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

function eventSummary(value: unknown) {
  const event = objectValue(value);
  for (const key of ['publicMessage', 'publicSafeMessage', 'reason', 'note', 'summary']) {
    if (typeof event[key] === 'string' && event[key]) return event[key] as string;
  }
  if (typeof event.state === 'string') return `State: ${event.state.replaceAll('_', ' ')}`;
  return 'Public event recorded.';
}

function shortHash(value: string | null) {
  if (!value) return 'Unavailable';
  return `${value.slice(0, 12)}...${value.slice(-10)}`;
}

export function PublicIssueRecord({ publicId }: { publicId: string }) {
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [detailState, setDetailState] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    'loading',
  );
  const [proof, setProof] = useState<PublicProof | null>(null);
  const [proofState, setProofState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  function loadDetail() {
    setDetailState('loading');
    readPublicApi<DetailState>(`/api/v2/issues/${publicId}`)
      .then((result) => {
        setDetail(result);
        setDetailState('ready');
      })
      .catch((error: unknown) => {
        setDetailState(
          error instanceof PublicApiError && error.status === 404 ? 'missing' : 'error',
        );
      });
  }

  function loadProof() {
    setProofState('loading');
    readPublicApi<PublicProof>(`/api/v2/issues/${publicId}/proof`)
      .then((result) => {
        setProof(result);
        setProofState('ready');
      })
      .catch(() => setProofState('error'));
  }

  useEffect(() => {
    const controller = new AbortController();
    let detailLoaded = false;
    readPublicApi<DetailState>(`/api/v2/issues/${publicId}`, {
      signal: controller.signal,
    })
      .then((result) => {
        detailLoaded = true;
        setDetail(result);
        setDetailState('ready');
        if (result.proofAvailable) {
          setProofState('loading');
          return readPublicApi<PublicProof>(`/api/v2/issues/${publicId}/proof`, {
            signal: controller.signal,
          });
        }
        return null;
      })
      .then((result) => {
        if (result) {
          setProof(result);
          setProofState('ready');
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!detailLoaded) {
          setDetailState(
            error instanceof PublicApiError && error.status === 404 ? 'missing' : 'error',
          );
        } else {
          setProofState('error');
        }
      });
    return () => controller.abort();
  }, [publicId]);

  const proofMatches = useMemo(() => {
    if (!proof) return false;
    return (
      proof.checks.metadata.status === 'match' &&
      proof.checks.location.status === 'match' &&
      proof.checks.evidence.status === 'match'
    );
  }, [proof]);

  if (detailState === 'loading') {
    return (
      <div className="container page-section prod-record-state" role="status">
        <span className="prod-inline-spinner" aria-hidden="true" />
        Loading public record
      </div>
    );
  }

  if (detailState === 'missing') {
    return (
      <div className="container page-section prod-record-state">
        <ShieldWarning size={30} weight="regular" />
        <div>
          <strong>Public record unavailable</strong>
          <span>No reviewed public issue is available at this address.</span>
        </div>
        <Link className="button secondary" href="/explore">
          <ArrowLeft size={17} weight="bold" /> Explore records
        </Link>
      </div>
    );
  }

  if (detailState === 'error' || !detail) {
    return (
      <div className="container page-section prod-record-state" role="status">
        <WarningCircle size={30} weight="regular" />
        <div>
          <strong>Public record temporarily unavailable</strong>
          <span>Try again when the public service is reachable.</span>
        </div>
        <button className="button secondary" type="button" onClick={loadDetail}>
          Try again
        </button>
      </div>
    );
  }

  if ('tombstone' in detail) {
    const tombstone = objectValue(detail.tombstone);
    return (
      <section className="container page-section prod-tombstone">
        <span className="eyebrow">
          <ShieldWarning size={15} weight="bold" /> Public content removed
        </span>
        <h1>This record is no longer publicly available</h1>
        <p>
          {typeof tombstone.message === 'string'
            ? tombstone.message
            : 'A neutral removal record remains so the public history does not silently disappear.'}
        </p>
        <dl>
          <div>
            <dt>Record ID</dt>
            <dd className="mono">{detail.publicId}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatPublicDate(detail.updatedAt)}</dd>
          </div>
          <div>
            <dt>Integrity record</dt>
            <dd>{detail.proofAvailable ? 'Retained' : 'Unavailable'}</dd>
          </div>
        </dl>
        <Link className="button secondary" href="/explore">
          <ArrowLeft size={17} weight="bold" /> Explore records
        </Link>
      </section>
    );
  }

  const ward = publicWard(detail.ward);
  const provenance = objectValue(detail.provenance);
  const recordKind =
    typeof provenance.recordKind === 'string' ? provenance.recordKind : 'community_report';
  const source =
    recordKind === 'public_source' ? objectValue(provenance.source ?? provenance) : null;
  const observedOn =
    typeof provenance.observedOn === 'string' ? provenance.observedOn : detail.publishedAt;
  const lifecycle = detail.lifecycle ?? detail.legacyStatus ?? 'open';

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="container page-section prod-issue">
      <header className="prod-issue-heading">
        <Link className="prod-back-link" href="/explore">
          <ArrowLeft size={16} weight="bold" /> All records
        </Link>
        <div className="prod-issue-badges">
          <span className={`prod-state prod-state-${lifecycle}`}>{lifecycleLabel(detail)}</span>
          <span>{categoryName(detail.category)}</span>
          <span>{recordKind === 'public_source' ? 'Public source' : 'Community report'}</span>
        </div>
        <h1>{detail.title ?? 'Public civic record'}</h1>
        <p>{detail.narrative ?? detail.summary}</p>
        <div className="prod-issue-actions">
          <button className="button secondary" type="button" onClick={() => void copyLink()}>
            {copied ? <CheckCircle size={17} weight="fill" /> : <Copy size={17} weight="bold" />}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
        <dl className="prod-issue-facts">
          <div>
            <dt>Current status</dt>
            <dd>{lifecycleLabel(detail)}</dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>{ward.label}</dd>
          </div>
          <div>
            <dt>Public attention</dt>
            <dd>{detail.signalCount} signals</dd>
          </div>
          <div>
            <dt>Integrity</dt>
            <dd>
              {proofState === 'ready' ? (proofMatches ? 'Matches' : 'Check details') : 'Checking'}
            </dd>
          </div>
        </dl>
      </header>

      <nav className="prod-issue-nav" aria-label="Record sections">
        {detail.mediaUrl ? (
          <a href="#evidence">
            <ImageSquare size={16} weight="bold" /> Evidence
          </a>
        ) : null}
        <a href="#activity">
          <ClockCounterClockwise size={16} weight="bold" /> History
        </a>
        <a href="#location">
          <MapPin size={16} weight="fill" /> Location
        </a>
        <a href="#integrity">
          <Fingerprint size={16} weight="bold" /> Integrity
        </a>
      </nav>

      <div className="prod-issue-body">
        {detail.mediaUrl ? (
          <figure id="evidence" className="prod-issue-evidence">
            <div>
              <Image
                src={detail.mediaUrl}
                alt={`Reviewed public evidence for ${detail.title ?? 'this civic record'}`}
                fill
                priority
                sizes="(max-width: 900px) 100vw, 1120px"
              />
            </div>
            <figcaption>
              <span>Reviewed public derivative</span>
              <span>{ward.label}</span>
            </figcaption>
          </figure>
        ) : (
          <div className="prod-media-unavailable">
            <ShieldWarning size={28} weight="regular" />
            <div>
              <strong>Public media unavailable</strong>
              <span>The record and integrity history remain accessible.</span>
            </div>
          </div>
        )}

        {source ? (
          <section className="prod-issue-section prod-source" aria-labelledby="source-heading">
            <header>
              <span className="eyebrow">
                <Newspaper size={14} weight="bold" /> Provenance
              </span>
              <h2 id="source-heading">Original public source</h2>
            </header>
            <dl>
              <div>
                <dt>Publisher</dt>
                <dd>{typeof source.publisher === 'string' ? source.publisher : 'Public source'}</dd>
              </div>
              <div>
                <dt>Last checked</dt>
                <dd>
                  {formatPublicDate(typeof source.checkedAt === 'string' ? source.checkedAt : null)}
                </dd>
              </div>
            </dl>
            {typeof source.sourceUrl === 'string' ? (
              <a
                className="button secondary"
                href={source.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open source
              </a>
            ) : null}
          </section>
        ) : null}

        <SignalButton publicId={detail.publicId} initialCount={detail.signalCount} />

        <section id="activity" className="prod-issue-section" aria-labelledby="activity-heading">
          <header className="prod-section-heading">
            <div>
              <span className="eyebrow">
                <ClockCounterClockwise size={14} weight="bold" /> Activity
              </span>
              <h2 id="activity-heading">Public history</h2>
            </div>
            <span>
              {detail.events.length} event{detail.events.length === 1 ? '' : 's'}
            </span>
          </header>
          <ol className="prod-event-list">
            <li>
              <span>
                <CalendarBlank size={17} weight="bold" />
              </span>
              <div>
                <strong>Issue observed</strong>
                <p>Initial observation date recorded in the reviewed public version.</p>
                <time>{formatPublicDate(typeof observedOn === 'string' ? observedOn : null)}</time>
              </div>
            </li>
            {detail.events.map((event) => (
              <li key={event.id}>
                <span>
                  {event.type.includes('handoff') ? (
                    <PaperPlaneTilt size={17} weight="bold" />
                  ) : (
                    <ShieldCheck size={17} weight="bold" />
                  )}
                </span>
                <div>
                  <strong>{eventLabel(event.type)}</strong>
                  <p>{eventSummary(event.data)}</p>
                  <time>{formatPublicDate(event.occurredAt)}</time>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div id="location">
          <PublicLocation location={detail.location} ward={detail.ward} />
        </div>

        <section id="integrity" className="prod-proof" aria-labelledby="integrity-heading">
          <header className="prod-section-heading">
            <div>
              <span className="eyebrow">
                <Fingerprint size={14} weight="bold" /> Solana integrity
              </span>
              <h2 id="integrity-heading">Independent record check</h2>
            </div>
            {proofState === 'ready' ? (
              <span
                className={proofMatches ? 'prod-proof-state match' : 'prod-proof-state warning'}
              >
                {proofMatches ? (
                  <CheckCircle size={16} weight="fill" />
                ) : (
                  <ShieldWarning size={16} />
                )}
                {proofMatches ? 'Public bytes match' : 'Review check'}
              </span>
            ) : null}
          </header>

          {proofState === 'loading' ? (
            <div className="prod-proof-loading" role="status">
              <span className="prod-inline-spinner" aria-hidden="true" />
              Checking evidence, metadata, location, and chain binding
            </div>
          ) : proofState === 'error' ? (
            <div className="prod-service-state" role="status">
              <div>
                <strong>Integrity check temporarily unavailable.</strong>
                <span>The public record remains readable.</span>
              </div>
              <button className="button secondary" type="button" onClick={loadProof}>
                Check again
              </button>
            </div>
          ) : proof ? (
            <>
              <div className="prod-proof-checks">
                {[
                  ['Evidence bytes', proof.checks.evidence.status],
                  ['Public metadata', proof.checks.metadata.status],
                  ['Approximate location', proof.checks.location.status],
                  ['Solana binding', proof.checks.chain.status],
                ].map(([label, status]) => (
                  <div key={label}>
                    <span>
                      {status === 'match' ||
                      status === 'confirmed' ||
                      status === 'finalized_binding_recorded' ? (
                        <CheckCircle size={18} weight="fill" />
                      ) : (
                        <ShieldWarning size={18} />
                      )}
                    </span>
                    <strong>{label}</strong>
                    <small>{status.replaceAll('_', ' ')}</small>
                  </div>
                ))}
              </div>
              <div className="prod-proof-boundary">
                <ShieldCheck size={20} weight="regular" />
                <p>{proof.boundary.truth}</p>
              </div>
              <details className="prod-proof-technical">
                <summary>Technical record</summary>
                <dl>
                  <div>
                    <dt>Protocol</dt>
                    <dd>{proof.protocolVersion}</dd>
                  </div>
                  <div>
                    <dt>Network profile</dt>
                    <dd>{proof.checks.chain.cluster}</dd>
                  </div>
                  <div>
                    <dt>Issue account</dt>
                    <dd className="mono">{proof.checks.chain.issueAccount}</dd>
                  </div>
                  <div>
                    <dt>Transaction</dt>
                    <dd className="mono">{proof.checks.chain.signature}</dd>
                  </div>
                  <div>
                    <dt>Metadata hash</dt>
                    <dd className="mono">{shortHash(proof.checks.metadata.expectedHash)}</dd>
                  </div>
                  <div>
                    <dt>Evidence hash</dt>
                    <dd className="mono">{shortHash(proof.checks.evidence.expectedHash)}</dd>
                  </div>
                  <div>
                    <dt>Location hash</dt>
                    <dd className="mono">{shortHash(proof.checks.location.expectedHash)}</dd>
                  </div>
                  <div>
                    <dt>Checked</dt>
                    <dd>{formatPublicDate(proof.checkedAt)}</dd>
                  </div>
                </dl>
              </details>
            </>
          ) : (
            <p className="muted">No integrity record is attached.</p>
          )}
        </section>
      </div>
    </article>
  );
}
