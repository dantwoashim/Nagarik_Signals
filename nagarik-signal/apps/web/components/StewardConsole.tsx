'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FunnelSimple, LockKey, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { categoryLabel } from '@/lib/constants/categories';
import { isClosedStatus, statuses, statusLabel } from '@/lib/constants/statuses';
import type { CivicIssue, IssueStatus } from '@/lib/types';
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
  error?: string;
};

type QueueStatus = 'open' | 'all' | IssueStatus;
type ProofFilter = 'indexed' | 'demo' | 'all';

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

export function StewardConsole({ issues }: { issues: CivicIssue[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(issues[0]?.id ?? '');
  const [statusFilter, setStatusFilter] = useState<QueueStatus>('open');
  const [proofFilter, setProofFilter] = useState<ProofFilter>('indexed');
  const [query, setQuery] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Ready to update an indexed issue.');
  const [result, setResult] = useState<StatusResult | null>(null);
  const selected = useMemo(() => issues.find((issue) => issue.id === selectedId) ?? issues[0] ?? null, [issues, selectedId]);
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
      if (proofFile instanceof File && proofFile.size > 0) {
        setMessage('Uploading and sanitizing resolution proof...');
        const upload = await uploadProof(proofFile);
        resolutionPhotoUrl = upload.photoUrl;
        resolutionEvidenceHash = upload.evidenceHash;
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

  if (!selected) {
    return <div className="notice">No visible issues are available for steward review.</div>;
  }

  const selectedClosed = isClosedStatus(selected.status);
  const selectedSeeded = selected.proof.proofStatus === 'seeded_demo';
  const lastTimeline = selected.timeline.at(-1);

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
                <option value="demo">Seeded demo</option>
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
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>{issue.locality}</span>
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
            <select key={selected.id} name="newStatus" defaultValue={selected.status === 'submitted' ? 'in_progress' : 'resolved'}>
              {statuses.map((status) => (
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
            <span className="helper">Required when resolving unless you provide a manual 64-character proof hash.</span>
          </label>
          <label className="field">
            <span>Manual proof hash</span>
            <input name="proofHash" placeholder="Optional 64-character sha256 hash" />
          </label>
          <button type="submit" className="button crimson" disabled={busy || selectedSeeded || selectedClosed}>
            {busy ? <WarningCircle size={17} weight="bold" /> : <UploadSimple size={17} weight="bold" />}
            {busy ? 'Anchoring update...' : 'Create StatusUpdate PDA'}
          </button>
          <p className={result && !result.ok ? 'proof-bad' : 'muted'} role="status" style={{ lineHeight: 1.55 }}>
            {message}
          </p>
        </form>

        <aside className="panel pad">
          <span className="eyebrow">Selected issue</span>
          <h2>{selected.title}</h2>
          <div className="badge-row">
            <span className="pill">{categoryLabel(selected.category)}</span>
            <span className={`pill status-${selected.status}`}>{statusLabel(selected.status)}</span>
            <span className="pill">{selected.locality}</span>
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
          </div>
          {selectedSeeded ? (
            <div className="notice" style={{ marginTop: 14 }}>
              Seeded demo issues are visible for judging but cannot create live status PDAs.
            </div>
          ) : null}
          {selectedClosed ? (
            <div className="notice" style={{ marginTop: 14 }}>
              Closed issues freeze the ignored counter and are not updated again in the demo flow.
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
