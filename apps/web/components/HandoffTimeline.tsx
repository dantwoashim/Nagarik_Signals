import {
  ArrowSquareOut,
  ClockCountdown,
  LinkSimple,
  PaperPlaneTilt,
  ShieldWarning,
} from '@phosphor-icons/react/dist/ssr';
import { handoffStateLabel } from '@/lib/handoffs/policy';
import type { AuthorityHandoff, CivicIssue, HandoffState } from '@/lib/types';
import { formatDateTime, shortText } from '@/lib/ui/format';

const stateCopy: Record<HandoffState, string> = {
  prepared: 'The official intake route is ready. No delivery to the channel or authority response is claimed.',
  submitted: 'A steward recorded that the issue was sent through the named channel.',
  acknowledged: 'A steward attached a redacted acknowledgement artifact. Its contents are not independently verified by Nagarik Signal.',
  follow_up: 'A steward recorded a follow-up action after the issue was sent to the channel.',
  closed: 'The platform handoff is closed. This does not by itself mean the civic issue is resolved.',
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
          <span className="eyebrow"><PaperPlaneTilt size={15} weight="bold" /> Official follow-up</span>
          <h2 id="handoff-heading">Authority handoff</h2>
        </div>
        <span className={`pill handoff-state handoff-state-${current?.state ?? 'none'}`}>
          {handoffStateLabel(current?.state)}
        </span>
      </div>

      <div className="handoff-boundary" role="note">
        <ShieldWarning size={18} weight="bold" aria-hidden="true" />
        <p><strong>Platform audit log.</strong> These events are recorded by Nagarik Signal stewards, not authored or independently verified by the receiving authority. They are separate from the Solana status timeline.</p>
      </div>

      {!current ? (
        <div className="handoff-empty">
          <PaperPlaneTilt size={28} weight="regular" aria-hidden="true" />
          <div>
            <strong>No official handoff recorded</strong>
            <p>The record may name an official channel, but Nagarik Signal has not recorded route preparation, delivery, or a response.</p>
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
                        <strong>{handoffStateLabel(event.state)}</strong>
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
                      <summary>Audit integrity</summary>
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
