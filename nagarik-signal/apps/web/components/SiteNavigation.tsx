'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { List, Plus, X } from '@phosphor-icons/react';
import { WalletButton } from './WalletButton';
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

  return (
    <>
      <nav className="desktop-nav" aria-label="Main navigation">
        {nav.map(([label, href]) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? 'nav-link active' : 'nav-link'} aria-current={pathname.startsWith(href) ? 'page' : undefined}>
            {label}
          </Link>
        ))}
        <Link className="button primary nav-report" href={publicPreviewReadOnly ? '/explore' : '/report'}>
          <Plus size={16} weight="bold" />
          {publicPreviewReadOnly ? 'Browse proof' : 'Report issue'}
        </Link>
        <WalletButton />
      </nav>

      <div className="mobile-nav-shell">
        <Link className="button primary mobile-report" href={publicPreviewReadOnly ? '/explore' : '/report'}>
          <Plus size={17} weight="bold" />
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
        <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'mobile-nav-link active' : 'mobile-nav-link'} aria-current={pathname.startsWith(href) ? 'page' : undefined} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          <WalletButton />
        </nav>
      ) : null}
    </>
  );
}
