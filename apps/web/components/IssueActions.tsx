'use client';

import { useState } from 'react';
import { BellRinging, PaperPlaneTilt, Printer, ShareNetwork } from '@phosphor-icons/react';

export function IssueActions({
  title,
  officialUrl,
  canSignal,
}: {
  title: string;
  officialUrl?: string | null;
  canSignal: boolean;
}) {
  const [message, setMessage] = useState('');

  async function shareRecord() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: 'Public civic record on Nagarik Signal', url });
        setMessage('Share sheet opened.');
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage('Record link copied.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('Use the address bar to copy this record link.');
    }
  }

  return (
    <div className="issue-primary-actions">
      <div className="row-actions">
        {officialUrl ? (
          <a className="button dark" href={officialUrl} target="_blank" rel="noreferrer">
            <PaperPlaneTilt size={17} weight="bold" /> Open official channel
          </a>
        ) : null}
        {canSignal ? (
          <a className="button secondary" href="#attention">
            <BellRinging size={17} weight="bold" /> Add public signal
          </a>
        ) : null}
        <button type="button" className="button secondary" onClick={shareRecord}>
          <ShareNetwork size={17} weight="bold" /> Share record
        </button>
        <button type="button" className="icon-button" onClick={() => window.print()} aria-label="Print record" title="Print record">
          <Printer size={18} weight="bold" />
        </button>
      </div>
      <span className="issue-action-status" role="status" aria-live="polite">{message}</span>
    </div>
  );
}
