'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EyeSlash, FunnelSimple, LockKey, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { StewardHandoffForm } from '@/components/StewardHandoffForm';
import { categoryLabel } from '@/lib/constants/categories';
import { isClosedStatus, statuses, statusLabel, validStatusTransitions } from '@/lib/constants/statuses';
import { handoffStateLabel } from '@/lib/handoffs/policy';
import type { AuthorityHandoff, CivicIssue, IssueStatus, SafetyReviewStatus } from '@/lib/types';
import { formatDateTime, shortText } from '@/lib/ui/format';

type StatusResult = {
  ok: boolean;
  reason: string;
  seq?: number;
  oldStatus?: IssueStatus;
  newStatus?: IssueStatus;
  proofHash?: string;
  statusUpdatePda?: string;
  txSig?: string;
  explorerUrl?: string;
  authMode?: string;
  proofMetadata?: Record<string, unknown>;
};

type UploadResult = {
  ok: boolean;
  photoUrl: string;
  evidenceHash: string;
  uploadReceipt: string;
  error?: string;
};

type ModerationResult = {
  ok: boolean;
  reason?: string;
  oldSafetyReviewStatus?: SafetyReviewStatus;
  safetyReviewStatus?: SafetyReviewStatus;
  mediaPublic?: boolean;
  discoverable?: boolean;
};

type QueueStatus = 'open' | 'all' | IssueStatus;
type ProofFilter = 'indexed' | 'sample' | 'all';

function statusMatches(issue: CivicIssue, filter: QueueStatus) {
  if (filter === 'all') return true;
  if (filter === 'open') return !isClosedStatus(issue.status);
  return issue.status === filter;
}

function proofMatches(issue: CivicIssue, filter: ProofFilter) {
  if (filter === 'all') return true;
  if (filter === 'indexed') return issue.proof.proofStatus !== 'seeded_demo';
  return issue.proof.proofStatus === 'seeded_demo';
}

