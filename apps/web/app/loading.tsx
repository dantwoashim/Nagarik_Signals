export default function Loading() {
  return (
    <section className="container page-section page-stack" aria-busy="true" aria-label="Loading public records">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    </section>
  );
}
