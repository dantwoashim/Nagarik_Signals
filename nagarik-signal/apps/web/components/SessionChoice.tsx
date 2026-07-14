'use client';

import { IdentificationBadge, ShieldCheck } from '@phosphor-icons/react';

export function SessionChoice() {
  return (
    <section className="review-proof-section session-choice">
      <div className="badge-row">
        <span className="eyebrow">
          <IdentificationBadge size={15} weight="bold" />
          Civic session
        </span>
        <span className="pill proof-ok">Gasless and private</span>
      </div>
      <p className="muted review-proof-copy">
        The server creates a signed, HttpOnly civic session for this browser. The relayer sponsors the devnet transaction without exposing a session key or asking residents to hold SOL.
      </p>
      <div className="session-boundary">
        <ShieldCheck size={17} weight="bold" /> One session can report and corroborate only within published rate limits. It is not proof of legal identity or a unique person.
      </div>
    </section>
  );
}
