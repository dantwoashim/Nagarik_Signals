'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ClockCounterClockwise,
  Eye,
  FileText,
  Flag,
  MapPin,
  PaperPlaneTilt,
  ShieldCheck,
  ShieldWarning,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';

import { OperatorApiError, readOperatorApi } from '@/lib/operator/api';

type OperatorIssue = {
  publicId: string;
  roles: string[];
  publicationState: string;
  lifecycle: 'open' | 'in_progress' | 'resolved' | 'closed' | 'disputed';
  domainVersion: number;
  checkpointUpdateCount: number;
  confirmedUpdateCount: number;
  projectedTimelineHead: string;
  projectedHandoffHead: string;
  blockedFromSequence: number | null;
  createdAt: string;
  updatedAt: string;
  version: {
    id: string;
    number: number;
    title: string;
    narrative: string;
    category: string;
    wardId: string;
    wardLabel: string;
    localityLabel: string | null;
    publicReason: string | null;
    publishedAt: string | null;
  };
  handoff: {
    state: 'prepared' | 'sent' | 'acknowledged' | 'closed' | 'failed' | null;
    version: number | null;
    publicSequence: number;
    updatedAt: string | null;
  };
  lifecycleEvents: Array<{
    id: string;
    fromState: string;
    toState: string;
    reasonCode: string;
    publicNote: string | null;
    observedAt: string | null;
    chainSequence: number;
    checkpointState: string;
    createdAt: string;
  }>;
  handoffEvents: Array<{
    id: string;
    type: string;
    publicEvent: unknown;
    publicSequence: number | null;
    chainSequence: number | null;
    checkpointState: string | null;
    createdAt: string;
  }>;
};

const lifecycleTransitions: Record<OperatorIssue['lifecycle'], OperatorIssue['lifecycle'][]> = {
  open: ['in_progress', 'disputed', 'closed'],
  in_progress: ['resolved', 'disputed', 'closed'],
  resolved: ['disputed', 'closed'],
  disputed: ['open', 'in_progress', 'resolved', 'closed'],
  closed: [],
};

const handoffTransitions: Record<string, string[]> = {
  none: ['prepared'],
  prepared: ['sent', 'failed'],
  sent: ['acknowledged', 'failed'],
  acknowledged: ['action_recorded', 'closed'],
  closed: ['action_recorded'],
  failed: [],
};

function displayDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function issueMessage(error: unknown) {
  if (error instanceof OperatorApiError) {
    if (error.status === 401) return 'Your operator session expired.';
    if (error.status === 403) return 'Your role cannot perform this action.';
    if (error.code === 'stale_resource_version') {
      return 'This record changed in another session. The latest state has been loaded.';
    }
    if (error.code === 'workflow_conflict') return 'This workflow is waiting for recovery.';
  }
  return 'The action could not be completed.';
}

function roleAllows(roles: string[], allowed: string[]) {
  return roles.includes('system_admin') || roles.some((role) => allowed.includes(role));
}

