'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Camera, Fingerprint, MapTrifold, PaperPlaneTilt } from '@phosphor-icons/react';

import { PublicMap } from './PublicMap';
import { readPublicApi } from '@/lib/public/api';
import type { PublicIssueStats, PublicIssueSummary } from '@/lib/public/contracts';

type ListResponse = {
  items: PublicIssueSummary[];
  nextCursor: string | null;
};

export function PublicHome() {
  const [issues, setIssues] = useState<PublicIssueSummary[]>([]);
  const [stats, setStats] = useState<PublicIssueStats | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  async function load(signal?: AbortSignal) {
    setState('loading');
    try {
      const [list, totals] = await Promise.all([
        readPublicApi<ListResponse>('/api/v2/issues?limit=50', { signal }),
        readPublicApi<PublicIssueStats>('/api/v2/issues/stats', { signal }),
      ]);
      setIssues(list.items);
      setStats(totals);
      setState('ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      readPublicApi<ListResponse>('/api/v2/issues?limit=50', {
        signal: controller.signal,
      }),
      readPublicApi<PublicIssueStats>('/api/v2/issues/stats', {
        signal: controller.signal,
      }),
    ])
      .then(([list, totals]) => {
        setIssues(list.items);
        setStats(totals);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="prod-home">
      <section className="prod-command">
        <div className="container prod-command-grid">
          <div>
            <span className="prod-live-label">
              <i aria-hidden="true" />
              Public civic record
            </span>
            <h1>Nagarik Signal</h1>
            <p>Track civic issues from reviewed evidence to public follow-up.</p>
          </div>
          <div className="prod-command-actions">
            <Link className="button primary" href="/report">
              Report an issue <ArrowRight size={17} weight="bold" />
            </Link>
            <Link className="button secondary" href="/explore">
              <MapTrifold size={17} weight="bold" /> Explore map
            </Link>
          </div>
          <dl className="prod-command-stats" aria-label="Public record summary">
            <div>
              <dt>Public records</dt>
              <dd>{state === 'loading' ? '...' : (stats?.total ?? 0)}</dd>
            </div>
            <div>
              <dt>Need follow-up</dt>
              <dd>{state === 'loading' ? '...' : (stats?.open ?? 0) + (stats?.inProgress ?? 0)}</dd>
            </div>
            <div>
              <dt>Resolved</dt>
              <dd>{state === 'loading' ? '...' : (stats?.resolved ?? 0)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="container prod-home-map" aria-labelledby="public-map-heading">
        <header className="prod-section-heading">
          <div>
            <span className="eyebrow">
              <MapTrifold size={15} weight="bold" /> Public map
            </span>
            <h2 id="public-map-heading">See where follow-up is needed</h2>
          </div>
          <Link className="text-link" href="/explore">
            Open all records <ArrowRight size={16} weight="bold" />
          </Link>
        </header>
        {state === 'loading' ? (
          <div className="prod-map-skeleton" role="status">
            Loading public records
          </div>
        ) : state === 'error' ? (
          <div className="prod-service-state" role="status">
            <div>
              <strong>Public records are temporarily unavailable.</strong>
              <span>The reporting and proof services remain safely closed.</span>
            </div>
            <button className="button secondary" type="button" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <PublicMap issues={issues} compact />
        )}
      </section>

      <section className="prod-process" aria-labelledby="public-process-heading">
        <div className="container prod-process-grid">
          <div className="prod-process-heading">
            <span className="eyebrow">From report to follow-up</span>
            <h2 id="public-process-heading">A clear public history</h2>
          </div>
          <div className="prod-process-steps">
            <article>
              <Camera size={22} weight="regular" />
              <span className="mono">01</span>
              <h3>Send</h3>
              <p>Add a safe photo and approximate place for private review.</p>
            </article>
            <article>
              <Fingerprint size={22} weight="regular" />
              <span className="mono">02</span>
              <h3>Review</h3>
              <p>Approved public details receive an independent integrity record.</p>
            </article>
            <article>
              <PaperPlaneTilt size={22} weight="regular" />
              <span className="mono">03</span>
              <h3>Follow up</h3>
              <p>Signals, official routing, and status changes stay visibly separate.</p>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
