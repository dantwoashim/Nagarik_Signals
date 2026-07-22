import { Fingerprint, ImageSquare, MapPin } from '@phosphor-icons/react/dist/ssr';
import { shortText } from '@/lib/ui/format';

export function ProofPreview({
  evidenceHash,
  metadataHash,
  locationHash,
}: {
  evidenceHash?: string | null;
  metadataHash?: string | null;
  locationHash?: string | null;
  photoUrl?: string | null;
}) {
  const rows = [
    ['Photo', evidenceHash],
    ['Issue details', metadataHash],
    ['Approximate location', locationHash],
  ];
  const hasHashes = rows.some(([, value]) => Boolean(value));

  return (
    <section className="review-proof-section proof-preview">
      <h2>Public proof</h2>
      <p className="muted review-proof-copy">Publishing creates three tamper-evident commitments.</p>
      <ul className="proof-commitment-list">
        <li><ImageSquare size={17} weight="bold" /> Sanitized photo</li>
        <li><Fingerprint size={17} weight="bold" /> Issue details</li>
        <li><MapPin size={17} weight="bold" /> Approximate location</li>
      </ul>
      {hasHashes ? (
        <details className="proof-preview-details">
          <summary>Created hashes</summary>
          <div className="proof-preview-rows">
            {rows.map(([label, value]) => (
              <div className="hash-row" key={label}>
                <span className="muted">{label}</span>
                <code className="mono">{value ? shortText(value, 14, 14) : 'pending'}</code>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
