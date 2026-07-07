import { NextResponse } from 'next/server';
import {
  categoryBreakdown,
  dashboardStats,
  listVerifications,
  mostIgnoredIssues,
  recentResolvedIssues,
  wardLeaderboard,
} from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: 'local_json_read_model',
    stats: dashboardStats(),
    wardLeaderboard: wardLeaderboard(),
    categoryBreakdown: categoryBreakdown(),
    mostIgnoredIssues: mostIgnoredIssues(5),
    recentResolvedIssues: recentResolvedIssues(5),
    recentVerifications: listVerifications().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 10),
  });
}
