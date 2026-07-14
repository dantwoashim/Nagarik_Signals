import Link from 'next/link';
import { ArrowRight, CheckCircle, Eye, MapPin, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { DashboardStats } from '@/components/DashboardStats';
import { IssueCard } from '@/components/IssueCard';
import { dashboardStats, daysIgnored, listIssues, mostIgnoredIssues } from '@/lib/db/queries';
import { appConfig } from '@/lib/constants/config';
import { categoryLabel } from '@/lib/constants/categories';
import { isClosedStatus, statusLabel } from '@/lib/constants/statuses';
import { showcaseReadOnly } from '@/lib/deployment';

export default function HomePage() {
  const stats = dashboardStats();
  const allIssues = listIssues({ sort: 'most_ignored', limit: 100 });
  const ignoredIssues = mostIgnoredIssues(4);
  const issues = ignoredIssues.length ? ignoredIssues : allIssues.slice(0, 4);
  const spotlight = issues[0];
  const liveCount = allIssues.filter((issue) => issue.proof.proofStatus !== 'seeded_demo').length;
  const demoCount = allIssues.length - liveCount;
  const spotlightDays = spotlight ? daysIgnored(spotlight) : 0;
  const spotlightClosed = spotlight ? isClosedStatus(spotlight.status) : false;
  return (
    <div>
      <section className="home-hero" style={spotlight ? { '--hero-image': `url(${spotlight.photoUrl})` } as React.CSSProperties : undefined}>
        <div className="container home-hero-inner">
          <div className="hero-copy">
            <span className="eyebrow inverse">Civic memory, anchored on Solana</span>
            <h1>{appConfig.tagline}</h1>
            <p>{appConfig.positioning}</p>
            <div className="hero-actions">
              <Link className="button primary" href={showcaseReadOnly ? '/explore' : '/report'}>{showcaseReadOnly ? 'Inspect public proof' : 'Report an issue'} <ArrowRight size={17} weight="bold" /></Link>
              <Link className="button light" href="/explore">Explore public records</Link>
            </div>
          </div>
          {spotlight ? (
            <Link className="hero-record" href={`/issues/${spotlight.id}`} aria-label={`Open ${spotlight.title}`}>
              <div className="hero-record-topline">
                <span>{spotlight.proof.proofStatus === 'seeded_demo' ? 'Clearly marked demo record' : 'Live devnet proof'}</span>
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
        <div className="container"><DashboardStats stats={stats} liveCount={liveCount} demoCount={demoCount} /></div>
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
              <p>Live and demo records are never presented as the same kind of proof.</p>
            </div>
            <Link className="text-link" href="/explore">See every record <ArrowRight size={16} weight="bold" /></Link>
          </div>
          <div className="issue-grid">
            {issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
          </div>
        </div>
      </section>

      <section className="container judge-path">
        <div>
          <span className="eyebrow">For judges and skeptics</span>
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
