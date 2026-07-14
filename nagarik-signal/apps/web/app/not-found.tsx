import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="container page-section">
      <div className="empty-state">
        <strong>This civic record was not found.</strong>
        <span>It may be outside the indexed demo scope or the link may be incomplete.</span>
        <Link className="button primary" href="/explore">Return to public records</Link>
      </div>
    </section>
  );
}
