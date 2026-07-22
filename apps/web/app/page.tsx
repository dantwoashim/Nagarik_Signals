import Link from 'next/link';
import { ArrowRight, CheckCircle, Eye, MapPin, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { DashboardStats } from '@/components/DashboardStats';
import { IssueCard } from '@/components/IssueCard';
import { dashboardStats, daysIgnored, latestIndexedIssue, listIssues, mostIgnoredIssues } from '@/lib/db/queries';
import { appConfig } from '@/lib/constants/config';
import { categoryLabel } from '@/lib/constants/categories';
import { statusLabel } from '@/lib/constants/statuses';
import { publicPreviewReadOnly } from '@/lib/deployment';
import { inferredRecordKind, recordKindLabel } from '@/lib/issues/recordKind';
import { shortText } from '@/lib/ui/format';

export default async function HomePage() {
  const [stats, allIssues, ignoredIssues, liveIssue, samples] = await Promise.all([
    dashboardStats(),
    listIssues({ scope: 'public', sort: 'newest', limit: 100 }),
    mostIgnoredIssues(4),
    latestIndexedIssue(),
    listIssues({ scope: 'samples', limit: 100 }),
  ]);
  const issues = ignoredIssues.length ? ignoredIssues : allIssues.slice(0, 4);
  const spotlight = issues[0];
  const liveCount = allIssues.length;
  const sampleCount = samples.length;
  const spotlightDays = spotlight ? daysIgnored(spotlight) : 0;
  const spotlightKind = spotlight ? inferredRecordKind(spotlight) : null;
  const primaryHref = publicPreviewReadOnly
    ? liveIssue ? `/issues/${liveIssue.id}#proof` : '/explore'
    : '/report';
  const primaryLabel = publicPreviewReadOnly
    ? liveIssue ? 'Verify a public record' : 'Browse public records'
    : 'Report an issue';

  return (
    <div>
      <section className="home-hero" style={spotlight ? { '--hero-image': `url(${spotlight.photoUrl})` } as React.CSSProperties : undefined}>
        <div className="container home-hero-inner">
          <div className="hero-copy">
            <span className="eyebrow inverse">Public civic memory, anchored on Solana</span>
            <h1>{appConfig.tagline}</h1>
            <p>{appConfig.positioning}</p>
            <div className="hero-actions">
              <Link className="button primary" href={primaryHref}>{primaryLabel} <ArrowRight size={17} weight="bold" /></Link>
              <Link className="button light" href="/explore">Open the civic watchlist</Link>
            </div>
            {liveIssue ? (
              <Link className="live-proof-receipt" href={`/issues/${liveIssue.id}#proof`} aria-label={`Verify public devnet record ${liveIssue.issueId}`}>
                <span className="live-proof-state"><CheckCircle size={17} weight="fill" /> Anchored on devnet</span>
                <span><small>Issue account</small><strong className="mono">#{liveIssue.issueId} / {shortText(liveIssue.proof.issuePda, 6, 6)}</strong></span>
                <span><small>Public trail</small><strong>{liveIssue.verificationCount} signals / {liveIssue.updateCount} updates</strong></span>
                <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          {spotlight ? (
            <Link className="hero-record" href={`/issues/${spotlight.id}`} aria-label={`Open ${spotlight.title}`}>
              <div className="hero-record-topline">
                <span><i className="status-dot" aria-hidden="true" />{recordKindLabel(spotlight)}</span>
                <span>#{spotlight.issueId}</span>
              </div>
              <div className="hero-day-count">
                <strong className="mono">{spotlightDays}</strong>
                <span>{spotlightKind === 'public_source' ? 'days since source report' : 'days observed'}</span>
              </div>
              <h2>{spotlight.title}</h2>
              <div className="hero-record-meta">
                <span><MapPin size={15} weight="bold" />{spotlight.locality}</span>
                <span><Eye size={15} weight="bold" />{spotlight.verificationCount} public signals</span>
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
          <div className="section-heading-kicker"><span className="eyebrow">The public record</span><span className="mono">01 / 03</span></div>
          <h2>Evidence can leave a feed. Its anchored fingerprint stays inspectable.</h2>
          <p>Nagarik Signal preserves a safe civic report or checked public-source dossier as a timestamped record people can track, recheck, and independently inspect.</p>
        </div>
        <div className="proof-sequence">
          <article>
            <span className="sequence-number mono">01</span>
            <ShieldCheck size={26} weight="regular" />
            <h3>The origin is disclosed</h3>
            <p>Community reports, public sources, illustrative samples, and technical fixtures are separate record classes with separate claims.</p>
          </article>
          <article>
            <span className="sequence-number mono">02</span>
            <Eye size={26} weight="regular" />
            <h3>The delivered bytes are checked</h3>
            <p>The verifier fetches the visible artifact, hashes its actual bytes, and compares them with both the read model and Solana.</p>
          </article>
          <article>
            <span className="sequence-number mono">03</span>
            <CheckCircle size={26} weight="regular" />
            <h3>Follow-up stays accountable</h3>
            <p>Review dates, public signals, steward updates, official-channel links, and resolution artifacts remain attached to one timeline.</p>
          </article>
        </div>
      </section>

      <section className="home-records">
        <div className="container page-stack">
          <div className="section-heading-row">
            <div className="section-heading compact">
              <div className="section-heading-kicker"><span className="eyebrow">Source-backed watchlist</span><span className="mono">02 / 03</span></div>
              <h2>Documented issues that still need a current answer</h2>
              <p>Each dossier links to its publisher, records when the source was checked, and expires into a visible recheck state.</p>
            </div>
            <Link className="text-link" href="/explore">See every public record <ArrowRight size={16} weight="bold" /></Link>
          </div>
          {issues.length ? <div className="issue-grid home-issue-grid">{issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}</div> : (
            <div className="empty-state"><strong>No public civic records yet.</strong><span>Illustrative samples remain available separately in Explore.</span></div>
          )}
        </div>
      </section>

      <section className="container verification-path">
        <div>
          <div className="section-heading-kicker"><span className="eyebrow">Independent verification</span><span className="mono">03 / 03</span></div>
          <h2>Do not trust a green badge. Recompute the record.</h2>
          <p>Open an indexed issue, fetch the delivered evidence bytes, recompute its metadata, and compare every committed field with the Solana devnet account.</p>
        </div>
        <div className="row-actions">
          <Link className="button dark" href="/about">See the trust boundaries</Link>
          <Link className="button secondary" href="/dashboard">Open accountability dashboard</Link>
        </div>
      </section>
    </div>
  );
}
