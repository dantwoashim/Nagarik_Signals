import { ReportForm } from '@/components/ReportForm';
import { SafetyModal } from '@/components/SafetyModal';

export default function ReportPage() {
  return (
    <section className="container page-section page-stack">
      <div className="page-heading">
        <span className="eyebrow">Create Signal</span>
        <h1>Report a public infrastructure issue</h1>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          Upload first, strip metadata, commit evidence and location hashes, then anchor the issue as a public proof object.
        </p>
      </div>
      <div className="two-col">
        <SafetyModal />
        <ReportForm />
      </div>
    </section>
  );
}
