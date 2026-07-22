import { ReportForm } from '@/components/ReportForm';
import { SafetyModal } from '@/components/SafetyModal';
import Link from 'next/link';
import { publicPreviewReadOnly, publicPreviewUnavailableReason } from '@/lib/deployment';

export default function ReportPage() {
  if (publicPreviewReadOnly) {
    return (
      <section className="container page-section page-stack">
        <div className="page-heading">
          <span className="eyebrow">Public preview</span>
          <h1>New reports are temporarily paused</h1>
          <p>{publicPreviewUnavailableReason}</p>
        </div>
        <div className="row-actions">
          <Link className="button primary" href="/explore">Inspect public records</Link>
          <Link className="button secondary" href="/about">Review the proof model</Link>
        </div>
      </section>
    );
  }
  return (
    <section className="container page-section page-stack report-page">
      <div className="page-heading report-page-heading">
        <span className="eyebrow">New public record</span>
        <h1>Report a public issue</h1>
        <p>Add a photo, describe the issue, and choose an approximate location.</p>
      </div>
      <SafetyModal />
      <ReportForm />
    </section>
  );
}
