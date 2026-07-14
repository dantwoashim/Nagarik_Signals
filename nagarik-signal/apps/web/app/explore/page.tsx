import Link from 'next/link';
import { ListBullets, MagnifyingGlass, MapTrifold } from '@phosphor-icons/react/dist/ssr';
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
  const scope = one(params.scope) === 'samples' ? 'samples' : 'public';
  const view = one(params.view) === 'map' ? 'map' : 'list';
  const query = (one(params.q) || '').trim().toLowerCase();
  const requestedPage = Math.max(1, Number(one(params.page) || 1));
  const pageSize = 12;
  const rows = await listIssues({
    scope,
    ward: ward || null,
    category: category || null,
    status: status || null,
    sort,
    limit: 100,
  });
  const matches = query
    ? rows.filter((issue) =>
        `${issue.title} ${issue.description} ${issue.locality} ${issue.issueId} ${issue.provenance?.publisher ?? ''}`.toLowerCase().includes(query)
      )
    : rows;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const issues = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeFilters = [
    query ? `Search: ${query}` : null,
    ward ? wards.find((item) => item.id === ward)?.label ?? ward : null,
    category ? categories.find((item) => item.id === category)?.label ?? category : null,
    status ? statuses.find((item) => item.id === status)?.label ?? status : null,
  ].filter((item): item is string => Boolean(item));

  function href(overrides: Record<string, string | null>) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q: query, ward, category, status, sort, scope, view, ...overrides })) {
      if (value && value !== 'newest' && value !== 'public' && value !== 'list') next.set(key, value);
      if (key === 'scope' && value === 'samples') next.set(key, value);
      if (key === 'view' && value === 'map') next.set(key, value);
    }
    const suffix = next.toString();
    return suffix ? `/explore?${suffix}` : '/explore';
  }

  return (
    <section className="container page-section page-stack">
      <div className="page-heading">
        <span className="eyebrow">Public civic record</span>
        <h1>See what still needs a current answer</h1>
        <p>Browse community reports and checked public-source dossiers. Illustrative samples stay in a separate view and never contribute to public totals.</p>
      </div>

      <div className="explore-modes">
        <nav className="scope-switch" aria-label="Record origin">
          <Link className={scope === 'public' ? 'active' : ''} href={href({ scope: null, page: null })}>Public records</Link>
          <Link className={scope === 'samples' ? 'active' : ''} href={href({ scope: 'samples', page: null })}>Illustrative samples</Link>
        </nav>
        <nav className="scope-switch" aria-label="Explore view">
          <Link className={view === 'list' ? 'active' : ''} href={href({ view: null, page: null })}><ListBullets size={16} weight="bold" />List</Link>
          <Link className={view === 'map' ? 'active' : ''} href={href({ view: 'map', page: null })}><MapTrifold size={16} weight="bold" />Map</Link>
        </nav>
      </div>

      <form className="filter-bar explore-filter-shell">
        <input type="hidden" name="scope" value={scope === 'samples' ? 'samples' : ''} />
        <input type="hidden" name="view" value={view === 'map' ? 'map' : ''} />
        <div className="field search-field">
          <label htmlFor="record-search">Search</label>
          <div className="input-with-icon">
            <MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
            <input id="record-search" name="q" defaultValue={query} placeholder="Drain, road, publisher, issue ID" />
          </div>
        </div>
        <label className="field">
          <span>Area</span>
          <select name="ward" defaultValue={ward}>
            <option value="">All areas</option>
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
            <option value="most_ignored">Longest observed</option>
            <option value="most_verified">Most signals</option>
          </select>
        </label>
        <div className="row-actions">
          <button className="button crimson" type="submit">Apply</button>
          <Link className="button secondary" href={scope === 'samples' ? '/explore?scope=samples' : '/explore'}>Reset</Link>
        </div>
      </form>

      <div className="result-toolbar">
        <div className="result-count" role="status"><strong>{matches.length}</strong> {scope === 'samples' ? 'illustrative sample' : 'public civic record'}{matches.length === 1 ? '' : 's'}</div>
        {activeFilters.length ? (
          <div className="active-filter-list" aria-label="Active filters">
            {activeFilters.map((item) => <span className="pill" key={item}>{item}</span>)}
          </div>
        ) : <span className="result-context">Showing the complete {scope === 'samples' ? 'sample library' : 'public watchlist'}</span>}
      </div>

      {issues.length ? (
        view === 'map'
          ? <ExploreMap issues={issues} />
          : <div className="issue-list">{issues.map((issue, index) => <IssueCard key={issue.id} issue={issue} variant="ledger" priority={index === 0} />)}</div>
      ) : (
        <div className="empty-state">
          <strong>No records match these filters.</strong>
          <span>Try a wider area or reset the current filter set.</span>
          <Link className="button secondary" href="/explore">Reset filters</Link>
        </div>
      )}

      {pageCount > 1 ? (
        <nav className="pagination" aria-label="Explore pages">
          {currentPage > 1 ? <Link className="button secondary" href={href({ page: String(currentPage - 1) })}>Previous</Link> : <span />}
          <span>Page {currentPage} of {pageCount}</span>
          {currentPage < pageCount ? <Link className="button secondary" href={href({ page: String(currentPage + 1) })}>Next</Link> : <span />}
        </nav>
      ) : null}
    </section>
  );
}
