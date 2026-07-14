import Link from 'next/link';
import { appConfig } from '@/lib/constants/config';
import { categories } from '@/lib/constants/categories';

const competitors = [
  ['Hello Sarkar', 'Government grievance intake', 'Nagarik Signal is a public proof layer civic groups can reference before or beside official systems.'],
  ['Kathmandu Gunaso', 'Municipal grievance routing and tracking', 'Nagarik Signal preserves a separately inspectable evidence commitment and source history.'],
  ['Connect KMC', 'Official maps, services, emergencies, and Public Eye reports', 'Nagarik Signal is the narrow public-proof record beside official intake.'],
  ['Local Pulse Nepal', 'City ratings, issue pins, and affected signals', 'Nagarik Signal verifies delivered evidence bytes and keeps origin classes separate.'],
  ['DevTrack', 'Projects, officials, and a public accountability forum', 'Nagarik Signal avoids comments and people-focused claims while committing infrastructure evidence.'],
] as const;

const solanaRows = [
  ['Issue creation timestamp', 'Operator-controlled timestamp', 'Public devnet transaction timestamp'],
  ['Evidence commitment', 'Can be replaced silently by operator', 'Evidence hash committed to Issue PDA'],
  ['Duplicate verification', 'Application rule can be changed later', 'Verification PDA prevents a chain signer from signaling twice'],
  ['Status timeline', 'Admin history can be rewritten', 'StatusUpdate PDA and timeline hash create an audit trail'],
  ['Independent verification', 'Trust the platform export', 'Recompute displayed hashes and compare with chain state'],
] as const;

