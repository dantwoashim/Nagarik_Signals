import { notFound } from 'next/navigation';
import Image from 'next/image';
import { ArrowSquareOut, Clock, ImageSquare, Newspaper, Pulse, ShieldCheck, ShieldWarning } from '@phosphor-icons/react/dist/ssr';
import { DaysIgnoredBadge } from '@/components/DaysIgnoredBadge';
import { IssueMap } from '@/components/IssueMap';
import { ProofPanel } from '@/components/ProofPanel';
import { StatusTimeline } from '@/components/StatusTimeline';
import { VerifyButton } from '@/components/VerifyButton';
import { categoryLabel } from '@/lib/constants/categories';
import { statusLabel } from '@/lib/constants/statuses';
import { getIssue } from '@/lib/db/queries';
import { inferredRecordKind, recordKindLabel, sourceFreshness } from '@/lib/issues/recordKind';
import { formatDateTime, shortText } from '@/lib/ui/format';

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) notFound();
  const kind = inferredRecordKind(issue);
  const sourceState = sourceFreshness(issue);
  const mediaVisible = issue.safetyReviewStatus !== 'hidden_media' && issue.safetyReviewStatus !== 'rejected';

  const evidence = (
    <figure id="evidence" className={`issue-evidence ${kind === 'public_source' ? 'source-dossier' : ''}`}>
      {mediaVisible ? (
        <div className="issue-evidence-media">
          <Image
            src={issue.photoUrl}
            alt={kind === 'public_source' ? `Public-source dossier for ${issue.title}` : kind === 'illustrative_sample' ? `Illustrative sample for ${issue.title}` : `Evidence for ${issue.title}`}
            fill
            priority
            sizes="(max-width: 900px) 100vw, 66vw"
          />
        </div>
      ) : (
        <div className="issue-evidence-media media-withheld" role="img" aria-label="Evidence media withheld after safety review">
          <ShieldWarning size={42} weight="regular" />
          <strong>Media withheld after safety review</strong>
          <span>The on-chain evidence commitment remains inspectable.</span>
        </div>
      )}
      <figcaption>
        <span>{kind === 'public_source' ? 'Anchored source-dossier artifact' : kind === 'illustrative_sample' ? 'Illustrative sample evidence' : kind === 'qa_fixture' ? 'Technical test artifact' : 'Sanitized community evidence'}</span>
        <span>Approximate location / {issue.locality}</span>
      </figcaption>
    </figure>
  );

  const provenance = issue.provenance ? (
    <section id="source" className="panel pad issue-provenance" aria-labelledby="source-heading">
      <div className="provenance-heading">
        <div>
          <span className="eyebrow"><Newspaper size={15} weight="bold" /> Public-source record</span>
          <h2 id="source-heading">What this record can prove</h2>
        </div>
        <span className={`pill ${sourceState === 'recheck_due' ? 'status-disputed' : 'proof-ok'}`}>
          {sourceState === 'recheck_due' ? 'recheck due' : 'within review window'}
        </span>
      </div>
      <p>
        This page proves that the cited public claim and this summary were committed at a specific time. It is not a firsthand field observation and does not prove the issue is unchanged today.
      </p>
      <dl className="provenance-grid">
        <div><dt>Publisher</dt><dd>{issue.provenance.publisher}</dd></div>
        <div><dt>Published</dt><dd>{formatDateTime(issue.provenance.publishedAt)}</dd></div>
        <div><dt>Source checked</dt><dd>{formatDateTime(issue.provenance.checkedAt)}</dd></div>
        <div><dt>Next review</dt><dd>{issue.provenance.expiresAt ? formatDateTime(issue.provenance.expiresAt) : 'No automatic expiry'}</dd></div>
      </dl>
      <div className="row-actions">
        <a className="button dark" href={issue.provenance.sourceUrl} target="_blank" rel="noreferrer">
          Read original source <ArrowSquareOut size={17} weight="bold" />
        </a>
        {issue.provenance.escalationUrl ? (
          <a className="button secondary" href={issue.provenance.escalationUrl} target="_blank" rel="noreferrer">
            Open official grievance channel
          </a>
        ) : null}
      </div>
    </section>
  ) : null;

  const resolution = issue.resolutionPhotoUrl ? (
    <section className="panel pad issue-resolution">
      <span className="eyebrow">Resolution artifact</span>
      <figure className="resolution-media">
        <Image src={issue.resolutionPhotoUrl} alt={`Resolution artifact for ${issue.title}`} fill sizes="(max-width: 900px) 100vw, 66vw" />
      </figure>
      <div className="hash-row" style={{ marginTop: 12 }}>
        <span className="muted">Resolution hash</span>
        <code className="mono">{shortText(issue.resolutionHash, 14, 14)}</code>
      </div>
      <p className="muted" style={{ lineHeight: 1.6 }}>
        A platform steward attached this after-state artifact. It is not an official government completion claim.
      </p>
    </section>
  ) : null;

  return (
    <section className="container page-section issue-page">
      <div className="page-heading issue-heading">
        <div className="badge-row">
          <span className="pill">{recordKindLabel(issue)}</span>
          <span className="pill">{categoryLabel(issue.category)}</span>
          <span className={`pill status-${issue.status}`}>{statusLabel(issue.status)}</span>
          <DaysIgnoredBadge issue={issue} />
        </div>
        <h1 className="issue-title">{issue.title}</h1>
        <p>{issue.description}</p>
      </div>

      <nav className="issue-jump-nav" aria-label="Issue page sections">
        <a href="#evidence"><ImageSquare size={17} weight="bold" />Evidence</a>
        <a href="#activity"><Pulse size={17} weight="bold" />Activity</a>
        <a href="#proof"><ShieldCheck size={17} weight="bold" />Verify proof</a>
      </nav>

      {kind === 'qa_fixture' ? (
        <div className="fixture-boundary" role="note">
          This is a retained engineering fixture. It is excluded from public discovery, maps, leaderboards, and civic totals.
        </div>
      ) : null}

      <div className="issue-layout">
        <div className="issue-top-grid">
          {evidence}
          <div className="issue-action-stack">
            {provenance}
            <div className="issue-verify"><VerifyButton issue={issue} /></div>
          </div>
        </div>

        <div className="issue-lower-grid">
          <div className="issue-history-stack">
            {resolution}
            <div id="activity" className="issue-timeline"><StatusTimeline issue={issue} /></div>
            <div id="location" className="issue-map"><IssueMap issue={issue} /></div>
          </div>
          <div className="issue-context-stack">
            <div className="issue-proof"><ProofPanel issue={issue} /></div>
            <section className="panel pad issue-summary">
              <span className="eyebrow">Record summary</span>
              <div className="hash-row"><span className="muted">Issue number</span><code className="mono">#{issue.issueId}</code></div>
              <div className="hash-row"><span className="muted">Record origin</span><code className="mono">{recordKindLabel(issue)}</code></div>
              <div className="hash-row"><span className="muted">Safety review</span><code className="mono">{issue.safetyReviewStatus.replaceAll('_', ' ')}</code></div>
              <div className="hash-row"><span className="muted">First observed or published</span><code className="mono">{formatDateTime(issue.firstObservedAt)}</code></div>
              <div className="hash-row"><span className="muted">Chain signer mode</span><code className="mono">{issue.reporterMode}</code></div>
              <div className="hash-row"><span className="muted">Chain signer</span><code className="mono">{shortText(issue.reporterPubkey, 14, 10)}</code></div>
              {issue.resolutionPhotoUrl ? (
                <div className="hash-row"><span className="muted">Resolution artifact</span><a href={issue.resolutionPhotoUrl}>Open uploaded artifact</a></div>
              ) : null}
            </section>
            <div className="notice issue-safety"><Clock size={17} weight="bold" /> Public pages use approximate locations. Community images are sanitized before storage; source dossiers retain their publisher link and review date.</div>
          </div>
        </div>
      </div>
    </section>
  );
}
