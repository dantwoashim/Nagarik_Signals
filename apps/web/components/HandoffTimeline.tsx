import {
  ArrowSquareOut,
  ClockCountdown,
  LinkSimple,
  PaperPlaneTilt,
  ShieldWarning,
} from '@phosphor-icons/react/dist/ssr';
import type { AuthorityHandoff, CivicIssue, HandoffState } from '@/lib/types';
import { formatDateTime, shortText } from '@/lib/ui/format';

const stateCopy: Record<HandoffState, string> = {
  prepared: 'An official route has been selected. Delivery has not been recorded.',
  submitted: 'A steward recorded delivery through the named channel and added a reference.',
  acknowledged: 'A steward attached a privacy-reviewed receipt. Its contents remain attributable to that artifact.',
  follow_up: 'A steward recorded a follow-up action after delivery.',
  closed: 'Follow-up tracking is closed. The civic issue may still remain open.',
};

const publicStateLabels: Record<HandoffState, string> = {
  prepared: 'Not sent yet',
  submitted: 'Sent with reference',
  acknowledged: 'Receipt attached',
  follow_up: 'Follow-up logged',
  closed: 'Tracking closed',
};

function evidenceLabel(event: AuthorityHandoff) {
  if (event.evidenceBasis === 'redacted_receipt') return 'Redacted receipt';
  if (event.evidenceBasis === 'external_reference') return 'External reference';
  return 'Official route only';
}

export function HandoffTimeline({ issue, handoffs }: { issue: CivicIssue; handoffs: AuthorityHandoff[] }) {
  const timeline = [...handoffs].sort((left, right) => left.seq - right.seq);
  const current = timeline.at(-1) ?? null;

  return (
    <section className="panel pad handoff-panel" aria-labelledby="handoff-heading">
      <div className="panel-heading-row handoff-heading-row">
        <div>
          <span className="eyebrow"><PaperPlaneTilt size={15} weight="bold" /> Public routing</span>
          <h2 id="handoff-heading">Official follow-up</h2>
        </div>
        <span className={`pill handoff-state handoff-state-${current?.state ?? 'none'}`}>
          {current ? publicStateLabels[current.state] : 'Not sent yet'}
        </span>
      </div>

      <div className="handoff-boundary" role="note">
        <ShieldWarning size={18} weight="bold" aria-hidden="true" />
        <p>These entries are recorded by Nagarik Signal stewards. They are separate from the Solana integrity check.</p>
      </div>

      {!current ? (
        <div className="handoff-empty">
          <PaperPlaneTilt size={28} weight="regular" aria-hidden="true" />
          <div>
            <strong>Not sent yet</strong>
            <p>No delivery through an official channel has been recorded.</p>
          </div>
          {issue.provenance?.escalationUrl ? (
            <a className="text-link" href={issue.provenance.escalationUrl} target="_blank" rel="noreferrer">
              Open listed channel <ArrowSquareOut size={16} weight="bold" />
            </a>
          ) : null}
        </div>
      ) : (
        <>
          <p className="handoff-current-copy">{stateCopy[current.state]}</p>
          <div className="handoff-timeline">
            {timeline.map((event) => {
              return (
                <article className="handoff-event" key={event.id}>
                  <div className="handoff-event-marker" aria-hidden="true">{event.seq}</div>
                  <div className="handoff-event-body">
                    <div className="handoff-event-head">
                      <div>
                        <strong>{publicStateLabels[event.state]}</strong>
                        <span>{event.authorityName} / {event.channelName}</span>
                      </div>
                      <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
                    </div>
                    <div className="badge-row handoff-event-badges">
                      <span className="pill">{evidenceLabel(event)}</span>
                      {event.followUpDueAt ? (
                        <span className="pill">
                          <ClockCountdown size={13} weight="bold" /> Follow up {formatDateTime(event.followUpDueAt)}
                        </span>
                      ) : null}
                    </div>
                    {event.note ? <p className="handoff-note">{event.note}</p> : null}
                    <div className="handoff-event-links">
                      {event.channelUrl ? (
                        <a href={event.channelUrl} target="_blank" rel="noreferrer">
                          Channel <ArrowSquareOut size={14} weight="bold" />
                        </a>
                      ) : null}
                      {event.externalReference ? (
                        <span><LinkSimple size={14} weight="bold" /> Reference: {event.externalReference}</span>
                      ) : null}
                      {event.receiptPhotoUrl ? (
                        <a href={event.receiptPhotoUrl} target="_blank" rel="noreferrer">
                          Open redacted receipt <ArrowSquareOut size={14} weight="bold" />
                        </a>
                      ) : null}
                    </div>
                    <details className="handoff-integrity">
                      <summary>Internal log details</summary>
                      <div>
                        <span>Event hash <code className="mono">{shortText(event.eventHash, 14, 12)}</code></span>
                        <span>Previous <code className="mono">{event.previousEventHash ? shortText(event.previousEventHash, 14, 12) : 'first event'}</code></span>
                        <span>Recorded <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time></span>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
