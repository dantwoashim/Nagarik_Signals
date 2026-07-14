import Link from 'next/link';
import { ArrowRight, CheckCircle, Eye, MapPin, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { DashboardStats } from '@/components/DashboardStats';
import { IssueCard } from '@/components/IssueCard';
import { dashboardStats, daysIgnored, latestIndexedIssue, listIssues, mostIgnoredIssues } from '@/lib/db/queries';
import { appConfig } from '@/lib/constants/config';
import { categoryLabel } from '@/lib/constants/categories';
import { isClosedStatus, statusLabel } from '@/lib/constants/statuses';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { shortText } from '@/lib/ui/format';

export default function HomePage() {
  const stats = dashboardStats();
  const allIssues = listIssues({ sort: 'most_ignored', limit: 100 });
  const ignoredIssues = mostIgnoredIssues(4);
  const issues = ignoredIssues.length ? ignoredIssues : allIssues.slice(0, 4);
  const spotlight = issues[0];
  const liveIssue = latestIndexedIssue();
  const liveCount = allIssues.filter((issue) => issue.proof.proofStatus !== 'seeded_demo').length;
  const sampleCount = allIssues.length - liveCount;
  const spotlightDays = spotlight ? daysIgnored(spotlight) : 0;
  const spotlightClosed = spotlight ? isClosedStatus(spotlight.status) : false;
  const primaryHref = publicPreviewReadOnly
    ? liveIssue ? `/issues/${liveIssue.id}#proof` : '/explore'
    : '/report';
  const primaryLabel = publicPreviewReadOnly
    ? liveIssue ? 'Verify a live record' : 'Browse public records'
    : 'Report an issue';
  return (
    <div>
      <section className="home-hero" style={spotlight ? { '--hero-image': `url(${spotlight.photoUrl})` } as React.CSSProperties : undefined}>
        <div className="container home-hero-inner">
          <div className="hero-copy">
            <span className="eyebrow inverse">Civic memory, anchored on Solana</span>
            <h1>{appConfig.tagline}</h1>
            <p>{appConfig.positioning}</p>
            <div className="hero-actions">
              <Link className="button primary" href={primaryHref}>{primaryLabel} <ArrowRight size={17} weight="bold" /></Link>
              <Link className="button light" href="/explore">Explore public records</Link>
            </div>
            {liveIssue ? (
              <Link className="live-proof-receipt" href={`/issues/${liveIssue.id}#proof`} aria-label={`Verify live devnet issue ${liveIssue.issueId}`}>
                <span className="live-proof-state"><CheckCircle size={17} weight="fill" /> Live on devnet</span>
                <span><small>Issue account</small><strong className="mono">#{liveIssue.issueId} / {shortText(liveIssue.proof.issuePda, 6, 6)}</strong></span>
                <span><small>Public trail</small><strong>{liveIssue.verificationCount} signals / {liveIssue.updateCount} updates</strong></span>
                <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          {spotlight ? (
            <Link className="hero-record" href={`/issues/${spotlight.id}`} aria-label={`Open ${spotlight.title}`}>
              <div className="hero-record-topline">
                <span>{spotlight.proof.proofStatus === 'seeded_demo' ? 'Clearly marked sample record' : 'Live devnet proof'}</span>
                <span>#{spotlight.issueId}</span>
              </div>
              <div className="hero-day-count">
                <strong className="mono">{spotlightDays}</strong>
                <span>{spotlightClosed ? 'days to close' : 'days ignored'}</span>
              </div>
              <h2>{spotlight.title}</h2>
              <div className="hero-record-meta">
                <span><MapPin size={15} weight="bold" />{spotlight.locality}</span>
                <span><Eye size={15} weight="bold" />{spotlight.verificationCount} citizen signals</span>
              </div>
              <div className="hero-record-footer">
                <span>{categoryLabel(spotlight.category)} / {statusLabel(spotlight.status)}</span>
                <ArrowRight size={18} weight="bold" />
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="home-metrics">
        <div className="container"><DashboardStats stats={stats} liveCount={liveCount} sampleCount={sampleCount} /></div>
      </section>

      <section className="container home-story">
        <div className="section-heading">
          <span className="eyebrow">The public record</span>
          <h2>A complaint can vanish. A proof trail cannot.</h2>
          <p>Nagarik Signal turns a safe civic report into a timestamped record people can witness, track, and independently inspect.</p>
        </div>
        <div className="proof-sequence">
          <article>
            <span className="sequence-number mono">01</span>
            <ShieldCheck size={26} weight="regular" />
            <h3>Evidence is committed</h3>
            <p>The image is sanitized, the location is made approximate, and the record receives evidence and metadata hashes.</p>
          </article>
          <article>
            <span className="sequence-number mono">02</span>
            <Eye size={26} weight="regular" />
            <h3>Citizens witness it</h3>
            <p>Each civic session can signal once. Duplicate verification is rejected instead of inflating public confidence.</p>
          </article>
          <article>
            <span className="sequence-number mono">03</span>
            <CheckCircle size={26} weight="regular" />
            <h3>Every update leaves a trail</h3>
            <p>Steward status changes and resolution evidence remain attached to a public, inspectable timeline.</p>
          </article>
        </div>
      </section>

      <section className="home-records">
        <div className="container page-stack">
          <div className="section-heading-row">
            <div className="section-heading compact">
              <span className="eyebrow">Longest waiting</span>
              <h2>What the city is still carrying</h2>
              <p>Live and sample records are never presented as the same kind of proof.</p>
            </div>
            <Link className="text-link" href="/explore">See every record <ArrowRight size={16} weight="bold" /></Link>
          </div>
          <div className="issue-grid">
            {issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
          </div>
        </div>
      </section>

      <section className="container verification-path">
        <div>
          <span className="eyebrow">Independent verification</span>
          <h2>Do not trust the interface. Verify the record.</h2>
          <p>Open a live issue, recompute its proof, and compare the stored hashes with the Solana devnet account.</p>
        </div>
        <div className="row-actions">
          <Link className="button dark" href="/about">See how verification works</Link>
          <Link className="button secondary" href="/dashboard">Open accountability dashboard</Link>
        </div>
      </section>
    </div>
  );
}
