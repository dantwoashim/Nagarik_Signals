'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle,
  Clipboard,
  Clock,
  Key,
  ListChecks,
  LockKey,
  SignOut,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react';

import { getBrowserSupabaseClient } from '@/lib/db/supabase.client';
import { OperatorApiError, readOperatorApi } from '@/lib/operator/api';

export type OperatorOrganization = {
  id: string;
  name: string;
  roles: string[];
  pilotPolicyVersion: string | null;
  invitationScopes: string[];
};

type QueueItem = {
  submissionId: string;
  trackingId: string;
  recordKind: string;
  state: string;
  version: number;
  assignedTo: string | null;
  receivedAt: string;
  updatedAt: string;
};

type QueueResponse = {
  items: QueueItem[];
  nextCursor: string | null;
};

type InvitationResponse = {
  invitationId: string;
  scopes: string[];
  pilotPolicyVersion: string;
  expiresAt: string;
  invitation: string;
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));
}

function stateLabel(value: string) {
  const labels: Record<string, string> = {
    received: 'Received',
    revision_pending: 'Updated report',
    under_review: 'Under review',
    changes_requested: 'Changes requested',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

function roleLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function defaultExpiry() {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function queueMessage(error: unknown) {
  if (error instanceof OperatorApiError) {
    if (error.status === 401) return 'Your operator session expired. Sign in again.';
    if (error.status === 403) return 'This role cannot access the moderation queue.';
  }
  return 'The moderation queue is temporarily unavailable.';
}

export function OperatorWorkspace({
  email,
  organizations,
  selectedOrganizationId,
}: {
  email: string;
  organizations: OperatorOrganization[];
  selectedOrganizationId: string;
}) {
  const router = useRouter();
  const selected =
    organizations.find((organization) => organization.id === selectedOrganizationId) ??
    organizations[0];
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueState, setQueueState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [invitation, setInvitation] = useState<InvitationResponse | null>(null);
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [intakeScope, setIntakeScope] = useState(true);
  const [signalScope, setSignalScope] = useState(true);

  const canInvite = selected.roles.some((role) => role === 'org_admin' || role === 'system_admin');
  const moderationCount = useMemo(
    () =>
      queue.filter((item) => item.state === 'received' || item.state === 'revision_pending').length,
    [queue],
  );

  async function loadQueue() {
    setQueueState('loading');
    setMessage('');
    try {
      const result = await readOperatorApi<QueueResponse>(
        `/api/operator/moderation?organizationId=${encodeURIComponent(selected.id)}&limit=50`,
      );
      setQueue(result.items);
      setQueueState('ready');
    } catch (error) {
      setMessage(queueMessage(error));
      setQueueState('error');
    }
  }

  useEffect(() => {
    let active = true;
    readOperatorApi<QueueResponse>(
      `/api/operator/moderation?organizationId=${encodeURIComponent(selected.id)}&limit=50`,
    )
      .then((result) => {
        if (!active) return;
        setQueue(result.items);
        setQueueState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(queueMessage(error));
        setQueueState('error');
      });
    return () => {
      active = false;
    };
  }, [selected.id]);

  function changeOrganization(nextId: string) {
    setInvitation(null);
    router.replace(`/operator?organization=${encodeURIComponent(nextId)}`);
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvitationBusy(true);
    setInvitation(null);
    setMessage('');
    try {
      if (!selected.pilotPolicyVersion) throw new Error('pilot_policy_unavailable');
      const scopes = [
        ...(intakeScope ? ['intake'] : []),
        ...(signalScope ? ['signal'] : []),
      ].filter((scope) => selected.invitationScopes.includes(scope));
      if (!scopes.length) throw new Error('pilot_scope_required');
      const result = await readOperatorApi<InvitationResponse>(
        `/api/operator/invitations?organizationId=${encodeURIComponent(selected.id)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            schemaVersion: 'pilot-invitation-create-v1',
            scopes,
            expiresAt: new Date(expiry).toISOString(),
            pilotPolicyVersion: selected.pilotPolicyVersion,
          }),
        },
      );
      setInvitation(result);
    } catch (error) {
      if (error instanceof OperatorApiError && error.status === 403) {
        setMessage('This role cannot create pilot invitations.');
      } else if (error instanceof Error && error.message === 'pilot_scope_required') {
        setMessage('Choose at least one available invitation scope.');
      } else {
        setMessage('The invitation could not be created.');
      }
    } finally {
      setInvitationBusy(false);
    }
  }

  async function signOut() {
    await getBrowserSupabaseClient().auth.signOut();
    router.refresh();
  }

  return (
    <div className="operator-workspace">
      <header className="operator-toolbar">
        <div>
          <span className="eyebrow">
            <LockKey size={14} weight="bold" /> Authenticated workspace
          </span>
          <h1>Operations</h1>
          <p>{email}</p>
        </div>
        <div className="operator-toolbar-actions">
          {organizations.length > 1 ? (
            <label className="operator-org-select">
              <span>Organization</span>
              <select
                value={selected.id}
                onChange={(event) => changeOrganization(event.target.value)}
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="operator-org-name">
              <span>Organization</span>
              <strong>{selected.name}</strong>
            </div>
          )}
          <button
            className="icon-button"
            type="button"
            title="Sign out"
            aria-label="Sign out"
            onClick={signOut}
          >
            <SignOut size={19} weight="bold" />
          </button>
        </div>
      </header>

      <div className="operator-role-strip">
        <span>Active roles</span>
        {selected.roles.map((role) => (
          <strong key={role}>{roleLabel(role)}</strong>
        ))}
      </div>

      <section className="operator-metrics" aria-label="Queue summary">
        <article>
          <ListChecks size={20} weight="regular" />
          <span>Visible queue</span>
          <strong>{queue.length}</strong>
        </article>
        <article>
          <Clock size={20} weight="regular" />
          <span>Waiting for review</span>
          <strong>{moderationCount}</strong>
        </article>
        <article>
          <UsersThree size={20} weight="regular" />
          <span>Assigned</span>
          <strong>{queue.filter((item) => item.assignedTo).length}</strong>
        </article>
      </section>

      <div className="operator-grid">
        <section className="operator-panel operator-queue" aria-labelledby="queue-heading">
          <header>
            <div>
              <span className="eyebrow">Private workflow</span>
              <h2 id="queue-heading">Moderation queue</h2>
            </div>
            <button className="button secondary" type="button" onClick={loadQueue}>
              Refresh
            </button>
          </header>

          {queueState === 'loading' ? (
            <div className="operator-panel-state" role="status">
              <span className="prod-inline-spinner" aria-hidden="true" /> Loading queue
            </div>
          ) : queueState === 'error' ? (
            <div className="operator-panel-state" role="status">
              <WarningCircle size={22} weight="regular" />
              <span>{message}</span>
            </div>
          ) : queue.length ? (
            <div className="operator-queue-list">
              {queue.map((item) => (
                <Link
                  key={item.submissionId}
                  href={`/operator/review/${item.submissionId}?organization=${encodeURIComponent(selected.id)}`}
                >
                  <span className={`operator-state operator-state-${item.state}`}>
                    {stateLabel(item.state)}
                  </span>
                  <div>
                    <strong>
                      {item.recordKind === 'public_source'
                        ? 'Public-source record'
                        : 'Community report'}
                    </strong>
                    <span>Received {displayDate(item.receivedAt)}</span>
                  </div>
                  <span className="mono">v{item.version}</span>
                  <ArrowRight size={17} weight="bold" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="operator-panel-state">
              <CheckCircle size={22} weight="fill" />
              <span>No reports are waiting in this queue.</span>
            </div>
          )}
        </section>

        <aside className="operator-panel operator-invitations" aria-labelledby="invitation-heading">
          <header>
            <div>
              <span className="eyebrow">
                <Key size={14} weight="bold" /> Pilot access
              </span>
              <h2 id="invitation-heading">New invitation</h2>
            </div>
          </header>
          {!canInvite ? (
            <div className="operator-panel-state">
              <LockKey size={22} weight="regular" />
              <span>Organization administrators create invitations.</span>
            </div>
          ) : !selected.pilotPolicyVersion ? (
            <div className="operator-panel-state">
              <WarningCircle size={22} weight="regular" />
              <span>No active pilot policy is available.</span>
            </div>
          ) : (
            <form className="operator-invitation-form" onSubmit={createInvitation}>
              <div className="operator-scope-list">
                <label>
                  <input
                    type="checkbox"
                    checked={intakeScope}
                    disabled={!selected.invitationScopes.includes('intake')}
                    onChange={(event) => setIntakeScope(event.target.checked)}
                  />
                  Report issues
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={signalScope}
                    disabled={!selected.invitationScopes.includes('signal')}
                    onChange={(event) => setSignalScope(event.target.checked)}
                  />
                  Signal attention
                </label>
              </div>
              <label className="field">
                <span>Expires</span>
                <input
                  type="datetime-local"
                  value={expiry}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(event) => setExpiry(event.target.value)}
                  required
                />
              </label>
              <button className="button primary" type="submit" disabled={invitationBusy}>
                {invitationBusy ? 'Creating...' : 'Create invitation'}
              </button>
            </form>
          )}

          {message && queueState !== 'error' ? (
            <p className="form-error" role="alert">
              {message}
            </p>
          ) : null}

          {invitation ? (
            <div className="operator-invitation-result">
              <CheckCircle size={20} weight="fill" />
              <div>
                <strong>Invitation created</strong>
                <span>Shown once. Send it through a trusted channel.</span>
              </div>
              <code>{invitation.invitation}</code>
              <button
                className="button secondary"
                type="button"
                onClick={() => navigator.clipboard.writeText(invitation.invitation)}
              >
                <Clipboard size={17} weight="bold" /> Copy
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
