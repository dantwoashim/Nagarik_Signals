import { OperatorReview } from '@/components/operator/OperatorReview';

export default async function OperatorReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ organization?: string }>;
}) {
  const [{ submissionId }, query] = await Promise.all([params, searchParams]);
  return (
    <section className="container page-section operator-page">
      <OperatorReview
        submissionId={submissionId}
        organizationId={query.organization?.trim() || null}
      />
    </section>
  );
}
