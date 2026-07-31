import { PublicIssueRecord } from '@/components/public/PublicIssueRecord';

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicIssueRecord publicId={id} />;
}
