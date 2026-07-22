import { NextResponse } from 'next/server';
import {
  categoryBreakdown,
  authorityHandoffOverview,
  dashboardStats,
  listVerifications,
  listIssues,
  mostIgnoredIssues,
  recentResolvedIssues,
  wardLeaderboard,
} from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET() {
  const [stats, wards, categories, ignored, resolved, verifications, issues, handoffs] = await Promise.all([
    dashboardStats(),
    wardLeaderboard(),
    categoryBreakdown(),
    mostIgnoredIssues(5),
    recentResolvedIssues(5),
    listVerifications(),
    listIssues({ scope: 'public', limit: 100 }),
    authorityHandoffOverview(6),
  ]);
  const publicIssueIds = new Set(issues.map((issue) => issue.issueId));
  return NextResponse.json({
    ok: true,
    mode: 'durable_read_model',
    stats,
    wardLeaderboard: wards,
    categoryBreakdown: categories,
    mostIgnoredIssues: ignored,
    recentResolvedIssues: resolved,
    recentVerifications: verifications
      .filter((row) => publicIssueIds.has(row.issueId))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 10),
    handoffs,
  });
}
