'use client';

import { IdentificationBadge } from '@phosphor-icons/react';

export function SessionChoice() {
  return (
    <section className="review-proof-section session-choice">
      <div className="badge-row">
        <span className="eyebrow">
          <IdentificationBadge size={15} weight="bold" />
          Private session
        </span>
        <span className="pill proof-ok">No wallet needed</span>
      </div>
      <p className="muted review-proof-copy">
        Nagarik creates a private browser session and sponsors the Solana fee. You do not need a wallet or SOL.
      </p>
      <p className="session-boundary">The session limits repeated actions. It does not identify you.</p>
    </section>
  );
}
