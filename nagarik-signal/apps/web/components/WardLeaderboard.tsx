import Link from 'next/link';
import { ArrowRight, MapPin } from '@phosphor-icons/react/dist/ssr';
import { wardLeaderboard } from '@/lib/db/queries';

export async function WardLeaderboard() {
  const rows = await wardLeaderboard();
  const maxDays = Math.max(1, ...rows.map((row) => row.averageDaysIgnored));

  return (
    <section className="dashboard-index" aria-labelledby="area-index-heading">
      <div className="dashboard-section-heading">
        <div>
          <span className="eyebrow">Area follow-up index</span>
          <h2 id="area-index-heading">Where unresolved time is accumulating</h2>
        </div>
        <span className="dashboard-section-context">Average age of open public records by locality</span>
      </div>
      <div className="area-index-list">
        {rows.map((row, index) => (
          <Link key={row.wardId} className="area-index-row" href={`/explore?ward=${encodeURIComponent(row.wardId)}`}>
            <span className="area-index-rank mono">0{index + 1}</span>
            <span className="area-index-name"><MapPin size={16} weight="bold" />{row.locality}</span>
            <span className="area-index-bar" aria-hidden="true"><i style={{ transform: `scaleX(${row.averageDaysIgnored / maxDays})` }} /></span>
            <span className="area-index-value"><strong className="mono">{row.averageDaysIgnored}</strong><small>avg days</small></span>
            <span className="area-index-value"><strong className="mono">{row.unresolved}</strong><small>open / {row.total} total</small></span>
            <ArrowRight className="area-index-arrow" size={18} weight="bold" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
