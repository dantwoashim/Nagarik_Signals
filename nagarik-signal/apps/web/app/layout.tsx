import type { Metadata } from 'next';
import Link from 'next/link';
import { HashScrollRestorer } from '@/components/HashScrollRestorer';
import { SiteNavigation } from '@/components/SiteNavigation';
import { publicPreviewReadOnly } from '@/lib/deployment';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Nagarik Signal | Public proof for public problems',
    template: '%s | Nagarik Signal',
  },
  description: 'A public proof layer for civic infrastructure issues in Nepal, anchored on Solana devnet.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="shell">
          <header className="site-header">
            <div className="container site-header-inner">
              <Link href="/" className="brand" aria-label="Nagarik Signal home">
                <span className="brand-mark" aria-hidden="true"><span /> <span /> <span /></span>
                <span className="brand-copy">
                  <strong>Nagarik Signal</strong>
                  <span>Public civic proof</span>
                </span>
              </Link>
              <SiteNavigation />
            </div>
          </header>
          {publicPreviewReadOnly ? (
            <div className="public-preview-banner" role="status">
              <div className="container">Public preview: existing records and proof checks are available. New reports and status changes are temporarily paused.</div>
            </div>
          ) : null}
          <HashScrollRestorer />
          <main id="main-content" tabIndex={-1}>{children}</main>
          <footer className="site-footer">
            <div className="container footer-grid">
              <div className="footer-brand">
                <span className="brand-mark footer-mark" aria-hidden="true"><span /> <span /> <span /></span>
                <div>
                  <strong>Nagarik Signal</strong>
                  <p>Public proof for public problems.</p>
                </div>
              </div>
              <div className="footer-boundary">
                <span><i className="status-dot" aria-hidden="true" />Solana devnet proof online</span>
                <p>No tokens, rewards, payments, comments, personal accusations, or emergency reporting.</p>
              </div>
              <div className="footer-nav" aria-label="Footer navigation">
                <div className="footer-links">
                  <strong>Use Nagarik</strong>
                  <Link href="/explore">Public records</Link>
                  <Link href="/dashboard">Accountability index</Link>
                  {!publicPreviewReadOnly ? <Link href="/report">Create a signal</Link> : null}
                </div>
                <div className="footer-links">
                  <strong>Trust</strong>
                  <Link href="/about">How proof works</Link>
                  <Link href="/about#safety">Safety boundary</Link>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
