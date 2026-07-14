import Link from 'next/link';
import { appConfig } from '@/lib/constants/config';
import { categories } from '@/lib/constants/categories';

const competitors = [
  ['Hello Sarkar', 'Government grievance intake', 'Nagarik Signal is a public proof layer civic groups can reference before or beside official systems.'],
  ['FixMyStreet', 'Public issue reporting and routing', 'Nagarik Signal adds Solana proof, duplicate-resistant verification, and an auditable status timeline.'],
  ['SeeClickFix', 'Municipal service requests', 'Nagarik Signal works without municipal adoption and focuses on public memory.'],
  ['Ushahidi', 'Crowdsourced mapping', 'Nagarik Signal is narrower: civic infrastructure proof, hashes, PDAs, and status history.'],
  ['Janamat', 'Verified civic opinion', 'Complementary: Janamat shows what citizens think; Nagarik Signal shows what citizens proved.'],
] as const;

const solanaRows = [
  ['Issue creation timestamp', 'Operator-controlled timestamp', 'Public devnet transaction timestamp'],
  ['Evidence commitment', 'Can be replaced silently by operator', 'Evidence hash committed to Issue PDA'],
  ['Duplicate verification', 'Application rule can be changed later', 'Verification PDA prevents duplicate signer/session verification'],
  ['Status timeline', 'Admin history can be rewritten', 'StatusUpdate PDA and timeline hash create an audit trail'],
  ['Independent verification', 'Trust the platform export', 'Recompute displayed hashes and compare with chain state'],
] as const;

export default function AboutPage() {
  return (
    <section className="container page-section page-stack">
      <div className="page-heading">
        <span className="eyebrow">How it works</span>
        <h1>Public proof, not another complaint portal</h1>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          {appConfig.name} turns safe public infrastructure reports into proof objects: evidence hash, metadata hash,
          approximate location commitment, Issue PDA, Verification PDA, StatusUpdate PDA, and a public dashboard.
        </p>
      </div>

      <div className="dashboard-band">
        <section className="panel pad">
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
        <section className="panel pad">
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

      <section className="panel pad">
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

      <section className="panel pad">
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
        <section className="panel pad">
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
    </section>
  );
}
