import Link from 'next/link';
import { ArrowRight, Camera, Fingerprint, MapTrifold, PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr';
import { ExploreMap } from '@/components/ExploreMap';
import { dashboardStats, latestIndexedIssue, listIssues } from '@/lib/db/queries';
import { appConfig } from '@/lib/constants/config';
import { publicPreviewReadOnly } from '@/lib/deployment';

export default async function HomePage() {
  const [stats, allIssues, liveIssue] = await Promise.all([
    dashboardStats(),
    listIssues({ scope: 'public', sort: 'newest', limit: 100 }),
    latestIndexedIssue(),
  ]);
  const liveCount = allIssues.length;
  const anchoredCount = allIssues.filter((issue) => issue.proof.proofStatus === 'indexed_devnet' || issue.proof.proofStatus === 'verified_devnet').length;
  const primaryHref = publicPreviewReadOnly
    ? liveIssue ? `/issues/${liveIssue.id}#proof` : '/explore'
    : '/report';
  const primaryLabel = publicPreviewReadOnly
    ? liveIssue ? 'Verify a public record' : 'Browse public records'
    : 'Report an issue';

  return (
    <div className="home-page">
      <section className="home-command">
        <div className="container home-command-inner">
          <div className="home-command-copy">
            <span className="home-live-label"><i className="status-dot" aria-hidden="true" /> Live on Solana devnet</span>
            <h1>{appConfig.name}</h1>
            <p>Track civic issues from evidence to public follow-up.</p>
          </div>
          <div className="home-command-actions">
            <Link className="button primary" href={primaryHref}>{primaryLabel} <ArrowRight size={17} weight="bold" /></Link>
            <Link className="button secondary" href="/explore"><MapTrifold size={17} weight="bold" /> Explore map</Link>
          </div>
          <dl className="home-command-stats" aria-label="Public record summary">
            <div><dt>Public records</dt><dd>{liveCount}</dd></div>
            <div><dt>Need follow-up</dt><dd>{stats.unresolvedIssues}</dd></div>
            <div><dt>Anchored on Solana</dt><dd>{anchoredCount}</dd></div>
          </dl>
        </div>
      </section>

      {allIssues.length ? (
        <section className="container home-map-section" aria-labelledby="home-map-heading">
          <div className="home-map-heading">
            <div>
              <span className="eyebrow"><MapTrifold size={15} weight="bold" /> Public map</span>
              <h2 id="home-map-heading">See where follow-up is needed</h2>
            </div>
            <Link className="text-link" href="/explore">Open all filters <ArrowRight size={16} weight="bold" /></Link>
          </div>
          <ExploreMap issues={allIssues} compact />
        </section>
      ) : null}

      <section className="home-process" aria-labelledby="home-process-heading">
        <div className="container home-process-inner">
          <div className="home-process-heading">
            <span className="eyebrow">How it works</span>
            <h2 id="home-process-heading">How reporting works</h2>
          </div>
          <div className="home-process-steps">
            <article><Camera size={22} weight="regular" /><span className="mono">01</span><h3>Record</h3><p>Add a safe photo or checked public source.</p></article>
            <article><Fingerprint size={22} weight="regular" /><span className="mono">02</span><h3>Verify</h3><p>Compare the evidence and record with Solana.</p></article>
            <article><PaperPlaneTilt size={22} weight="regular" /><span className="mono">03</span><h3>Follow up</h3><p>Track signals, official routing, and status changes.</p></article>
          </div>
        </div>
      </section>

    </div>
  );
}
