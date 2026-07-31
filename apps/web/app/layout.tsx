import type { Metadata } from 'next';
import Link from 'next/link';
import { HashScrollRestorer } from '@/components/HashScrollRestorer';
import { SiteNavigation } from '@/components/SiteNavigation';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../styles/globals.css';
import '../styles/refined.css';
import '../styles/production.css';

export const metadata: Metadata = {
  title: {
    default: 'Nagarik Signal | Public proof for public problems',
    template: '%s | Nagarik Signal',
  },
  description:
    'Reviewed civic evidence, public follow-up, and independently checkable integrity records for Nepal.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="shell">
          <header className="site-header">
            <div className="container site-header-inner">
              <Link href="/" className="brand" aria-label="Nagarik Signal home">
                <span className="brand-mark" aria-hidden="true">
                  <span /> <span /> <span />
                </span>
                <span className="brand-copy">
                  <strong>Nagarik Signal</strong>
                  <span>Public civic proof</span>
                </span>
              </Link>
              <SiteNavigation />
            </div>
          </header>
          <HashScrollRestorer />
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <footer className="site-footer">
            <div className="container footer-grid">
              <div className="footer-brand">
                <span className="brand-mark footer-mark" aria-hidden="true">
                  <span /> <span /> <span />
                </span>
                <div>
                  <strong>Nagarik Signal</strong>
                  <p>Public proof for public problems.</p>
                </div>
              </div>
              <div className="footer-boundary">
                <span>
                  <i className="status-dot" aria-hidden="true" />
                  Integrity records available
                </span>
                <p>Reviewed evidence, independent checks, and accountable follow-up.</p>
              </div>
              <nav className="footer-nav" aria-label="Footer navigation">
                <div className="footer-links">
                  <strong>Use Nagarik</strong>
                  <Link href="/explore">Explore the map</Link>
                  <Link href="/report">Report an issue</Link>
                  <Link href="/dashboard">Public insights</Link>
                </div>
                <div className="footer-links">
                  <strong>Trust</strong>
                  <Link href="/about">How it works</Link>
                  <Link href="/about#safety">Privacy and safety</Link>
                  <Link href="/operator">Operator access</Link>
                </div>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
