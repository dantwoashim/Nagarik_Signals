'use client';

import { useEffect, useMemo, useState } from 'react';
import { FunnelSimple, ListBullets, MagnifyingGlass, MapTrifold } from '@phosphor-icons/react';

import { PublicIssueRow } from './PublicIssueRow';
import { PublicMap } from './PublicMap';
import { readPublicApi } from '@/lib/public/api';
import {
  categoryName,
  lifecycleLabel,
  publicWard,
  type PublicIssueSummary,
} from '@/lib/public/contracts';

type ListResponse = {
  items: PublicIssueSummary[];
  nextCursor: string | null;
};

export function PublicExplore() {
  const [issues, setIssues] = useState<PublicIssueSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [ward, setWard] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  async function load(nextCursor?: string | null) {
    const append = Boolean(nextCursor);
    if (append) setLoadingMore(true);
    else setState('loading');
    try {
      const suffix = nextCursor
        ? `?limit=50&cursor=${encodeURIComponent(nextCursor)}`
        : '?limit=50';
      const result = await readPublicApi<ListResponse>(`/api/v2/issues${suffix}`);
      setIssues((current) => (append ? [...current, ...result.items] : result.items));
      setCursor(result.nextCursor);
      setState('ready');
    } catch {
      if (!append) setState('error');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    readPublicApi<ListResponse>('/api/v2/issues?limit=50', {
      signal: controller.signal,
    })
      .then((result) => {
        setIssues(result.items);
        setCursor(result.nextCursor);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, []);

  const categories = useMemo(
    () => [...new Set(issues.flatMap((issue) => (issue.category ? [issue.category] : [])))],
    [issues],
  );
  const wards = useMemo(() => {
    const values = new Map<string, string>();
    for (const issue of issues) {
      const item = publicWard(issue.ward);
      if (item.id) values.set(item.id, item.label);
    }
    return [...values.entries()];
  }, [issues]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return issues.filter((issue) => {
      const issueWard = publicWard(issue.ward);
      const issueLifecycle = issue.lifecycle ?? issue.legacyStatus ?? 'open';
      return (
        (!needle ||
          `${issue.title ?? ''} ${issue.summary ?? ''} ${issueWard.label} ${issue.publicId}`
            .toLowerCase()
            .includes(needle)) &&
        (!category || issue.category === category) &&
        (!lifecycle || issueLifecycle === lifecycle) &&
        (!ward || issueWard.id === ward)
      );
    });
  }, [category, issues, lifecycle, query, ward]);

  return (
    <section className="container page-section prod-explore">
      <header className="prod-page-heading">
        <div>
          <span className="eyebrow">Explore</span>
          <h1>Public civic records</h1>
          <p>Find reviewed issues by place, category, or current lifecycle.</p>
        </div>
        <div className="prod-view-switch" aria-label="Explore view">
          <button
            type="button"
            className={view === 'map' ? 'active' : ''}
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
          >
            <MapTrifold size={17} weight="bold" /> Map
          </button>
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            <ListBullets size={17} weight="bold" /> List
          </button>
        </div>
      </header>

      <div className="prod-filter-bar">
        <label className="prod-search">
          <span className="sr-only">Search records</span>
          <MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search issue, area, or record ID"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {categoryName(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)}>
            <option value="">All states</option>
            {['open', 'in_progress', 'resolved', 'closed'].map((item) => (
              <option key={item} value={item}>
                {lifecycleLabel({ lifecycle: item, legacyStatus: null })}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Area</span>
          <select value={ward} onChange={(event) => setWard(event.target.value)}>
            <option value="">All areas</option>
            {wards.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button prod-filter-reset"
          type="button"
          title="Clear filters"
          aria-label="Clear filters"
          disabled={!query && !category && !lifecycle && !ward}
          onClick={() => {
            setQuery('');
            setCategory('');
            setLifecycle('');
            setWard('');
          }}
        >
          <FunnelSimple size={18} weight="bold" />
        </button>
      </div>

      <div className="prod-result-line" role="status">
        <strong>{filtered.length}</strong> visible record{filtered.length === 1 ? '' : 's'}
        {cursor ? <span>More records available</span> : null}
      </div>

      {state === 'loading' ? (
        <div className="prod-map-skeleton" role="status">
          Loading public records
        </div>
      ) : state === 'error' ? (
        <div className="prod-service-state" role="status">
          <div>
            <strong>Public records are temporarily unavailable.</strong>
            <span>Try again when the public service is reachable.</span>
          </div>
          <button className="button secondary" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : view === 'map' ? (
        <PublicMap issues={filtered} />
      ) : filtered.length ? (
        <div className="prod-record-list">
          {filtered.map((issue) => (
            <PublicIssueRow key={issue.publicId} issue={issue} />
          ))}
        </div>
      ) : (
        <div className="prod-service-state">
          <div>
            <strong>No records match these filters.</strong>
            <span>Clear one or more filters to widen the result.</span>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('');
              setLifecycle('');
              setWard('');
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {cursor ? (
        <div className="prod-load-more">
          <button
            className="button secondary"
            type="button"
            disabled={loadingMore}
            onClick={() => void load(cursor)}
          >
            {loadingMore ? 'Loading...' : 'Load more records'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
