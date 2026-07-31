import { ReportExperience } from '@/components/report/ReportExperience';

export default function ReportPage() {
  return (
    <section className="container page-section prod-report-page">
      <header className="prod-page-heading">
        <div>
          <span className="eyebrow">New report</span>
          <h1>Report a public issue</h1>
          <p>Add a safe photo, describe the condition, and choose its location.</p>
        </div>
      </header>
      <ReportExperience />
    </section>
  );
}
