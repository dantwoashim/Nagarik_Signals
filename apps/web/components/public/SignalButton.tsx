'use client';

import { useState } from 'react';
import { CheckCircle, HandPalm, Key, MinusCircle, Pulse } from '@phosphor-icons/react';

import { PublicApiError, readPublicApi } from '@/lib/public/api';

type SignalResponse = {
  accepted?: boolean;
  retracted?: boolean;
  signalCount: number;
  meaning: string;
};

type SessionResponse = {
  scope: string[];
  expiresAt: string;
};

export function SignalButton({
  publicId,
  initialCount,
}: {
  publicId: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsInvitation, setNeedsInvitation] = useState(false);
  const [invitation, setInvitation] = useState('');
  const [message, setMessage] = useState('');

  async function mutate(method: 'POST' | 'DELETE') {
    setBusy(true);
    setMessage('');
    try {
      const result = await readPublicApi<SignalResponse>(`/api/v2/issues/${publicId}/signals`, {
        method,
        headers: {
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          'Idempotency-Key': crypto.randomUUID(),
        },
        ...(method === 'POST' ? { body: JSON.stringify({ schemaVersion: 'signal-v1' }) } : {}),
      });
      setCount(result.signalCount);
      setActive(method === 'POST');
      setNeedsInvitation(false);
      setMessage(method === 'POST' ? 'Attention signal recorded.' : 'Attention signal removed.');
    } catch (error) {
      if (error instanceof PublicApiError && error.status === 401) {
        setNeedsInvitation(true);
        setMessage('A pilot invitation is required to signal attention.');
      } else {
        setMessage('Signals are temporarily unavailable.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function openInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await readPublicApi<SessionResponse>('/api/v2/intake-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          schemaVersion: 'pilot-invitation-v1',
          invitation: invitation.trim(),
        }),
      });
      if (!result.scope.includes('signal')) throw new Error('signal_scope_missing');
      setInvitation('');
      setNeedsInvitation(false);
      await mutate('POST');
    } catch {
      setMessage('This invitation could not open signal access.');
      setBusy(false);
    }
  }

  return (
    <section className="prod-signal" aria-labelledby="signal-heading">
      <div className="prod-signal-main">
        <span className="prod-signal-icon">
          <Pulse size={22} weight="bold" />
        </span>
        <div>
          <span>Public attention</span>
          <h2 id="signal-heading">
            {count} signal{count === 1 ? '' : 's'}
          </h2>
          <p>Signals show invited pilot attention. They do not verify truth or identity.</p>
        </div>
        <button
          className={active ? 'button secondary' : 'button primary'}
          type="button"
          disabled={busy}
          onClick={() => void mutate(active ? 'DELETE' : 'POST')}
        >
          {active ? <MinusCircle size={17} weight="bold" /> : <HandPalm size={17} weight="bold" />}
          {active ? 'Remove signal' : 'Signal attention'}
        </button>
      </div>

      {needsInvitation ? (
        <form className="prod-signal-invitation" onSubmit={openInvitation}>
          <label className="field">
            <span>
              <Key size={14} weight="bold" /> Pilot invitation
            </span>
            <textarea
              value={invitation}
              onChange={(event) => setInvitation(event.target.value)}
              minLength={80}
              maxLength={220}
              rows={3}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <button className="button secondary" type="submit" disabled={busy}>
            Continue
          </button>
        </form>
      ) : null}

      {message ? (
        <p className="prod-signal-message" role="status">
          {active ? <CheckCircle size={15} weight="fill" /> : null}
          {message}
        </p>
      ) : null}
    </section>
  );
}
