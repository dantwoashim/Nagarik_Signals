import Link from 'next/link';
import { ExploreMap } from '@/components/ExploreMap';
import { IssueCard } from '@/components/IssueCard';
import { categories } from '@/lib/constants/categories';
import { statuses } from '@/lib/constants/statuses';
import { listIssues } from '@/lib/db/queries';
import { wards } from '@/lib/geo/wards';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const ward = one(params.ward) || '';
  const category = one(params.category) || '';
  const status = one(params.status) || '';
  const sort = one(params.sort) || 'newest';
  const query = (one(params.q) || '').trim().toLowerCase();
  const rows = listIssues({
    ward: ward || null,
    category: category || null,
    status: status || null,
    sort,
    limit: 100,
  });
  const issues = query
    ? rows.filter((issue) =>
        `${issue.title} ${issue.description} ${issue.locality} ${issue.issueId}`.toLowerCase().includes(query)
      )
    : rows;

  return (
    <section className="container page-section page-stack">
      <div className="page-heading">
        <span className="eyebrow">Issue feed</span>
        <h1>Explore civic proof objects</h1>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          Filter safe public reports by ward, category, status, and ignored days. Every card opens a proof-first issue page.
        </p>
      </div>
      <form className="panel filter-bar">
        <label className="field">
          <span>Search</span>
          <input name="q" defaultValue={query} placeholder="drain, light, waste, issue id" />
        </label>
        <label className="field">
          <span>Ward</span>
          <select name="ward" defaultValue={ward}>
            <option value="">All wards</option>
            {wards.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Category</span>
          <select name="category" defaultValue={category}>
            <option value="">All categories</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sort</span>
          <select name="sort" defaultValue={sort}>
            <option value="newest">Newest</option>
            <option value="most_ignored">Most ignored</option>
            <option value="most_verified">Most verified</option>
          </select>
        </label>
        <div className="row-actions">
          <button className="button crimson" type="submit">Apply</button>
          <Link className="button secondary" href="/explore">Reset</Link>
        </div>
      </form>
      <ExploreMap issues={issues} />
      <div>
        <span className="pill">{issues.length} visible issue{issues.length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid-auto">
        {issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)}
      </div>
    </section>
  );
}
