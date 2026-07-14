'use client';

import { WarningCircle } from '@phosphor-icons/react';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="container page-section">
      <div className="empty-state error-state" role="alert">
        <WarningCircle size={30} weight="regular" />
        <strong>This public record could not be loaded.</strong>
        <span>The proof data is unchanged. Retry the read operation or return to the public feed.</span>
        <button type="button" className="button primary" onClick={reset}>Try again</button>
      </div>
    </section>
  );
}
