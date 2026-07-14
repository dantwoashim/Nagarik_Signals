import type { Metadata } from 'next';
import Link from 'next/link';
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
    <html lang="en">
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
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <div className="container footer-grid">
              <div>
                <strong>Nagarik Signal</strong>
                <p>Public proof for public problems.</p>
              </div>
              <p>Devnet MVP. No tokens, rewards, payments, comments, personal accusations, or emergency reporting.</p>
              <div className="footer-links">
                <Link href="/about">How proof works</Link>
                <Link href="/explore">Public records</Link>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
