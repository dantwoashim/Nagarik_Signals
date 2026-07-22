import { CheckCircle, ShieldCheck } from '@phosphor-icons/react/dist/ssr';

export function SafetyModal() {
  return (
    <aside className="safety-strip" aria-labelledby="safety-strip-heading">
      <div className="safety-strip-heading">
        <ShieldCheck size={20} weight="bold" aria-hidden="true" />
        <h2 id="safety-strip-heading">Before you upload</h2>
      </div>
      <ul>
        <li><CheckCircle size={16} weight="fill" aria-hidden="true" /> Public infrastructure only</li>
        <li><CheckCircle size={16} weight="fill" aria-hidden="true" /> Keep faces, plates, and private homes out</li>
        <li><CheckCircle size={16} weight="fill" aria-hidden="true" /> Use emergency services for immediate danger</li>
      </ul>
      <details>
        <summary>Photo safety details</summary>
        <p>Leave out names, accusations, and identifying details. Unsafe media can be hidden while its proof trail remains.</p>
      </details>
    </aside>
  );
}
