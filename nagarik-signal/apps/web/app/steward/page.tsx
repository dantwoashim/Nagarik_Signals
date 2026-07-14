import { listModerationIssues } from '@/lib/db/queries';
import { StewardConsole } from '@/components/StewardConsole';
import Link from 'next/link';
import { publicPreviewReadOnly, publicPreviewUnavailableReason } from '@/lib/deployment';

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
  const issues = await listModerationIssues();
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
