import { TrackingRecord } from '@/components/report/TrackingRecord';

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;
  return (
    <section className="container page-section prod-tracking-page">
      <header className="prod-page-heading">
        <div>
          <span className="eyebrow">Private tracking</span>
          <h1>Report status</h1>
          <p>Follow the review without making the original report public.</p>
        </div>
      </header>
      <TrackingRecord trackingId={trackingId} />
    </section>
  );
}
