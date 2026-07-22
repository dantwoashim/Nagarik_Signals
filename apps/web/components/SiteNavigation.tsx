'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartBar, Info, List, MapTrifold, Plus, ShieldCheck, X } from '@phosphor-icons/react';
import { publicPreviewReadOnly } from '@/lib/deployment';

const nav = [
  ['Explore', '/explore', MapTrifold],
  ['Insights', '/dashboard', ChartBar],
  ['How it works', '/about', Info],
] as const;

export function SiteNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => mobileNavRef.current?.querySelector<HTMLElement>('button, a')?.focus());
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = Array.from(mobileNavRef.current?.querySelectorAll<HTMLElement>('button, a') ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
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
          <nav ref={mobileNavRef} id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
            <div className="mobile-nav-toolbar">
              <strong>Menu</strong>
              <button type="button" className="icon-button" aria-label="Close navigation" onClick={() => setOpen(false)}>
                <X size={20} weight="bold" />
              </button>
            </div>
            {nav.map(([label, href, Icon]) => (
              <Link
                key={href}
                href={href}
                className={pathname.startsWith(href) ? 'mobile-nav-link active' : 'mobile-nav-link'}
                aria-current={pathname.startsWith(href) ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={18} weight="bold" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </>
      ) : null}
    </>
  );
}
