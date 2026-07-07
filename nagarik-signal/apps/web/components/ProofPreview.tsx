import { shortText } from '@/lib/ui/format';

export function ProofPreview({
  evidenceHash,
  metadataHash,
  locationHash,
  photoUrl,
}: {
  evidenceHash?: string | null;
  metadataHash?: string | null;
  locationHash?: string | null;
  photoUrl?: string | null;
}) {
  const rows = [
    ['Evidence hash', evidenceHash],
    ['Metadata hash', metadataHash],
    ['Location hash', locationHash],
  ];
  return (
    <section className="panel pad">
      <h2 style={{ marginTop: 0 }}>Proof preview</h2>
      <p className="muted" style={{ lineHeight: 1.55 }}>
        These commitments are anchored to the Issue PDA. The public page recomputes them and compares against Solana.
      </p>
      {photoUrl ? <p className="pill">Sanitized upload ready</p> : <p className="pill">Upload evidence to preview hashes</p>}
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {rows.map(([label, value]) => (
          <div className="hash-row" key={label}>
            <span className="muted">{label}</span>
            <code className="mono">{value ? shortText(value, 14, 14) : 'pending'}</code>
          </div>
        ))}
      </div>
    </section>
  );
}
