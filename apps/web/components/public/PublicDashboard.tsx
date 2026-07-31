'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, ChartBar, MapPin, Pulse } from '@phosphor-icons/react';

import { PublicIssueRow } from './PublicIssueRow';
import { readPublicApi } from '@/lib/public/api';
import {
  categoryName,
  type PublicIssueStats,
  type PublicIssueSummary,
} from '@/lib/public/contracts';

type ListResponse = {
  items: PublicIssueSummary[];
  nextCursor: string | null;
};

export function PublicDashboard() {
  const [stats, setStats] = useState<PublicIssueStats | null>(null);
  const [issues, setIssues] = useState<PublicIssueSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  async function load() {
    setState('loading');
    try {
      const [totals, list] = await Promise.all([
        readPublicApi<PublicIssueStats>('/api/v2/issues/stats'),
        readPublicApi<ListResponse>('/api/v2/issues?limit=8'),
      ]);
      setStats(totals);
      setIssues(list.items);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      readPublicApi<PublicIssueStats>('/api/v2/issues/stats', {
        signal: controller.signal,
      }),
      readPublicApi<ListResponse>('/api/v2/issues?limit=8', {
        signal: controller.signal,
      }),
    ])
      .then(([totals, list]) => {
        setStats(totals);
        setIssues(list.items);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, []);

  const maximumCategory = Math.max(1, ...(stats?.categories.map((item) => item.total) ?? [1]));

  return (
    <section className="container page-section prod-dashboard">
      <header className="prod-page-heading">
        <div>
          <span className="eyebrow">
            <ChartBar size={15} weight="bold" /> Public insights
          </span>
          <h1>Where follow-up stands</h1>
          <p>Counts come from reviewed public records. Private reports are excluded.</p>
        </div>
      </header>

      {state === 'error' ? (
        <div className="prod-service-state" role="status">
          <div>
            <strong>Public insights are temporarily unavailable.</strong>
            <span>No private data is used as a fallback.</span>
          </div>
          <button className="button secondary" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <dl className="prod-metric-strip" aria-label="Public civic totals">
            <div>
              <dt>Public records</dt>
              <dd>{state === 'loading' ? '...' : (stats?.total ?? 0)}</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{state === 'loading' ? '...' : (stats?.open ?? 0)}</dd>
            </div>
            <div>
              <dt>In progress</dt>
              <dd>{state === 'loading' ? '...' : (stats?.inProgress ?? 0)}</dd>
            </div>
            <div>
              <dt>Resolved</dt>
              <dd>{state === 'loading' ? '...' : (stats?.resolved ?? 0)}</dd>
            </div>
            <div>
              <dt>Attention signals</dt>
              <dd>{state === 'loading' ? '...' : (stats?.signals ?? 0)}</dd>
            </div>
          </dl>

          <div className="prod-dashboard-grid">
            <section className="prod-data-section" aria-labelledby="category-heading">
              <header>
                <div>
                  <span className="eyebrow">Issue mix</span>
                  <h2 id="category-heading">Records by category</h2>
                </div>
              </header>
              <div className="prod-bars">
                {stats?.categories.length ? (
                  stats.categories.map((item) => (
                    <div key={item.category}>
                      <span>{categoryName(item.category)}</span>
                      <i aria-hidden="true">
                        <b
                          style={{
                            transform: `scaleX(${item.total / maximumCategory})`,
                          }}
                        />
                      </i>
                      <strong>{item.total}</strong>
                    </div>
                  ))
                ) : (
                  <p className="muted">No category totals yet.</p>
                )}
              </div>
            </section>

            <section className="prod-data-section" aria-labelledby="area-heading">
              <header>
                <div>
                  <span className="eyebrow">
                    <MapPin size={14} weight="fill" /> Areas
                  </span>
                  <h2 id="area-heading">Public records by area</h2>
                </div>
              </header>
              <div className="prod-area-table">
                {stats?.wards.length ? (
                  stats.wards.slice(0, 8).map((item, index) => (
                    <div key={item.id}>
                      <span className="mono">{String(index + 1).padStart(2, '0')}</span>
                      <strong>{item.label}</strong>
                      <span>{item.total}</span>
                    </div>
                  ))
                ) : (
                  <p className="muted">No area totals yet.</p>
                )}
              </div>
            </section>
          </div>

          <section className="prod-recent-records" aria-labelledby="recent-records-heading">
            <header className="prod-section-heading">
              <div>
                <span className="eyebrow">
                  <Pulse size={14} weight="bold" /> Recent records
                </span>
                <h2 id="recent-records-heading">Latest public activity</h2>
              </div>
              <Link className="text-link" href="/explore">
                View all <ArrowRight size={16} weight="bold" />
              </Link>
            </header>
            {issues.length ? (
              <div className="prod-record-list">
                {issues.map((issue) => (
                  <PublicIssueRow key={issue.publicId} issue={issue} />
                ))}
              </div>
            ) : state === 'loading' ? (
              <div className="prod-list-skeleton" role="status">
                Loading public activity
              </div>
            ) : (
              <div className="prod-service-state">
                <div>
                  <strong>No public activity yet.</strong>
                  <span>Reviewed records will appear here.</span>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
