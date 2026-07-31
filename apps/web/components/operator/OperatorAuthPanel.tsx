'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle,
  Key,
  LockKey,
  ShieldCheck,
  SignOut,
  WarningCircle,
} from '@phosphor-icons/react';

import { getBrowserSupabaseClient } from '@/lib/db/supabase.client';

type Factor = {
  id: string;
  friendlyName: string;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

type OperatorAuthPanelProps = {
  mode: 'sign_in' | 'mfa' | 'denied' | 'unavailable';
  email?: string;
  factors?: Factor[];
};

function authMessage(error: unknown) {
  const value = error instanceof Error ? error.message.toLowerCase() : '';
  if (value.includes('invalid login')) return 'Check the email and password.';
  if (value.includes('invalid totp') || value.includes('challenge')) {
    return 'The authentication code was not accepted.';
  }
  if (value.includes('expired')) return 'The authentication code expired. Use the latest code.';
  return 'Operator access is temporarily unavailable.';
}

export function OperatorAuthPanel({ mode, email = '', factors = [] }: OperatorAuthPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState(factors[0]?.id ?? '');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const { error } = await getBrowserSupabaseClient().auth.signInWithPassword({
        email: String(data.get('email') ?? '').trim(),
        password: String(data.get('password') ?? ''),
      });
      if (error) throw error;
      router.refresh();
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function enroll() {
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await getBrowserSupabaseClient().auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Nagarik Signal operator',
      });
      if (error) throw error;
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setFactorId(data.id);
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!factorId) throw new Error('mfa_factor_required');
      const { error } = await getBrowserSupabaseClient().auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (error) throw error;
      setCode('');
      router.refresh();
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await getBrowserSupabaseClient().auth.signOut();
    router.refresh();
  }

  if (mode === 'unavailable') {
    return (
      <section className="operator-access-state">
        <WarningCircle size={28} weight="regular" />
        <div>
          <h2>Operator service unavailable</h2>
          <p>Managed authentication has not been configured for this environment.</p>
        </div>
      </section>
    );
  }

  if (mode === 'denied') {
    return (
      <section className="operator-access-state">
        <LockKey size={28} weight="regular" />
        <div>
          <h2>No active operator role</h2>
          <p>{email} is authenticated but has no active organization role.</p>
        </div>
        <button className="button secondary" type="button" onClick={signOut} disabled={busy}>
          <SignOut size={17} weight="bold" /> Sign out
        </button>
      </section>
    );
  }

  if (mode === 'sign_in') {
    return (
      <div className="operator-auth-layout">
        <section className="operator-auth-copy">
          <span className="eyebrow">
            <ShieldCheck size={14} weight="bold" /> Restricted operations
          </span>
          <h2>Sign in to the operator workspace</h2>
          <p>
            Access is limited to named organization members. Every decision is attributed and
            retained in the audit history.
          </p>
          <ul>
            <li>
              <CheckCircle size={17} weight="fill" /> Individual managed identity
            </li>
            <li>
              <CheckCircle size={17} weight="fill" /> Multi-factor authentication
            </li>
            <li>
              <CheckCircle size={17} weight="fill" /> Organization-scoped roles
            </li>
          </ul>
        </section>
        <form className="operator-auth-form" onSubmit={signIn}>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>
          {message ? (
            <p className="form-error" role="alert">
              {message}
            </p>
          ) : null}
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Continue'} <ArrowRight size={17} weight="bold" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="operator-auth-layout">
      <section className="operator-auth-copy">
        <span className="eyebrow">
          <Key size={14} weight="bold" /> Multi-factor check
        </span>
        <h2>Confirm operator access</h2>
        <p>Enter the current six-digit code from the authenticator linked to {email}.</p>
      </section>
      <div className="operator-mfa-panel">
        {factors.length ? (
          <form className="operator-auth-form" onSubmit={verifyMfa}>
            {factors.length > 1 ? (
              <label className="field">
                <span>Authenticator</span>
                <select value={factorId} onChange={(event) => setFactorId(event.target.value)}>
                  {factors.map((factor) => (
                    <option key={factor.id} value={factor.id}>
                      {factor.friendlyName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>Authentication code</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
              />
            </label>
            {message ? (
              <p className="form-error" role="alert">
                {message}
              </p>
            ) : null}
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? 'Checking...' : 'Verify'} <ArrowRight size={17} weight="bold" />
            </button>
          </form>
        ) : enrollment ? (
          <form className="operator-auth-form" onSubmit={verifyMfa}>
            <div className="operator-qr">
              <Image
                src={enrollment.qrCode}
                alt="Authenticator setup QR code"
                width={208}
                height={208}
                unoptimized
              />
              <div>
                <strong>Scan with an authenticator app</strong>
                <span className="mono">{enrollment.secret}</span>
              </div>
            </div>
            <label className="field">
              <span>First authentication code</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
              />
            </label>
            {message ? (
              <p className="form-error" role="alert">
                {message}
              </p>
            ) : null}
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? 'Checking...' : 'Finish setup'} <ArrowRight size={17} weight="bold" />
            </button>
          </form>
        ) : (
          <div className="operator-enroll">
            <LockKey size={28} weight="regular" />
            <div>
              <strong>Authenticator setup required</strong>
              <p>This account must enroll a time-based one-time password before proceeding.</p>
            </div>
            {message ? (
              <p className="form-error" role="alert">
                {message}
              </p>
            ) : null}
            <button className="button primary" type="button" onClick={enroll} disabled={busy}>
              {busy ? 'Preparing...' : 'Set up authenticator'}
            </button>
          </div>
        )}
        <button className="button text" type="button" onClick={signOut} disabled={busy}>
          <SignOut size={16} weight="bold" /> Use another account
        </button>
      </div>
    </div>
  );
}
