'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowSquareOut,
  CheckCircle,
  PaperPlaneTilt,
  ShieldCheck,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import { handoffStateLabel, handoffStates, nextHandoffStates } from '@/lib/handoffs/policy';
import type { AuthorityHandoff, CivicIssue, HandoffState } from '@/lib/types';
import { shortText } from '@/lib/ui/format';

type UploadResult = {
  ok: boolean;
  photoUrl: string;
  evidenceHash: string;
  uploadReceipt: string;
  error?: string;
};

type HandoffResult = {
  ok: boolean;
  error?: string;
  created?: boolean;
  handoff?: AuthorityHandoff;
};

function stateHint(state: HandoffState) {
  if (state === 'prepared') return 'Records the official route only. It does not claim the issue was submitted.';
  if (state === 'submitted') return 'Requires a case reference or a redacted receipt, plus a follow-up date.';
  if (state === 'acknowledged') return 'Requires a newly uploaded, privacy-reviewed acknowledgement artifact.';
  if (state === 'follow_up') return 'Requires a public note and the next follow-up date.';
  return 'Closes the handoff trail, not the underlying civic issue. A public note is required.';
}

export function StewardHandoffForm({
  issue,
  handoffs,
  secret,
}: {
  issue: CivicIssue;
  handoffs: AuthorityHandoff[];
  secret: string;
}) {
  const router = useRouter();
  const timeline = useMemo(() => [...handoffs].sort((left, right) => left.seq - right.seq), [handoffs]);
  const current = timeline.at(-1) ?? null;
  const allowedStates = nextHandoffStates(current?.state ?? null);
  const [state, setState] = useState<HandoffState>(allowedStates[0] ?? 'closed');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('No handoff event submitted.');
  const [result, setResult] = useState<HandoffResult | null>(null);
  const outsideQueue = issue.recordKind === 'illustrative_sample' || issue.recordKind === 'qa_fixture';
  const acceptsEvidence = state === 'submitted' || state === 'acknowledged' || state === 'follow_up';
  const schedulesFollowUp = state === 'submitted' || state === 'acknowledged' || state === 'follow_up';

  async function uploadReceipt(file: File) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/upload', { method: 'POST', body });
    const payload = await response.json() as UploadResult;
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'receipt_upload_failed');
    return payload;
  }

  async function submit(formData: FormData) {
    setBusy(true);
    setResult(null);
    setMessage('Validating handoff evidence...');
    try {
      const receiptFile = formData.get('receiptPhoto');
      let receiptPhotoUrl: string | null = null;
      let receiptEvidenceHash: string | null = null;
      let uploadReceiptToken: string | null = null;

      if (receiptFile instanceof File && receiptFile.size > 0) {
        if (formData.get('receiptPrivacyReviewed') !== 'on') {
          throw new Error('receipt_privacy_review_required');
        }
        setMessage('Sanitizing and uploading the redacted receipt...');
        const upload = await uploadReceipt(receiptFile);
        receiptPhotoUrl = upload.photoUrl;
        receiptEvidenceHash = upload.evidenceHash;
        uploadReceiptToken = upload.uploadReceipt;
      }

      const occurredValue = String(formData.get('occurredAt') ?? '');
      const followUpValue = String(formData.get('followUpDueAt') ?? '');
      const occurredAt = occurredValue ? new Date(occurredValue).toISOString() : new Date().toISOString();
      const followUpDueAt = state === 'closed' || !followUpValue ? null : new Date(followUpValue).toISOString();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secret) headers['x-nagarik-steward-secret'] = secret;

      setMessage('Appending the steward audit event...');
      const response = await fetch(`/api/reports/${encodeURIComponent(issue.id)}/handoff`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          expectedPreviousEventHash: current?.eventHash ?? null,
          state,
          authorityName: String(formData.get('authorityName') ?? '').trim(),
          channelName: String(formData.get('channelName') ?? '').trim(),
          channelUrl: String(formData.get('channelUrl') ?? '').trim() || null,
          externalReference: String(formData.get('externalReference') ?? '').trim() || null,
          note: String(formData.get('handoffNote') ?? '').trim(),
          occurredAt,
          followUpDueAt,
          receiptPhotoUrl,
          receiptEvidenceHash,
          receiptPrivacyReviewed: Boolean(receiptPhotoUrl),
          uploadReceipt: uploadReceiptToken,
        }),
      });
      const payload = await response.json() as HandoffResult;
      setResult(payload);
      if (!response.ok || !payload.ok) {
        setMessage((payload.error ?? 'handoff_record_failed').replaceAll('_', ' '));
        return;
      }
      setMessage(`Audit event #${payload.handoff?.seq ?? ''} recorded. It is separate from the authority's own records.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message.replaceAll('_', ' ') : 'handoff record failed');
    } finally {
      setBusy(false);
    }
  }

  if (outsideQueue) {
    return (
      <section className="panel pad steward-handoff-form">
        <span className="eyebrow"><PaperPlaneTilt size={15} weight="bold" /> Official follow-up</span>
        <h2>Handoff unavailable</h2>
        <div className="notice">Samples and technical fixtures cannot enter the authority handoff queue.</div>
      </section>
    );
  }

  if (!allowedStates.length) {
    return (
      <section className="panel pad steward-handoff-form">
        <span className="eyebrow"><CheckCircle size={15} weight="bold" /> Official follow-up</span>
        <h2>Handoff trail closed</h2>
        <p className="muted">This append-only trail ended at event #{current?.seq}. Reopening requires a new public record rather than rewriting the closed history.</p>
        <div className="hash-row"><span className="muted">Final event</span><code className="mono">{shortText(current?.eventHash, 14, 12)}</code></div>
      </section>
    );
  }

  return (
    <form action={submit} className="panel pad form-grid steward-handoff-form">
      <div className="steward-form-heading">
        <div>
          <span className="eyebrow"><PaperPlaneTilt size={15} weight="bold" /> Official follow-up</span>
          <h2>Record authority handoff</h2>
        </div>
        <span className={`pill handoff-state handoff-state-${current?.state ?? 'none'}`}>{handoffStateLabel(current?.state)}</span>
      </div>
      <div className="handoff-form-boundary" role="note">
        <ShieldCheck size={17} weight="bold" />
        <span>This creates a platform steward audit event. It does not create an authority response or a Solana StatusUpdate.</span>
      </div>
      <label className="field">
        <span>Handoff state</span>
        <select name="handoffState" value={state} onChange={(event) => setState(event.target.value as HandoffState)}>
          {allowedStates.map((id) => (
            <option key={id} value={id}>{handoffStates.find((item) => item.id === id)?.label}</option>
          ))}
        </select>
        <span className="helper">{stateHint(state)}</span>
      </label>
      <div className="handoff-form-grid">
        <label className="field">
          <span>Receiving authority</span>
          <input name="authorityName" required minLength={2} maxLength={120} defaultValue={current?.authorityName ?? ''} placeholder="Public body responsible for the channel" />
        </label>
        <label className="field">
          <span>Channel</span>
          <input name="channelName" required minLength={2} maxLength={120} defaultValue={current?.channelName ?? ''} placeholder="Portal, desk, email, or hotline" />
        </label>
      </div>
      <label className="field">
        <span>Official HTTPS channel URL</span>
        <input name="channelUrl" type="url" pattern="https://.*" maxLength={500} defaultValue={current?.channelUrl ?? issue.provenance?.escalationUrl ?? ''} placeholder="https://" />
      </label>
      <div className="handoff-form-grid">
        <label className="field">
          <span>Action time</span>
          <input name="occurredAt" type="datetime-local" required />
        </label>
        {schedulesFollowUp ? (
          <label className="field">
            <span>Next follow-up</span>
            <input
              name="followUpDueAt"
              type="datetime-local"
              required={state === 'submitted' || state === 'follow_up'}
            />
          </label>
        ) : null}
      </div>
      {acceptsEvidence ? (
        <label className="field">
          <span>External case reference</span>
          <input name="externalReference" minLength={2} maxLength={160} placeholder="Case number or receipt identifier" />
          <span className="helper">Required when recording delivery unless a redacted receipt is attached. Never enter a reporter phone number, address, or national identifier.</span>
        </label>
      ) : null}
      <label className="field">
        <span>Public handoff note</span>
        <textarea
          name="handoffNote"
          rows={4}
          required={state === 'follow_up' || state === 'closed'}
          minLength={state === 'follow_up' || state === 'closed' ? 8 : undefined}
          maxLength={1_000}
          placeholder="Record only the observable action and next step. Do not identify a reporter or accuse an individual."
        />
      </label>
      {acceptsEvidence ? (
        <fieldset className="handoff-receipt-fieldset">
          <legend>Redacted receipt</legend>
          <label className="field">
            <span>Receipt image</span>
            <input name="receiptPhoto" type="file" accept="image/png,image/jpeg,image/webp" required={state === 'acknowledged'} />
            <span className="helper">Upload a screenshot or photo only after removing names, phone numbers, addresses, signatures, QR codes, and account details.</span>
          </label>
          <label className="handoff-privacy-check">
            <input name="receiptPrivacyReviewed" type="checkbox" />
            <span>I reviewed the artifact and removed personal or secret information.</span>
          </label>
        </fieldset>
      ) : null}
      <button type="submit" className="button crimson" disabled={busy}>
        {busy ? <WarningCircle size={17} weight="bold" /> : <UploadSimple size={17} weight="bold" />}
        {busy ? 'Recording event...' : 'Record handoff event'}
      </button>
      <p className={result && !result.ok ? 'proof-bad' : result?.ok ? 'proof-ok' : 'muted'} role="status">
        {message}
      </p>
      {result?.ok && result.handoff ? (
        <div className="handoff-result">
          <CheckCircle size={18} weight="fill" />
          <span>{handoffStateLabel(result.handoff.state)} / event <code className="mono">{shortText(result.handoff.eventHash, 12, 10)}</code></span>
          <a href={`/issues/${issue.id}#handoff`}>Open public trail <ArrowSquareOut size={14} weight="bold" /></a>
        </div>
      ) : null}
    </form>
  );
}