export function OperatorIssueManager({
  publicId,
  organizationId,
}: {
  publicId: string;
  organizationId: string | null;
}) {
  const [issue, setIssue] = useState<OperatorIssue | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const result = await readOperatorApi<OperatorIssue>(
      `/api/operator/issues/${encodeURIComponent(publicId)}`,
    );
    setIssue(result);
    setLoadState('ready');
    return result;
  }

  useEffect(() => {
    let active = true;
    readOperatorApi<OperatorIssue>(`/api/operator/issues/${encodeURIComponent(publicId)}`)
      .then((result) => {
        if (!active) return;
        setIssue(result);
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadState(
          error instanceof OperatorApiError && error.status === 404 ? 'missing' : 'error',
        );
      });
    return () => {
      active = false;
    };
  }, [publicId]);

  const pendingCheckpoints = issue
    ? Math.max(0, issue.checkpointUpdateCount - issue.confirmedUpdateCount)
    : 0;
  const nextLifecycles = issue ? lifecycleTransitions[issue.lifecycle] : [];
  const nextHandoffs = issue ? handoffTransitions[issue.handoff.state ?? 'none'] : [];
  const canSteward = issue ? roleAllows(issue.roles, ['steward', 'org_admin']) : false;
  const canCorrect = issue
    ? roleAllows(issue.roles, ['moderator', 'privacy_reviewer', 'org_admin'])
    : false;
  const canRemove = issue ? roleAllows(issue.roles, ['privacy_reviewer', 'org_admin']) : false;

  const combinedHistory = useMemo(() => {
    if (!issue) return [];
    return [
      ...issue.lifecycleEvents.map((event) => ({
        id: event.id,
        type: `Status: ${event.toState.replaceAll('_', ' ')}`,
        note: event.publicNote ?? event.reasonCode,
        state: event.checkpointState,
        createdAt: event.createdAt,
      })),
      ...issue.handoffEvents.map((event) => {
        const payload = objectValue(event.publicEvent);
        return {
          id: event.id,
          type: `Handoff: ${event.type.replaceAll('_', ' ')}`,
          note:
            typeof payload.publicNote === 'string'
              ? payload.publicNote
              : typeof payload.authorityName === 'string'
                ? payload.authorityName
                : 'Official follow-up event',
          state: event.checkpointState ?? 'private',
          createdAt: event.createdAt,
        };
      }),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [issue]);

  async function mutate<T>(action: string, suffix: string, body: unknown): Promise<T | null> {
    setBusy(action);
    setMessage('');
    try {
      const result = await readOperatorApi<T>(
        `/api/operator/issues/${encodeURIComponent(publicId)}/${suffix}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        },
      );
      setMessage('Change recorded. Its public checkpoint is now processing.');
      await load();
      return result;
    } catch (error) {
      setMessage(issueMessage(error));
      if (error instanceof OperatorApiError && error.code === 'stale_resource_version') {
        await load().catch(() => undefined);
      }
      return null;
    } finally {
      setBusy('');
    }
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issue) return;
    const data = new FormData(event.currentTarget);
    await mutate('status', 'status', {
      expectedDomainVersion: issue.domainVersion,
      expectedTimelineHead: issue.projectedTimelineHead,
      toState: String(data.get('toState')),
      reasonCode: 'operator_status_update',
      publicNote: String(data.get('publicNote') ?? '').trim() || null,
      observedAt: new Date().toISOString(),
    });
  }

  async function recordHandoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issue) return;
    const data = new FormData(event.currentTarget);
    const eventType = String(data.get('eventType'));
    const followUp = String(data.get('followUpDueAt') ?? '');
    await mutate('handoff', 'handoff', {
      expectedDomainVersion: issue.domainVersion,
      expectedHandoffHead: issue.projectedHandoffHead,
      eventType,
      authorityName: String(data.get('authorityName') ?? '').trim(),
      channelName: String(data.get('channelName') ?? '').trim(),
      channelUrl: String(data.get('channelUrl') ?? '').trim() || null,
      externalReference: String(data.get('externalReference') ?? '').trim() || null,
      publicNote: String(data.get('publicNote') ?? '').trim() || null,
      occurredAt: new Date().toISOString(),
      followUpDueAt: followUp ? new Date(followUp).toISOString() : null,
    });
  }

  async function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issue) return;
    const data = new FormData(event.currentTarget);
    await mutate('correction', 'correction', {
      expectedDomainVersion: issue.domainVersion,
      expectedTimelineHead: issue.projectedTimelineHead,
      reasonCode: 'published_record_correction',
      privateNote: String(data.get('privateNote') ?? '').trim(),
      publicCopy: {
        title: String(data.get('title') ?? '').trim(),
        narrative: String(data.get('narrative') ?? '').trim(),
        wardLabel: String(data.get('wardLabel') ?? '').trim(),
        localityLabel: String(data.get('localityLabel') ?? '').trim() || null,
        publicReason: String(data.get('publicReason') ?? '').trim(),
      },
    });
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issue) return;
    const data = new FormData(event.currentTarget);
    await mutate('removal', 'removal', {
      expectedDomainVersion: issue.domainVersion,
      expectedTimelineHead: issue.projectedTimelineHead,
      reasonCode: 'privacy_or_safety_removal',
      publicMessage: String(data.get('publicMessage') ?? '').trim(),
      privateNote: String(data.get('privateNote') ?? '').trim(),
    });
  }

  const backHref = organizationId
    ? `/operator?organization=${encodeURIComponent(organizationId)}`
    : '/operator';

  if (loadState === 'loading') {
    return (
      <div className="operator-review-state" role="status">
        <span className="prod-inline-spinner" aria-hidden="true" /> Loading operator record
      </div>
    );
  }

  if (loadState === 'missing') {
    return (
      <div className="operator-review-state">
        <ShieldWarning size={26} weight="regular" />
        <div>
          <strong>Operator record unavailable</strong>
          <span>The issue may belong to another organization.</span>
        </div>
        <Link className="button secondary" href={backHref}>
          Return to operations
        </Link>
      </div>
    );
  }

  if (loadState === 'error' || !issue) {
    return (
      <div className="operator-review-state" role="status">
        <WarningCircle size={26} weight="regular" />
        <strong>Operator record temporarily unavailable.</strong>
      </div>
    );
  }

  return (
    <div className="operator-issue-manager">
      <header className="operator-review-heading">
        <Link href={backHref}>
          <ArrowLeft size={16} weight="bold" /> Operations
        </Link>
        <div className="operator-review-title">
          <div>
            <span className={`prod-state prod-state-${issue.lifecycle}`}>
              {issue.lifecycle.replaceAll('_', ' ')}
            </span>
            <span className="mono">Domain v{issue.domainVersion}</span>
          </div>
          <h1>{issue.version.title}</h1>
          <p>Published {displayDate(issue.version.publishedAt)}</p>
        </div>
        <div className="operator-heading-actions">
          <Link className="button secondary" href={`/issues/${issue.publicId}`} target="_blank">
            Open public record
          </Link>
          <button
            className="icon-button"
            type="button"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => void load()}
          >
            <Eye size={18} weight="bold" />
          </button>
        </div>
      </header>

      {issue.blockedFromSequence !== null ? (
        <div className="operator-recovery-warning">
          <WarningCircle size={18} weight="bold" />
          <div>
            <strong>Mutations blocked from sequence {issue.blockedFromSequence}</strong>
            <span>Reconcile the chain worker before recording another public change.</span>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="operator-action-message" role="status">
          {message}
        </div>
      ) : null}

      <section className="operator-issue-facts" aria-label="Record state">
        <article>
          <Flag size={19} weight="regular" />
          <span>Lifecycle</span>
          <strong>{issue.lifecycle.replaceAll('_', ' ')}</strong>
        </article>
        <article>
          <PaperPlaneTilt size={19} weight="regular" />
          <span>Official handoff</span>
          <strong>{issue.handoff.state?.replaceAll('_', ' ') ?? 'Not started'}</strong>
        </article>
        <article>
          <ShieldCheck size={19} weight="regular" />
          <span>Pending checkpoints</span>
          <strong>{pendingCheckpoints}</strong>
        </article>
        <article>
          <MapPin size={19} weight="fill" />
          <span>Public area</span>
          <strong>{issue.version.wardLabel}</strong>
        </article>
      </section>

      <div className="operator-issue-grid">
        <main className="operator-review-main">
          <section className="operator-review-section">
            <header>
              <div>
                <span className="eyebrow">
                  <FileText size={14} weight="bold" /> Current public version
                </span>
                <h2>Published record</h2>
              </div>
              <span className="mono">Version {issue.version.number}</span>
            </header>
            <div className="operator-current-copy">
              <p>{issue.version.narrative}</p>
              <dl>
                <div>
                  <dt>Category</dt>
                  <dd>{issue.version.category.replaceAll('_', ' ')}</dd>
                </div>
                <div>
                  <dt>Ward</dt>
                  <dd>{issue.version.wardLabel}</dd>
                </div>
                <div>
                  <dt>Nearby place</dt>
                  <dd>{issue.version.localityLabel ?? 'Not published'}</dd>
                </div>
                <div>
                  <dt>Publication state</dt>
                  <dd>{issue.publicationState.replaceAll('_', ' ')}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="operator-review-section">
            <header>
              <div>
                <span className="eyebrow">
                  <ClockCounterClockwise size={14} weight="bold" /> Append-only history
                </span>
                <h2>Operator events</h2>
              </div>
              <span>{combinedHistory.length}</span>
            </header>
            {combinedHistory.length ? (
              <ol className="operator-review-events">
                {combinedHistory.map((event) => (
                  <li key={event.id}>
                    <span />
                    <div>
                      <strong>{event.type}</strong>
                      <p>{event.note}</p>
                      <time>
                        {displayDate(event.createdAt)} / {event.state.replaceAll('_', ' ')}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="operator-empty-copy">No post-publication events are recorded.</p>
            )}
          </section>
        </main>

        <aside className="operator-issue-actions">
          {canSteward && nextLifecycles.length ? (
            <details open className="operator-operation">
              <summary>
                <Flag size={17} weight="bold" /> Update lifecycle
              </summary>
              <form onSubmit={changeStatus}>
                <label className="field">
                  <span>New status</span>
                  <select name="toState" required>
                    {nextLifecycles.map((state) => (
                      <option key={state} value={state}>
                        {state.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Public note</span>
                  <textarea name="publicNote" rows={3} maxLength={500} />
                </label>
                <button
                  className="button primary"
                  type="submit"
                  disabled={Boolean(busy) || issue.blockedFromSequence !== null}
                >
                  {busy === 'status' ? 'Recording...' : 'Record status'}
                  <ArrowRight size={17} weight="bold" />
                </button>
              </form>
            </details>
          ) : null}

          {canSteward && nextHandoffs.length ? (
            <details className="operator-operation">
              <summary>
                <PaperPlaneTilt size={17} weight="bold" /> Official handoff
              </summary>
              <form onSubmit={recordHandoff}>
                <label className="field">
                  <span>Event</span>
                  <select name="eventType" required>
                    {nextHandoffs.map((state) => (
                      <option key={state} value={state}>
                        {state.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Authority</span>
                  <input name="authorityName" minLength={2} maxLength={120} required />
                </label>
                <label className="field">
                  <span>Channel</span>
                  <input name="channelName" minLength={2} maxLength={120} required />
                </label>
                <label className="field">
                  <span>Channel URL</span>
                  <input name="channelUrl" type="url" pattern="https://.*" maxLength={500} />
                </label>
                <label className="field">
                  <span>External reference</span>
                  <input name="externalReference" maxLength={160} />
                </label>
                <label className="field">
                  <span>Follow-up due</span>
                  <input name="followUpDueAt" type="datetime-local" />
                </label>
                <label className="field">
                  <span>Public note</span>
                  <textarea name="publicNote" rows={3} maxLength={1000} />
                </label>
                <button
                  className="button primary"
                  type="submit"
                  disabled={Boolean(busy) || issue.blockedFromSequence !== null}
                >
                  {busy === 'handoff' ? 'Recording...' : 'Record handoff'}
                </button>
              </form>
            </details>
          ) : null}

          {canCorrect && issue.publicationState === 'published' ? (
            <details className="operator-operation">
              <summary>
                <FileText size={17} weight="bold" /> Correct public copy
              </summary>
              <form onSubmit={correct}>
                <label className="field">
                  <span>Title</span>
                  <input
                    name="title"
                    defaultValue={issue.version.title}
                    minLength={8}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    name="narrative"
                    defaultValue={issue.version.narrative}
                    minLength={20}
                    maxLength={2000}
                    rows={5}
                    required
                  />
                </label>
                <label className="field">
                  <span>Ward label</span>
                  <input
                    name="wardLabel"
                    defaultValue={issue.version.wardLabel}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="field">
                  <span>Nearby place</span>
                  <input
                    name="localityLabel"
                    defaultValue={issue.version.localityLabel ?? ''}
                    maxLength={80}
                  />
                </label>
                <label className="field">
                  <span>Public correction reason</span>
                  <input
                    name="publicReason"
                    defaultValue={issue.version.publicReason ?? ''}
                    maxLength={240}
                    required
                  />
                </label>
                <label className="field">
                  <span>Private audit note</span>
                  <textarea name="privateNote" minLength={1} maxLength={2000} rows={3} required />
                </label>
                <button
                  className="button secondary"
                  type="submit"
                  disabled={Boolean(busy) || issue.blockedFromSequence !== null}
                >
                  {busy === 'correction' ? 'Preparing...' : 'Commit correction'}
                </button>
              </form>
            </details>
          ) : null}

          {canRemove && issue.publicationState === 'published' ? (
            <details className="operator-operation danger">
              <summary>
                <XCircle size={17} weight="bold" /> Remove public content
              </summary>
              <form onSubmit={remove}>
                <div className="operator-danger-copy">
                  <ShieldWarning size={19} weight="regular" />
                  <p>A neutral tombstone remains in the public history.</p>
                </div>
                <label className="field">
                  <span>Public message</span>
                  <textarea name="publicMessage" minLength={8} maxLength={500} rows={3} required />
                </label>
                <label className="field">
                  <span>Private reason</span>
                  <textarea name="privateNote" minLength={8} maxLength={2000} rows={4} required />
                </label>
                <button
                  className="button secondary danger"
                  type="submit"
                  disabled={Boolean(busy) || issue.blockedFromSequence !== null}
                >
                  {busy === 'removal' ? 'Preparing...' : 'Remove public content'}
                </button>
              </form>
            </details>
          ) : null}

          {!canSteward && !canCorrect && !canRemove ? (
            <div className="operator-readonly">
              <ShieldCheck size={20} weight="regular" />
              <div>
                <strong>Read-only role</strong>
                <span>This account can inspect the operator history.</span>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
