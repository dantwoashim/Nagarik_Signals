import { listIssues } from '@/lib/db/queries';
import { StewardConsole } from '@/components/StewardConsole';
import Link from 'next/link';
import { showcaseReadOnly, showcaseUnavailableReason } from '@/lib/deployment';

export default function StewardPage() {
  if (showcaseReadOnly) {
    return (
      <section className="container page-section page-stack">
        <div className="page-heading">
          <span className="eyebrow">Read-only judge showcase</span>
          <h1>Steward writes are disabled on Vercel</h1>
          <p>{showcaseUnavailableReason}</p>
        </div>
        <Link className="button primary" href="/dashboard">Open accountability dashboard</Link>
      </section>
    );
  }
  const issues = listIssues({ sort: 'most_ignored', limit: 100 }).sort((a, b) => {
    if (a.proof.proofStatus === 'seeded_demo' && b.proof.proofStatus !== 'seeded_demo') return 1;
    if (a.proof.proofStatus !== 'seeded_demo' && b.proof.proofStatus === 'seeded_demo') return -1;
    return b.issueId - a.issueId;
  });
  return (
    <section className="container page-section page-stack">
      <div className="page-heading">
        <span className="eyebrow">Steward console</span>
        <h1>Moderate and update public status</h1>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          Steward updates create StatusUpdate PDAs, attach resolution proof when available, and keep the issue timeline auditable.
        </p>
      </div>
      <StewardConsole issues={issues} />
    </section>
  );
}
