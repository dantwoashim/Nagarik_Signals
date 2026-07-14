import type { CivicIssue } from '@/lib/types';
import { statusLabel } from '@/lib/constants/statuses';
import { addressUrl, formatDateTime, shortText, txUrl } from '@/lib/ui/format';

export function StatusTimeline({ issue }: { issue: CivicIssue }) {
  const timeline = [...issue.timeline].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.seq - right.seq
  );
  return (
    <section className="panel pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Status timeline</h2>
        <span className="pill">{issue.updateCount} update{issue.updateCount === 1 ? '' : 's'}</span>
      </div>
      <div className="timeline" style={{ marginTop: 12 }}>
        {timeline.map((entry, index) => {
          const transactionUrl = txUrl(entry.txSig);
          const statusUpdateUrl = addressUrl(entry.statusUpdatePda);
          const stepLabel = entry.seq === 0
            ? 'Issue proof'
            : Number.isInteger(entry.seq)
              ? `StatusUpdate #${entry.seq}`
              : 'Verification threshold';
          return (
            <article className="timeline-item" key={`${entry.seq}-${entry.status}-${entry.txSig ?? index}`}>
              <div className="timeline-head">
                <strong>{index + 1}. {statusLabel(entry.status)}</strong>
                <span className="muted">{formatDateTime(entry.createdAt)}</span>
              </div>
              <span className="pill" style={{ marginTop: 8 }}>{stepLabel}</span>
              <p className="muted" style={{ lineHeight: 1.6 }}>{entry.note}</p>
              <div className="hash-row">
                <span className="muted">Proof hash</span>
                <code className="mono">{shortText(entry.proofHash, 14, 14)}</code>
              </div>
              <div className="row-actions" style={{ marginTop: 10 }}>
                {transactionUrl ? (
                  <a className="button secondary" href={transactionUrl} target="_blank" rel="noreferrer">
                    Transaction
                  </a>
                ) : null}
                {statusUpdateUrl ? (
                  <a className="button secondary" href={statusUpdateUrl} target="_blank" rel="noreferrer">
                    Status account
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {issue.resolutionPhotoUrl ? (
        <div className="notice" style={{ marginTop: 14 }}>
          A resolution artifact is attached to this issue. The elapsed counter is frozen at the final timeline update.
        </div>
      ) : null}
    </section>
  );
}
