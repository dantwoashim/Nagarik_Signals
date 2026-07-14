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
    <section className="container page-section page-stack">
      <div className="page-heading">
        <span className="eyebrow">Create a signal</span>
        <h1>Put a public problem on the record</h1>
        <p>Add one safe image and the minimum civic context. The app removes image metadata, stores only an approximate location, and shows exactly what will be committed.</p>
      </div>
      <div className="report-layout">
        <ReportForm />
        <SafetyModal />
      </div>
    </section>
  );
}
