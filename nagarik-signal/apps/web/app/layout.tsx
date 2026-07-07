import type { Metadata } from 'next';
import Link from 'next/link';
import { WalletButton } from '@/components/WalletButton';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Nagarik Signal',
  description: 'Public proof for public problems.',
};

const nav = [
  ['Explore', '/explore'],
  ['Report', '/report'],
  ['Dashboard', '/dashboard'],
  ['Steward', '/steward'],
  ['About', '/about'],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">
          <header className="site-header">
            <div className="container site-header-inner">
              <Link href="/" className="brand">
                <span className="brand-mark">NS</span>
                <span>
                  <span style={{ display: 'block' }}>Nagarik Signal</span>
                  <span className="brand-kicker">Public civic proof</span>
                </span>
              </Link>
              <nav className="nav" aria-label="Main navigation">
                {nav.map(([label, href]) => (
                  <Link key={href} href={href} className="pill">
                    {label}
                  </Link>
                ))}
                <WalletButton />
              </nav>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <div className="container">
              Public proof for public problems. Devnet-only MVP. No tokens, rewards, payments, comments, or personal accusation flow.
            </div>
          </footer>
        </main>
      </body>
    </html>
  );
}
