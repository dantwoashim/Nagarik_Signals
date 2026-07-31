'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Eye,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';

import { PublicApiError, readPublicApi } from '@/lib/public/api';

type TrackingData = {
  trackingId: string;
  state: string;
  currentRevision: number;
  receivedAt: string;
  updatedAt: string;
  media: { state: string };
  publicIssueId: string | null;
  next: string;
};

const stateCopy: Record<string, { label: string; detail: string }> = {
  received: {
    label: 'Received',
    detail: 'The private report is waiting for its first review.',
  },
  under_review: {
    label: 'Under review',
    detail: 'A moderator is reviewing the report and private evidence.',
  },
  changes_requested: {
    label: 'Changes requested',
    detail: 'The report needs an update before review can continue.',
  },
  revision_pending: {
    label: 'Update received',
    detail: 'The revised private report is waiting for review.',
  },
  approved: {
    label: 'Approved',
    detail: 'A reviewed public version is being prepared and anchored.',
  },
  rejected: {
    label: 'Closed after review',
    detail: 'This report will not be published.',
  },
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));
}

export function TrackingRecord({ trackingId }: { trackingId: string }) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  function load() {
    setState('loading');
    readPublicApi<TrackingData>(`/api/v2/submissions/${trackingId}`)
      .then((result) => {
        setData(result);
        setState('ready');
      })
      .catch((error: unknown) => {
        setState(error instanceof PublicApiError && error.status === 404 ? 'missing' : 'error');
      });
  }

  useEffect(() => {
    readPublicApi<TrackingData>(`/api/v2/submissions/${trackingId}`)
      .then((result) => {
        setData(result);
        setState('ready');
      })
      .catch((error: unknown) => {
        setState(error instanceof PublicApiError && error.status === 404 ? 'missing' : 'error');
      });
  }, [trackingId]);

  if (state === 'loading') {
    return (
      <div className="prod-tracking-state" role="status">
        <span className="prod-inline-spinner" aria-hidden="true" />
        Loading private tracking record
      </div>
    );
  }

  if (state === 'missing') {
    return (
      <div className="prod-tracking-state">
        <ShieldCheck size={28} weight="regular" />
        <div>
          <strong>Tracking record unavailable</strong>
          <span>Open this page in the browser used to send the report.</span>
        </div>
        <Link className="button secondary" href="/report">
          Return to reporting
        </Link>
      </div>
    );
  }

  if (state === 'error' || !data) {
    return (
      <div className="prod-tracking-state" role="status">
        <WarningCircle size={28} weight="regular" />
        <div>
          <strong>Tracking is temporarily unavailable.</strong>
          <span>Your private tracking capability remains in this browser.</span>
        </div>
        <button className="button secondary" type="button" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  const copy = stateCopy[data.state] ?? {
    label: data.state.replaceAll('_', ' '),
    detail: 'The private workflow has been updated.',
  };
  const publicId = data.publicIssueId?.replace(/^issue_/, '') ?? null;

  return (
    <div className="prod-tracking-record">
      <section className="prod-tracking-summary">
        <div className="prod-tracking-icon">
          {data.state === 'approved' ? (
            <CheckCircle size={28} weight="fill" />
          ) : (
            <Clock size={28} weight="regular" />
          )}
        </div>
        <div>
          <span>Current status</span>
          <h2>{copy.label}</h2>
          <p>{copy.detail}</p>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Refresh"
          aria-label="Refresh"
          onClick={load}
        >
          <Eye size={19} weight="bold" />
        </button>
      </section>

      <dl className="prod-tracking-facts">
        <div>
          <dt>Received</dt>
          <dd>{displayDate(data.receivedAt)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{displayDate(data.updatedAt)}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{data.currentRevision}</dd>
        </div>
        <div>
          <dt>Private media</dt>
          <dd>{data.media.state.replaceAll('_', ' ')}</dd>
        </div>
      </dl>

      <div className="prod-tracking-boundary">
        <ShieldCheck size={20} weight="regular" />
        <div>
          <strong>This page is private</strong>
          <span>
            The tracking capability is stored in this browser. It does not reveal the report to
            other visitors.
          </span>
        </div>
      </div>

      {publicId ? (
        <Link className="button primary" href={`/issues/${publicId}`}>
          Open public record <ArrowRight size={17} weight="bold" />
        </Link>
      ) : null}
    </div>
  );
}
