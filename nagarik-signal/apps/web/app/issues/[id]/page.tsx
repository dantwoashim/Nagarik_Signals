import { notFound } from 'next/navigation';
import { DaysIgnoredBadge } from '@/components/DaysIgnoredBadge';
import { IssueMap } from '@/components/IssueMap';
import { ProofPanel } from '@/components/ProofPanel';
import { StatusTimeline } from '@/components/StatusTimeline';
import { VerifyButton } from '@/components/VerifyButton';
import { categoryLabel } from '@/lib/constants/categories';
import { statusLabel } from '@/lib/constants/statuses';
import { getIssue } from '@/lib/db/queries';
import { formatDateTime, shortText } from '@/lib/ui/format';

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = getIssue(id);
  if (!issue) notFound();
  return (
    <section className="container page-section page-stack">
      <div className="page-heading">
        <div className="badge-row">
          <span className="pill">{categoryLabel(issue.category)}</span>
          <span className={`pill status-${issue.status}`}>{statusLabel(issue.status)}</span>
          <DaysIgnoredBadge issue={issue} />
        </div>
        <h1 className="issue-title" style={{ maxWidth: 920, marginBottom: 8 }}>{issue.title}</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>{issue.description}</p>
      </div>
      <div className="split-main">
        <div className="page-stack">
          <div className="panel evidence-media" style={{ minHeight: 360, backgroundImage: `url(${issue.photoUrl})` }} aria-label="Issue evidence image" />
          {issue.resolutionPhotoUrl ? (
            <section className="panel pad">
              <span className="eyebrow">Resolution proof</span>
              <div
                className="panel evidence-media"
                style={{ minHeight: 260, marginTop: 14, backgroundImage: `url(${issue.resolutionPhotoUrl})` }}
                aria-label="Resolution proof image"
              />
              <div className="hash-row" style={{ marginTop: 12 }}>
                <span className="muted">Resolution hash</span>
                <code className="mono">{shortText(issue.resolutionHash, 14, 14)}</code>
              </div>
              <p className="muted" style={{ lineHeight: 1.6 }}>
                Resolution proof is a steward-submitted after-state record. It is public evidence, not an official government completion claim.
              </p>
            </section>
          ) : null}
          <section className="panel pad">
            <span className="eyebrow">Evidence summary</span>
            <div className="hash-row">
              <span className="muted">Issue number</span>
              <code className="mono">#{issue.issueId}</code>
            </div>
            <div className="hash-row">
              <span className="muted">First observed</span>
              <code className="mono">{formatDateTime(issue.firstObservedAt)}</code>
            </div>
            <div className="hash-row">
              <span className="muted">Reporter mode</span>
              <code className="mono">{issue.reporterMode}</code>
            </div>
            <div className="hash-row">
              <span className="muted">Reporter key</span>
              <code className="mono">{shortText(issue.reporterPubkey, 14, 10)}</code>
            </div>
            {issue.resolutionPhotoUrl ? (
              <div className="hash-row">
                <span className="muted">Resolution proof</span>
                <a href={issue.resolutionPhotoUrl}>Open uploaded proof</a>
              </div>
            ) : null}
          </section>
          <StatusTimeline issue={issue} />
        </div>
        <div className="page-stack" style={{ alignContent: 'start' }}>
          <ProofPanel issue={issue} />
          <VerifyButton issue={issue} />
          <IssueMap issue={issue} />
          <div className="notice">
            Public issue pages show approximate locations and sanitized images only. Unsafe media can be hidden without deleting the proof trail.
          </div>
        </div>
      </div>
    </section>
  );
}
