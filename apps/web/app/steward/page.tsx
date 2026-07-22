import { listAuthorityHandoffs, listModerationIssues } from '@/lib/db/queries';
import { StewardConsole } from '@/components/StewardConsole';
import Link from 'next/link';
import { publicPreviewReadOnly, publicPreviewUnavailableReason } from '@/lib/deployment';

export const dynamic = 'force-dynamic';

export default async function StewardPage() {
  if (publicPreviewReadOnly) {
    return (
      <section className="container page-section page-stack">
        <div className="page-heading">
          <span className="eyebrow">Public preview</span>
          <h1>Status updates are temporarily paused</h1>
          <p>{publicPreviewUnavailableReason}</p>
        </div>
        <Link className="button primary" href="/dashboard">Open accountability dashboard</Link>
      </section>
    );
  }
  const [issues, authorityHandoffs] = await Promise.all([
    listModerationIssues(),
    listAuthorityHandoffs(),
  ]);
  return (
    <section className="container page-section page-stack steward-page">
      <div className="page-heading">
        <span className="eyebrow">Steward console</span>
        <h1>Moderate, update, and follow through</h1>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          Create on-chain status proofs, control public media, and maintain a separate evidence-backed trail for official routing and follow-up.
        </p>
      </div>
      <StewardConsole issues={issues} authorityHandoffs={authorityHandoffs} />
    </section>
  );
}
