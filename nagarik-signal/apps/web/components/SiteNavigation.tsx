'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { List, Plus, ShieldCheck, X } from '@phosphor-icons/react';
import { publicPreviewReadOnly } from '@/lib/deployment';

const nav = [
  ['Explore', '/explore'],
  ['Dashboard', '/dashboard'],
  ...(publicPreviewReadOnly ? [] : [['Steward', '/steward']] as const),
  ['About', '/about'],
] as const;

export function SiteNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <nav className="desktop-nav" aria-label="Main navigation">
        {nav.map(([label, href]) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? 'nav-link active' : 'nav-link'} aria-current={pathname.startsWith(href) ? 'page' : undefined}>
            {label}
          </Link>
        ))}
        <Link className="button primary nav-report" href={publicPreviewReadOnly ? '/explore' : '/report'}>
          {publicPreviewReadOnly ? <ShieldCheck size={16} weight="bold" /> : <Plus size={16} weight="bold" />}
          {publicPreviewReadOnly ? 'Browse proof' : 'Report issue'}
        </Link>
      </nav>

      <div className="mobile-nav-shell">
        <Link className="button primary mobile-report" href={publicPreviewReadOnly ? '/explore' : '/report'}>
          {publicPreviewReadOnly ? <ShieldCheck size={17} weight="bold" /> : <Plus size={17} weight="bold" />}
          {publicPreviewReadOnly ? 'Proofs' : 'Report'}
        </Link>
        <button
          type="button"
          className="icon-button"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          title={open ? 'Close navigation' : 'Open navigation'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={21} weight="bold" /> : <List size={21} weight="bold" />}
        </button>
      </div>

      {open ? (
        <>
          <button
            type="button"
            className="mobile-nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
            <div className="mobile-nav-heading">
              <span>Navigate</span>
              <small>Public records, proof, and follow-up</small>
            </div>
            {nav.map(([label, href], index) => (
              <Link
                key={href}
                href={href}
                className={pathname.startsWith(href) ? 'mobile-nav-link active' : 'mobile-nav-link'}
                aria-current={pathname.startsWith(href) ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="mono">0{index + 1}</span>
                {label}
              </Link>
            ))}
            <div className="mobile-nav-status">
              <span className="status-dot" aria-hidden="true" />
              Solana devnet proof is online
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}
