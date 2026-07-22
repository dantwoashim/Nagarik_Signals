import { notFound } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowSquareOut,
  ImageSquare,
  MapPin,
  Newspaper,
  PaperPlaneTilt,
  Pulse,
  ShieldCheck,
  ShieldWarning,
} from '@phosphor-icons/react/dist/ssr';
import { DaysIgnoredBadge } from '@/components/DaysIgnoredBadge';
import { HandoffTimeline } from '@/components/HandoffTimeline';
import { IssueActions } from '@/components/IssueActions';
import { IssueMap } from '@/components/IssueMap';
import { ProofPanel } from '@/components/ProofPanel';
import { StatusTimeline } from '@/components/StatusTimeline';
import { VerifyButton } from '@/components/VerifyButton';
import { categoryLabel } from '@/lib/constants/categories';
import { publicStatusLabel } from '@/lib/constants/statuses';
import { getIssue, listAuthorityHandoffs } from '@/lib/db/queries';
import { inferredRecordKind, recordKindLabel, sourceFreshness } from '@/lib/issues/recordKind';
import type { HandoffState } from '@/lib/types';
import { formatDateTime, shortText } from '@/lib/ui/format';

const followUpLabels: Record<HandoffState, string> = {
  prepared: 'Not sent yet',
  submitted: 'Sent with reference',
  acknowledged: 'Receipt attached',
  follow_up: 'Follow-up logged',
  closed: 'Tracking closed',
};

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) notFound();

  const kind = inferredRecordKind(issue);
  const handoffEligible = kind === 'community_report' || kind === 'public_source';
  const authorityHandoffs = handoffEligible ? await listAuthorityHandoffs(issue.issueId) : [];
  const currentHandoff = [...authorityHandoffs].sort((left, right) => left.seq - right.seq).at(-1) ?? null;
  const sourceState = sourceFreshness(issue);
  const mediaVisible = issue.safetyReviewStatus !== 'hidden_media' && issue.safetyReviewStatus !== 'rejected';
  const canSignal = (kind === 'community_report' || kind === 'public_source') && issue.status !== 'resolved' && issue.status !== 'rejected';
  const officialUrl = currentHandoff?.channelUrl ?? issue.provenance?.escalationUrl ?? null;
  const currentKnowledge = kind === 'public_source' && sourceState === 'recheck_due'
    ? 'Needs a current field check'
    : publicStatusLabel(issue.status);
  const integrityState = kind === 'illustrative_sample' || kind === 'qa_fixture'
    ? 'Local sample only'
    : issue.proof.proofStatus === 'mismatch'
      ? 'Stored mismatch'
      : 'Solana account available';

  const evidence = (
    <figure id="evidence" className={`issue-evidence ${kind === 'public_source' ? 'source-dossier' : ''}`}>
      {mediaVisible ? (
        <div className="issue-evidence-media">
          <Image
            src={issue.photoUrl}
            alt={kind === 'public_source' ? `Public-source dossier for ${issue.title}` : kind === 'illustrative_sample' ? `Illustrative sample for ${issue.title}` : `Evidence for ${issue.title}`}
            fill
            priority
            sizes="(max-width: 900px) 100vw, 1100px"
          />
        </div>
      ) : (
        <div className="issue-evidence-media media-withheld" role="img" aria-label="Evidence media withheld after safety review">
          <ShieldWarning size={42} weight="regular" />
          <strong>Media withheld after safety review</strong>
          <span>The evidence commitment remains available in the technical record.</span>
        </div>
      )}
      <figcaption>
        <span>{kind === 'public_source' ? 'Public-source artifact' : kind === 'illustrative_sample' ? 'Illustrative sample' : kind === 'qa_fixture' ? 'Technical fixture' : 'Sanitized community evidence'}</span>
        <span>Approximate area: {issue.locality}</span>
      </figcaption>
    </figure>
  );

  const provenance = issue.provenance ? (
    <section id="source" className="issue-provenance" aria-labelledby="source-heading">
      <div className="provenance-heading">
        <div>
          <span className="eyebrow"><Newspaper size={15} weight="bold" /> Public source</span>
          <h2 id="source-heading">Source</h2>
        </div>
        <span className={`pill ${sourceState === 'recheck_due' ? 'status-disputed' : 'proof-ok'}`}>
          {sourceState === 'recheck_due' ? 'Recheck due' : 'Recently checked'}
        </span>
      </div>
      <p>This preserves the cited report. Current conditions still need checking.</p>
      <dl className="provenance-grid">
        <div><dt>Publisher</dt><dd>{issue.provenance.publisher}</dd></div>
        <div><dt>Published</dt><dd>{formatDateTime(issue.provenance.publishedAt)}</dd></div>
        <div><dt>Last checked</dt><dd>{formatDateTime(issue.provenance.checkedAt)}</dd></div>
        <div><dt>Next review</dt><dd>{issue.provenance.expiresAt ? formatDateTime(issue.provenance.expiresAt) : 'No scheduled review'}</dd></div>
      </dl>
      <a className="button secondary" href={issue.provenance.sourceUrl} target="_blank" rel="noreferrer">
        Read original source <ArrowSquareOut size={17} weight="bold" />
      </a>
    </section>
  ) : null;

  const resolution = issue.resolutionPhotoUrl ? (
    <section className="issue-resolution" aria-labelledby="resolution-heading">
      <div>
        <span className="eyebrow">After-state artifact</span>
        <h2 id="resolution-heading">Resolution evidence</h2>
        <p>A steward attached this artifact. It is not an official government completion claim.</p>
      </div>
      <figure className="resolution-media">
        <Image src={issue.resolutionPhotoUrl} alt={`Resolution artifact for ${issue.title}`} fill sizes="(max-width: 900px) 100vw, 560px" />
      </figure>
      <details>
        <summary>Technical hash</summary>
        <code className="mono">{shortText(issue.resolutionHash, 14, 14)}</code>
      </details>
    </section>
  ) : null;

  return (
    <section className="container page-section issue-page">
      <header className="issue-heading">
        <div className="badge-row">
          <span className="pill">{recordKindLabel(issue)}</span>
          <span className="pill">{categoryLabel(issue.category)}</span>
          <span className={`pill status-${issue.status}`}>{publicStatusLabel(issue.status)}</span>
          <DaysIgnoredBadge issue={issue} />
        </div>
        <h1 className="issue-title">{issue.title}</h1>
        <p>{issue.description}</p>

        <dl className="issue-knowledge" aria-label="Current issue summary">
          <div><dt>Current knowledge</dt><dd>{currentKnowledge}</dd></div>
          <div><dt>Public record</dt><dd>{integrityState}</dd></div>
          <div><dt>Official follow-up</dt><dd>{currentHandoff ? followUpLabels[currentHandoff.state] : 'Not sent yet'}</dd></div>
          <div><dt>Public attention</dt><dd>{issue.verificationCount} signal{issue.verificationCount === 1 ? '' : 's'}</dd></div>
        </dl>

        <IssueActions title={issue.title} officialUrl={officialUrl} canSignal={canSignal} />
      </header>

      <nav className="issue-jump-nav" aria-label="Issue page sections">
        <a href="#evidence"><ImageSquare size={17} weight="bold" /> Evidence</a>
        {handoffEligible ? <a href="#handoff"><PaperPlaneTilt size={17} weight="bold" /> Follow-up</a> : null}
        <a href="#activity"><Pulse size={17} weight="bold" /> History</a>
        <a href="#location"><MapPin size={17} weight="bold" /> Location</a>
        <a href="#proof"><ShieldCheck size={17} weight="bold" /> Integrity</a>
      </nav>

      {kind === 'qa_fixture' ? (
        <div className="fixture-boundary" role="note">
          This engineering fixture is excluded from public discovery, maps, and civic totals.
        </div>
      ) : null}

      <div className="issue-dossier">
        <div className="issue-evidence-block">
          {evidence}
          {provenance}
        </div>
        {handoffEligible ? <div id="handoff"><HandoffTimeline issue={issue} handoffs={authorityHandoffs} /></div> : null}
        {canSignal ? <VerifyButton issue={issue} /> : null}
        {resolution}
        <div id="activity"><StatusTimeline issue={issue} /></div>
        <div id="location"><IssueMap issue={issue} /></div>
        <ProofPanel issue={issue} />
      </div>
    </section>
  );
}