export function StewardConsole({ issues, authorityHandoffs }: { issues: CivicIssue[]; authorityHandoffs: AuthorityHandoff[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(issues[0]?.id ?? '');
  const [statusFilter, setStatusFilter] = useState<QueueStatus>('open');
  const [proofFilter, setProofFilter] = useState<ProofFilter>('indexed');
  const [query, setQuery] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Ready to update an indexed issue.');
  const [result, setResult] = useState<StatusResult | null>(null);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [moderationMessage, setModerationMessage] = useState('No moderation change submitted.');
  const [moderationResult, setModerationResult] = useState<ModerationResult | null>(null);
  const selected = useMemo(() => issues.find((issue) => issue.id === selectedId) ?? issues[0] ?? null, [issues, selectedId]);
  const selectedHandoffs = useMemo(
    () => authorityHandoffs.filter((handoff) => handoff.issueId === selected?.issueId).sort((left, right) => left.seq - right.seq),
    [authorityHandoffs, selected?.issueId],
  );
  const filteredIssues = useMemo(() => {
    const text = query.trim().toLowerCase();
    return issues.filter((issue) => {
      const searchable = `${issue.issueId} ${issue.title} ${issue.description} ${issue.locality}`.toLowerCase();
      return statusMatches(issue, statusFilter) && proofMatches(issue, proofFilter) && (!text || searchable.includes(text));
    });
  }, [issues, proofFilter, query, statusFilter]);

  async function uploadProof(file: File) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/upload', { method: 'POST', body });
    const payload = await response.json() as UploadResult;
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'proof_upload_failed');
    return payload;
  }

  async function submit(formData: FormData) {
    if (!selected) return;
    setBusy(true);
    setResult(null);
    setMessage('Preparing steward update...');
    try {
      const proofFile = formData.get('proofPhoto');
      let resolutionPhotoUrl: string | null = null;
      let resolutionEvidenceHash: string | null = null;
      let uploadReceipt: string | null = null;
      if (proofFile instanceof File && proofFile.size > 0) {
        setMessage('Uploading and sanitizing resolution proof...');
        const upload = await uploadProof(proofFile);
        resolutionPhotoUrl = upload.photoUrl;
        resolutionEvidenceHash = upload.evidenceHash;
        uploadReceipt = upload.uploadReceipt;
      }

      setMessage('Creating StatusUpdate PDA...');
      const proofHash = String(formData.get('proofHash') ?? '').trim();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secret) headers['x-nagarik-steward-secret'] = secret;
      const response = await fetch(`/api/reports/${encodeURIComponent(selected.id)}/status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          newStatus: String(formData.get('newStatus') ?? 'in_progress'),
          note: String(formData.get('note') ?? '').trim(),
          resolutionPhotoUrl,
          resolutionEvidenceHash,
          uploadReceipt,
          proofHash,
        }),
      });
      const payload = await response.json() as StatusResult;
      setResult(payload);
      setMessage(payload.ok ? 'Status update anchored and indexed.' : payload.reason.replaceAll('_', ' '));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message.replaceAll('_', ' ') : 'status update failed');
    } finally {
      setBusy(false);
    }
  }

  async function moderate(formData: FormData) {
    if (!selected) return;
    setModerationBusy(true);
    setModerationResult(null);
    setModerationMessage('Applying media and discovery policy...');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secret) headers['x-nagarik-steward-secret'] = secret;
      const response = await fetch(`/api/reports/${encodeURIComponent(selected.id)}/moderation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          safetyReviewStatus: String(formData.get('safetyReviewStatus') ?? ''),
          note: String(formData.get('moderationNote') ?? '').trim(),
        }),
      });
      const payload = await response.json() as ModerationResult;
      setModerationResult(payload);
      setModerationMessage(payload.ok
        ? `Safety review changed to ${payload.safetyReviewStatus?.replaceAll('_', ' ')}.`
        : (payload.reason ?? 'moderation_failed').replaceAll('_', ' '));
      if (payload.ok) router.refresh();
    } catch (error) {
      setModerationMessage(error instanceof Error ? error.message.replaceAll('_', ' ') : 'moderation failed');
    } finally {
      setModerationBusy(false);
    }
  }

  if (!selected) {
    return <div className="notice">No visible issues are available for steward review.</div>;
  }

  const selectedClosed = isClosedStatus(selected.status);
  const selectedSeeded = selected.proof.proofStatus === 'seeded_demo';
  const statusOptions = validStatusTransitions(selected.status);
  const lastTimeline = selected.timeline.at(-1);
  const latestHandoff = selectedHandoffs.at(-1) ?? null;

  return (
    <section className="dashboard-band">
      <div className="page-stack">
        <section className="panel pad">
          <div className="badge-row">
            <span className="eyebrow">
              <LockKey size={15} weight="bold" />
              Steward auth
            </span>
            <span className="pill">{secret ? 'secret ready' : 'secret required in production'}</span>
          </div>
          <label className="field" style={{ marginTop: 14 }}>
            <span>Steward secret</span>
            <input
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              type="password"
              placeholder="Only required when NAGARIK_STEWARD_SECRET is set"
            />
          </label>
          <p className="helper">
            The API sends this as x-nagarik-steward-secret. Local development can remain open; production refuses every steward write until a server secret is configured.
          </p>
        </section>

        <section className="panel pad">
          <div className="badge-row">
            <span className="eyebrow">
              <FunnelSimple size={15} weight="bold" />
              Steward queue
            </span>
            <span className="pill">{filteredIssues.length} issue{filteredIssues.length === 1 ? '' : 's'}</span>
          </div>
          <div className="filter-bar" style={{ gridTemplateColumns: '1fr 1fr 1fr', padding: '14px 0 0' }}>
            <label className="field">
              <span>Search</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="issue id, title, ward" />
            </label>
            <label className="field">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as QueueStatus)}>
                <option value="open">Open only</option>
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>{status.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Proof mode</span>
              <select value={proofFilter} onChange={(event) => setProofFilter(event.target.value as ProofFilter)}>
                <option value="indexed">Indexed devnet</option>
                <option value="sample">Sample records</option>
                <option value="all">All proof modes</option>
              </select>
            </label>
          </div>
          <div className="table-list" style={{ marginTop: 12 }}>
            {filteredIssues.map((issue) => (
              <button
                type="button"
                className="table-row"
                key={issue.id}
                onClick={() => setSelectedId(issue.id)}
                aria-pressed={issue.id === selected.id}
                style={{
                  textAlign: 'left',
                  borderInline: 0,
                  borderBottom: 0,
                  borderTop: '1px solid var(--line)',
                  background: issue.id === selected.id ? 'var(--paper-strong)' : 'transparent',
                  color: 'inherit',
                }}
              >
                <span className="mono muted">#{issue.issueId}</span>
                <span>
                  <strong>{issue.title}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                    {issue.locality} / {handoffStateLabel(authorityHandoffs.filter((handoff) => handoff.issueId === issue.issueId).at(-1)?.state)}
                  </span>
                </span>
                <span className={`pill status-${issue.status}`}>{statusLabel(issue.status)}</span>
              </button>
            ))}
            {!filteredIssues.length ? (
              <div className="empty-state compact">
                <strong>No issues match this queue.</strong>
                <span>Change the status, proof mode, or search text.</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="page-stack">
        <form action={submit} className="panel pad form-grid">
          <div>
            <span className="eyebrow">Steward action</span>
            <h2 style={{ marginBottom: 0 }}>Create status proof</h2>
          </div>
          <label className="field">
            <span>Selected issue</span>
            <select name="issueId" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
              {issues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  #{issue.issueId} - {issue.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>New status</span>
            <select key={selected.id} name="newStatus" defaultValue={statusOptions.includes('in_progress') ? 'in_progress' : statusOptions[0]}>
              {statuses.filter((status) => statusOptions.includes(status.id)).map((status) => (
                <option key={status.id} value={status.id}>{status.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Public note</span>
            <textarea name="note" rows={4} placeholder="What changed, who verified it, and what evidence supports the update." />
          </label>
          <label className="field">
            <span>Resolution proof photo</span>
            <input name="proofPhoto" type="file" accept="image/png,image/jpeg,image/webp" />
            <span className="helper">A different after-state image and a public note are required when marking a record resolved.</span>
          </label>
          <label className="field">
            <span>Manual proof hash for non-resolution updates</span>
            <input name="proofHash" placeholder="Optional 64-character SHA-256 hash" />
          </label>
          <button type="submit" className="button crimson" disabled={busy || selectedSeeded || selectedClosed}>
            {busy ? <WarningCircle size={17} weight="bold" /> : <UploadSimple size={17} weight="bold" />}
            {busy ? 'Anchoring update...' : 'Create StatusUpdate PDA'}
          </button>
          <p className={result && !result.ok ? 'proof-bad' : 'muted'} role="status" style={{ lineHeight: 1.55 }}>
            {message}
          </p>
        </form>

        <StewardHandoffForm
          key={`${selected.id}-${latestHandoff?.eventHash ?? 'no-handoff'}`}
          issue={selected}
          handoffs={selectedHandoffs}
          secret={secret}
        />

        <form action={moderate} className="panel pad form-grid">
          <div>
            <span className="eyebrow">Safety moderation</span>
            <h2 style={{ marginBottom: 0 }}>Control media and discovery</h2>
          </div>
          <label className="field">
            <span>Review outcome</span>
            <select
              key={`${selected.id}-${selected.safetyReviewStatus}`}
              name="safetyReviewStatus"
              defaultValue={selected.safetyReviewStatus}
            >
              <option value="visible">Visible</option>
              <option value="hidden_media">Hide media, retain record</option>
              <option value="disputed">Visible with disputed review</option>
              <option value="rejected">Remove from public discovery</option>
              <option value="resolved" disabled={selected.status !== 'resolved'}>Resolved safety review</option>
            </select>
          </label>
          <label className="field">
            <span>Moderation note</span>
            <textarea
              name="moderationNote"
              rows={3}
              required
              minLength={8}
              maxLength={500}
              placeholder="State the observable safety reason without naming or accusing a person."
            />
          </label>
          <button type="submit" className="button dark" disabled={moderationBusy || selectedSeeded}>
            {moderationBusy ? <WarningCircle size={17} weight="bold" /> : <EyeSlash size={17} weight="bold" />}
            {moderationBusy ? 'Applying review...' : 'Apply safety review'}
          </button>
          <p className={moderationResult && !moderationResult.ok ? 'proof-bad' : 'muted'} role="status" style={{ lineHeight: 1.55 }}>
            {moderationMessage}
          </p>
        </form>

        <aside className="panel pad">
          <span className="eyebrow">Selected issue</span>
          <h2>{selected.title}</h2>
          <div className="badge-row">
            <span className="pill">{categoryLabel(selected.category)}</span>
            <span className={`pill status-${selected.status}`}>{statusLabel(selected.status)}</span>
            <span className="pill">{selected.locality}</span>
            <span className="pill">{selected.safetyReviewStatus.replaceAll('_', ' ')}</span>
            <span className={`pill handoff-state handoff-state-${latestHandoff?.state ?? 'none'}`}>{handoffStateLabel(latestHandoff?.state)}</span>
          </div>
          <p className="muted" style={{ lineHeight: 1.6 }}>{selected.description}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="hash-row">
              <span className="muted">Issue PDA</span>
              <code className="mono">{shortText(selected.proof.issuePda, 13, 10)}</code>
            </div>
            <div className="hash-row">
              <span className="muted">Timeline hash</span>
              <code className="mono">{shortText(selected.proof.timelineHash, 13, 10)}</code>
            </div>
            <div className="hash-row">
              <span className="muted">Last update</span>
              <code className="mono">{formatDateTime(lastTimeline?.createdAt)}</code>
            </div>
            <div className="hash-row">
              <span className="muted">Handoff event</span>
              <code className="mono">{latestHandoff ? `#${latestHandoff.seq} / ${shortText(latestHandoff.eventHash, 9, 7)}` : 'not routed'}</code>
            </div>
          </div>
          {selectedSeeded ? (
            <div className="notice" style={{ marginTop: 14 }}>
              Sample records are illustrative and cannot create live status PDAs.
            </div>
          ) : null}
          {selectedClosed ? (
            <div className="notice" style={{ marginTop: 14 }}>
              Closed issues freeze the elapsed counter and cannot be updated again.
            </div>
          ) : null}
          {result?.ok ? (
            <div className="notice" style={{ marginTop: 14 }}>
              StatusUpdate #{result.seq} moved this issue from {result.oldStatus ? statusLabel(result.oldStatus) : 'previous status'} to{' '}
              {result.newStatus ? statusLabel(result.newStatus) : 'new status'}. Proof hash:{' '}
              <code className="mono">{shortText(result.proofHash, 12, 10)}</code>
              {result.explorerUrl ? (
                <>
                  {' '}
                  <a href={result.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>
                </>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
