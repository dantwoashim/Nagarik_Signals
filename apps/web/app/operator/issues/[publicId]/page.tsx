import { OperatorIssueManager } from '@/components/operator/OperatorIssueManager';

export default async function OperatorIssuePage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ organization?: string }>;
}) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  return (
    <section className="container page-section operator-page">
      <OperatorIssueManager
        publicId={publicId}
        organizationId={query.organization?.trim() || null}
      />
    </section>
  );
}