export default function AboutPage() {
  return (
    <section className="container page-section page-stack about-page">
      <div className="page-heading">
        <span className="eyebrow">How it works</span>
        <h1>Public proof, not another complaint portal</h1>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          {appConfig.name} turns safe public infrastructure reports into proof objects: evidence hash, metadata hash,
          approximate location commitment, Issue PDA, Verification PDA, StatusUpdate PDA, and a public dashboard.
        </p>
      </div>

      <div className="dashboard-band about-principles">
        <section className="panel pad about-principle">
          <h2 style={{ marginTop: 0 }}>What this is</h2>
          <div className="table-list">
            {[
              'A Solana-backed public memory layer for ignored civic issues.',
              'A proof-first issue page with live on-chain verification.',
              'A ward/locality dashboard for unresolved public infrastructure problems.',
              'A devnet MVP with no tokens, payments, rewards, comments, or legal complaint filing claims.',
            ].map((item, index) => (
              <div className="table-row" key={item}>
                <span className="mono muted">#{index + 1}</span>
                <strong style={{ gridColumn: 'span 2' }}>{item}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel pad about-principle">
          <h2 style={{ marginTop: 0 }}>What this is not</h2>
          <div className="table-list">
            {[
              'Not a government complaint replacement.',
              'Not an official repair completion claim.',
              'Not proof-of-personhood or a Sybil-proof voting system.',
              'Not a crypto-money, token, reward, or payment product.',
            ].map((item, index) => (
              <div className="table-row" key={item}>
                <span className="mono muted">#{index + 1}</span>
                <strong style={{ gridColumn: 'span 2' }}>{item}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel pad about-data-table">
        <h2 style={{ marginTop: 0 }}>Why Solana, honestly</h2>
        <div className="table-list">
          {solanaRows.map(([need, database, solana]) => (
            <div className="table-row" key={need} style={{ gridTemplateColumns: '1fr 1.2fr 1.2fr' }}>
              <strong>{need}</strong>
              <span className="muted">{database}</span>
              <span>{solana}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel pad official-routing about-highlight">
        <span className="eyebrow">From proof to action</span>
        <h2>Use the public record beside official channels</h2>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          Nagarik Signal does not replace grievance intake. A resident or civic group can preserve an inspectable record here, then submit its public URL through the appropriate government channel and retain both references.
        </p>
        <div className="official-channel-grid">
          <a href="https://gunaso.opmcm.gov.np/" target="_blank" rel="noreferrer">
            <strong>Hello Sarkar</strong><span>Federal grievance portal and 1111 service</span>
          </a>
          <a href="https://gunaso.kathmandu.gov.np/register" target="_blank" rel="noreferrer">
            <strong>Kathmandu Gunaso</strong><span>Municipal grievance registration for Kathmandu</span>
          </a>
          <a href="https://apps.apple.com/np/app/connect-kmc/id6767496815" target="_blank" rel="noreferrer">
            <strong>Connect KMC</strong><span>Official KMC Public Eye reports, city services, and emergency routing</span>
          </a>
        </div>
      </section>

      <section className="panel pad about-provenance">
        <span className="eyebrow">Record provenance</span>
        <h2>Four origins, never mixed</h2>
        <div className="provenance-levels">
          <div><strong>Community report</strong><span>Sanitized resident evidence with approximate location and a secured civic session.</span></div>
          <div><strong>Public-source dossier</strong><span>A cited official or reputable public report, with publisher, checked date, expiry, and an explicit recheck boundary.</span></div>
          <div><strong>Illustrative sample</strong><span>Interface data used to show possible workflows. It never contributes to civic totals.</span></div>
          <div><strong>Technical fixture</strong><span>Smoke-test chain activity retained for engineering audit only and excluded from public discovery.</span></div>
        </div>
      </section>

      <section className="panel pad about-data-table">
        <h2 style={{ marginTop: 0 }}>Competitor comparison</h2>
        <div className="table-list">
          {competitors.map(([name, does, wedge]) => (
            <div className="table-row" key={name} style={{ gridTemplateColumns: '0.8fr 1fr 1.4fr' }}>
              <strong>{name}</strong>
              <span className="muted">{does}</span>
              <span>{wedge}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-band">
        <section id="safety" className="panel pad about-safety">
          <h2 style={{ marginTop: 0 }}>Safety boundary</h2>
          <p className="muted" style={{ lineHeight: 1.65 }}>
            The MVP only accepts public infrastructure categories and approximate locations. It has no comments, no people-focused categories, no personal accusations, and no emergency flow.
          </p>
          <div className="badge-row">
            {categories.map((category) => <span className="pill" key={category.id}>{category.label}</span>)}
          </div>
        </section>
        <section className="panel pad">
          <h2 style={{ marginTop: 0 }}>Verify it yourself</h2>
          <p className="muted" style={{ lineHeight: 1.65 }}>
            Open any indexed issue, use ProofPanel, and compare the displayed record against Solana devnet.
            Program ID: <code className="mono">{appConfig.programId}</code>
          </p>
          <div className="row-actions">
            <Link className="button crimson" href="/explore">Open issue feed</Link>
            <Link className="button secondary" href="/dashboard">View dashboard</Link>
          </div>
        </section>
      </div>

      <section className="panel pad operating-model">
        <span className="eyebrow">Operating model</span>
        <h2>Free public records, paid institutional workflow</h2>
        <div className="table-list">
          <div className="table-row" style={{ gridTemplateColumns: '0.8fr 2.2fr' }}><strong>Residents</strong><span>Free reporting, browsing, proof checks, public links, and official-channel handoff.</span></div>
          <div className="table-row" style={{ gridTemplateColumns: '0.8fr 2.2fr' }}><strong>Civic groups and newsrooms</strong><span>Moderation queues, assignment, exports, watchlists, source rechecks, delivery receipts, and verification APIs.</span></div>
          <div className="table-row" style={{ gridTemplateColumns: '0.8fr 2.2fr' }}><strong>Municipal teams</strong><span>Optional triage and acknowledgement workflow without controlling or deleting the public proof record.</span></div>
        </div>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          The first responsible pilot is one locality, three categories, and a 90-day review window measured by acknowledgement time, resolution time, duplicate rate, source freshness, and proof availability. No pilot or institutional adoption is claimed yet.
        </p>
      </section>

      <div className="notice">
        Devnet is a public test network, and the deployed program is currently upgradeable by its authority. Hashes and transactions are independently inspectable, but this release does not claim legal finality, proof of personhood, or permanent hosted-media availability.
      </div>
    </section>
  );
}
