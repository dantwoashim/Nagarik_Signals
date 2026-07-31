'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  Eye,
  Fingerprint,
  ImageSquare,
  MapPin,
  NotePencil,
  Plus,
  ShieldCheck,
  ShieldWarning,
  Trash,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';

import { OperatorApiError, readOperatorApi } from '@/lib/operator/api';

type DerivativeRecord = {
  id: string;
  state: string;
  version: number;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
  evidenceHash: string;
};

type ReviewRecord = {
  submissionId: string;
  recordKind: string;
  state: string;
  version: number;
  assignedTo: string | null;
  receivedAt: string;
  updatedAt: string;
  revision: {
    number: number;
    title: string;
    narrative: string;
    category: string;
    observedOn: string;
    privateLocation: {
      latitudeE3: number;
      longitudeE3: number;
      wardId: string;
      geometryVersion: string;
      localityLabel: string | null;
    };
    media: {
      id: string;
      url: string;
      state: string;
      version: number;
      mimeType: string;
      byteLength: number;
      width: number;
      height: number;
      evidenceHash: string;
      derivative: DerivativeRecord | null;
    };
  };
  moderationEvents: Array<{
    id: string;
    submissionVersion: number;
    actorSubject: string;
    type: string;
    reasonCode: string;
    privateNote: string | null;
    publicSafeMessage: string | null;
    createdAt: string;
  }>;
};

type RedactionRectangle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  reasonCode: 'face' | 'license_plate' | 'personal_detail' | 'private_document' | 'other_sensitive';
};

type DerivativeResponse = DerivativeRecord & {
  sourceMediaId: string;
};

type BindingResponse = {
  receipt: string;
  expiresAt: string;
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));
}

function stateLabel(value: string) {
  const labels: Record<string, string> = {
    received: 'Received',
    under_review: 'Under review',
    changes_requested: 'Changes requested',
    revision_pending: 'Updated report',
    approved: 'Approved',
    rejected: 'Rejected',
    quarantined: 'Awaiting media review',
    approved_private: 'Private media approved',
    redacted_derivative: 'Public derivative ready',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

function reviewError(error: unknown) {
  if (error instanceof OperatorApiError) {
    if (error.status === 401) return 'Your operator session expired.';
    if (error.status === 403) return 'Your role cannot perform this action.';
    if (error.code === 'stale_resource_version') {
      return 'This record changed in another session. The latest version has been loaded.';
    }
    if (error.code === 'operator_mutations_disabled') {
      return 'Operator changes are paused by the operational kill switch.';
    }
  }
  return 'The action could not be completed.';
}

function initialRectangle(record: ReviewRecord): RedactionRectangle {
  return {
    id: crypto.randomUUID(),
    x: 0,
    y: 0,
    width: Math.min(200, record.revision.media.width),
    height: Math.min(120, record.revision.media.height),
    reasonCode: 'personal_detail',
  };
}

export function OperatorReview({
  submissionId,
  organizationId,
}: {
  submissionId: string;
  organizationId: string | null;
}) {
  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [bindingReceipt, setBindingReceipt] = useState('');
  const [bindingExpiry, setBindingExpiry] = useState('');
  const [redactionMode, setRedactionMode] = useState<'clear' | 'redact'>('clear');
  const [rectangles, setRectangles] = useState<RedactionRectangle[]>([]);
  const [title, setTitle] = useState('');
  const [narrative, setNarrative] = useState('');
  const [wardLabel, setWardLabel] = useState('');
  const [localityLabel, setLocalityLabel] = useState('');
  const [publicMessage, setPublicMessage] = useState('');
  const [privateNote, setPrivateNote] = useState('');

  async function fetchRecord() {
    const result = await readOperatorApi<ReviewRecord>(
      `/api/operator/moderation/${encodeURIComponent(submissionId)}`,
    );
    setRecord(result);
    setTitle(result.revision.title);
    setNarrative(result.revision.narrative);
    setWardLabel(result.revision.privateLocation.wardId.replaceAll('-', ' '));
    setLocalityLabel(result.revision.privateLocation.localityLabel ?? '');
    setLoadState('ready');
    return result;
  }

  useEffect(() => {
    let active = true;
    readOperatorApi<ReviewRecord>(`/api/operator/moderation/${encodeURIComponent(submissionId)}`)
      .then((result) => {
        if (!active) return;
        setRecord(result);
        setTitle(result.revision.title);
        setNarrative(result.revision.narrative);
        setWardLabel(result.revision.privateLocation.wardId.replaceAll('-', ' '));
        setLocalityLabel(result.revision.privateLocation.localityLabel ?? '');
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadState(
          error instanceof OperatorApiError && error.status === 404 ? 'missing' : 'error',
        );
      });
    return () => {
      active = false;
    };
  }, [submissionId]);

  const derivative = record?.revision.media.derivative ?? null;
  const canModerate = record?.state === 'under_review';
  const privatePoint = useMemo(() => {
    if (!record) return '';
    const { latitudeE3, longitudeE3 } = record.revision.privateLocation;
    return `${(latitudeE3 / 1000).toFixed(3)}, ${(longitudeE3 / 1000).toFixed(3)}`;
  }, [record]);

  async function mutate<T>(action: string, path: string, body: unknown): Promise<T | null> {
    setBusy(action);
    setMessage('');
    try {
      const result = await readOperatorApi<T>(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      return result;
    } catch (error) {
      setMessage(reviewError(error));
      if (error instanceof OperatorApiError && error.code === 'stale_resource_version') {
        await fetchRecord().catch(() => undefined);
      }
      return null;
    } finally {
      setBusy('');
    }
  }

  async function startReview() {
    if (!record) return;
    const result = await mutate<unknown>(
      'start-review',
      `/api/operator/moderation/${submissionId}`,
      {
        decision: 'start_review',
        expectedVersion: record.version,
        reasonCode: 'operator_review_started',
        privateNote: null,
        publicSafeMessage: null,
      },
    );
    if (result) await fetchRecord();
  }

  async function reviewMedia(decision: 'approve_private' | 'reject') {
    if (!record) return;
    const result = await mutate<unknown>(
      `media-${decision}`,
      `/api/operator/media/${record.revision.media.id}/review`,
      {
        schemaVersion: 'operator-media-review-v1',
        expected: {
          state: 'quarantined',
          version: record.revision.media.version,
        },
        decision,
        reasonCode: decision === 'approve_private' ? 'safe_for_private_review' : 'unsafe_media',
        privateNote: privateNote.trim() || null,
      },
    );
    if (result) {
      setPrivateNote('');
      await fetchRecord();
    }
  }

  function addRectangle() {
    if (!record) return;
    setRectangles((current) => [...current, initialRectangle(record)]);
    setRedactionMode('redact');
  }

  function updateRectangle(id: string, field: keyof RedactionRectangle, value: string) {
    setRectangles((current) =>
      current.map((rectangle) =>
        rectangle.id === id
          ? {
              ...rectangle,
              [field]:
                field === 'reasonCode' ? value : Number.isFinite(Number(value)) ? Number(value) : 0,
            }
          : rectangle,
      ),
    );
  }

  async function createDerivative() {
    if (!record) return;
    if (redactionMode === 'redact' && !rectangles.length) {
      setMessage('Add at least one redaction area.');
      return;
    }
    const result = await mutate<DerivativeResponse>(
      'derivative',
      `/api/operator/media/${record.revision.media.id}/derivatives`,
      {
        schemaVersion: 'public-derivative-v1',
        expected: {
          state: 'approved_private',
          version: record.revision.media.version,
        },
        reviewDecision: redactionMode === 'clear' ? 'no_redaction_required' : 'redact',
        rectangles: rectangles.map(({ id: _id, ...rectangle }) => rectangle),
        privateNote: privateNote.trim() || null,
      },
    );
    if (result) {
      setPrivateNote('');
      await fetchRecord();
    }
  }

  async function issueBinding() {
    if (!record || !derivative) return;
    const result = await mutate<BindingResponse>(
      'binding',
      `/api/operator/media/${derivative.id}/binding-receipts`,
      {
        schemaVersion: 'operator-media-binding-v1',
        expected: {
          state: 'redacted_derivative',
          version: derivative.version,
        },
        binding: {
          purpose: 'initial_publication',
          targetType: 'submission',
          targetId: record.submissionId,
        },
      },
    );
    if (result) {
      setBindingReceipt(result.receipt);
      setBindingExpiry(result.expiresAt);
      setMessage('Media binding issued for this review session.');
    }
  }

  async function submitDecision(
    event: FormEvent<HTMLFormElement>,
    decision: 'request_changes' | 'reject',
  ) {
    event.preventDefault();
    if (!record) return;
    const data = new FormData(event.currentTarget);
    const result = await mutate<unknown>(
      decision,
      `/api/operator/moderation/${record.submissionId}`,
      {
        decision,
        expectedVersion: record.version,
        reasonCode:
          decision === 'request_changes'
            ? 'report_changes_requested'
            : 'publication_policy_not_met',
        privateNote: String(data.get('privateNote') ?? '').trim() || null,
        publicSafeMessage: String(data.get('publicSafeMessage') ?? '').trim() || null,
      },
    );
    if (result) await fetchRecord();
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || !bindingReceipt) return;
    const result = await mutate<{ issue: { publicId: string } | null }>(
      'approve',
      `/api/operator/moderation/${record.submissionId}`,
      {
        decision: 'approve',
        expectedVersion: record.version,
        reasonCode: 'review_approved_for_publication',
        privateNote: privateNote.trim() || null,
        publicSafeMessage: publicMessage.trim() || null,
        publicCopy: {
          title,
          narrative,
          wardLabel,
          localityLabel: localityLabel.trim() || null,
          publicReason: publicMessage.trim() || null,
        },
        mediaBindingReceipt: bindingReceipt,
      },
    );
    if (result) {
      setBindingReceipt('');
      setPrivateNote('');
      await fetchRecord();
    }
  }

  const backHref = organizationId
    ? `/operator?organization=${encodeURIComponent(organizationId)}`
    : '/operator';

  if (loadState === 'loading') {
    return (
      <div className="operator-review-state" role="status">
        <span className="prod-inline-spinner" aria-hidden="true" /> Loading private review
      </div>
    );
  }

  if (loadState === 'missing') {
    return (
      <div className="operator-review-state">
        <ShieldWarning size={26} weight="regular" />
        <div>
          <strong>Review record unavailable</strong>
          <span>The report may belong to another organization.</span>
        </div>
        <Link className="button secondary" href={backHref}>
          Return to queue
        </Link>
      </div>
    );
  }

  if (loadState === 'error' || !record) {
    return (
      <div className="operator-review-state" role="status">
        <WarningCircle size={26} weight="regular" />
        <div>
          <strong>Private review is temporarily unavailable.</strong>
          <span>Check your session and try again.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="operator-review">
      <header className="operator-review-heading">
        <Link href={backHref}>
          <ArrowLeft size={16} weight="bold" /> Moderation queue
        </Link>
        <div className="operator-review-title">
          <div>
            <span className={`operator-state operator-state-${record.state}`}>
              {stateLabel(record.state)}
            </span>
            <span className="mono">Revision {record.revision.number}</span>
          </div>
          <h1>{record.revision.title}</h1>
          <p>Received {displayDate(record.receivedAt)}</p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => void fetchRecord()}
          disabled={Boolean(busy)}
        >
          <Eye size={17} weight="bold" /> Refresh
        </button>
      </header>

      <div className="operator-private-boundary">
        <ShieldCheck size={18} weight="bold" />
        <span>Private review material</span>
        <p>Do not copy raw media, precise location, or internal notes into public fields.</p>
      </div>

      {message ? (
        <div className="operator-action-message" role="status">
          {message}
        </div>
      ) : null}

      <div className="operator-review-grid">
        <main className="operator-review-main">
          <section className="operator-review-section" aria-labelledby="evidence-review-heading">
            <header>
              <div>
                <span className="eyebrow">
                  <ImageSquare size={14} weight="bold" /> Evidence
                </span>
                <h2 id="evidence-review-heading">Private source media</h2>
              </div>
              <span className={`operator-state operator-state-${record.revision.media.state}`}>
                {stateLabel(record.revision.media.state)}
              </span>
            </header>
            <figure className="operator-private-media">
              {/* The direct media route requires the operator's browser cookie. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={record.revision.media.url} alt="Private evidence under operator review" />
              <figcaption>
                <span>
                  {record.revision.media.width} x {record.revision.media.height}
                </span>
                <span>{Math.ceil(record.revision.media.byteLength / 1024)} KB</span>
                <span>{record.revision.media.mimeType}</span>
              </figcaption>
            </figure>
          </section>

          <section className="operator-review-section" aria-labelledby="report-review-heading">
            <header>
              <div>
                <span className="eyebrow">
                  <NotePencil size={14} weight="bold" /> Submitted record
                </span>
                <h2 id="report-review-heading">Private report details</h2>
              </div>
            </header>
            <dl className="operator-submission-details">
              <div>
                <dt>Description</dt>
                <dd>{record.revision.narrative}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{record.revision.category.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>{record.revision.observedOn}</dd>
              </div>
              <div>
                <dt>Private review point</dt>
                <dd>
                  <MapPin size={15} weight="fill" /> {privatePoint}
                </dd>
              </div>
              <div>
                <dt>Ward</dt>
                <dd>{record.revision.privateLocation.wardId}</dd>
              </div>
              <div>
                <dt>Nearby place</dt>
                <dd>{record.revision.privateLocation.localityLabel ?? 'Not provided'}</dd>
              </div>
            </dl>
          </section>

          <section className="operator-review-section" aria-labelledby="history-review-heading">
            <header>
              <div>
                <span className="eyebrow">
                  <ClockCounterClockwise size={14} weight="bold" /> Audit history
                </span>
                <h2 id="history-review-heading">Moderation events</h2>
              </div>
            </header>
            {record.moderationEvents.length ? (
              <ol className="operator-review-events">
                {record.moderationEvents.map((event) => (
                  <li key={event.id}>
                    <span />
                    <div>
                      <strong>{event.type.replaceAll('_', ' ')}</strong>
                      <p>{event.privateNote ?? event.publicSafeMessage ?? event.reasonCode}</p>
                      <time>{displayDate(event.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="operator-empty-copy">No moderation decision has been recorded.</p>
            )}
          </section>
        </main>

        <aside className="operator-review-actions">
          <section className="operator-action-panel">
            <header>
              <span>1</span>
              <div>
                <strong>Claim review</strong>
                <p>Begin an attributed moderation session.</p>
              </div>
            </header>
            {record.state === 'received' || record.state === 'revision_pending' ? (
              <button
                className="button primary"
                type="button"
                onClick={startReview}
                disabled={Boolean(busy)}
              >
                {busy === 'start-review' ? 'Starting...' : 'Start review'}
              </button>
            ) : (
              <div className="operator-step-complete">
                <CheckCircle size={17} weight="fill" /> {stateLabel(record.state)}
              </div>
            )}
          </section>

          <section className="operator-action-panel">
            <header>
              <span>2</span>
              <div>
                <strong>Review source media</strong>
                <p>Approve private processing or reject unsafe media.</p>
              </div>
            </header>
            {canModerate && record.revision.media.state === 'quarantined' ? (
              <>
                <label className="field">
                  <span>Internal note</span>
                  <textarea
                    value={privateNote}
                    onChange={(event) => setPrivateNote(event.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                </label>
                <div className="operator-action-buttons">
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => reviewMedia('approve_private')}
                    disabled={Boolean(busy)}
                  >
                    <CheckCircle size={17} weight="bold" /> Approve media
                  </button>
                  <button
                    className="button secondary danger"
                    type="button"
                    onClick={() => reviewMedia('reject')}
                    disabled={Boolean(busy)}
                  >
                    <XCircle size={17} weight="bold" /> Reject media
                  </button>
                </div>
              </>
            ) : (
              <div className="operator-step-complete">
                {record.revision.media.state === 'rejected' ? (
                  <XCircle size={17} weight="fill" />
                ) : (
                  <CheckCircle size={17} weight="fill" />
                )}
                {stateLabel(record.revision.media.state)}
              </div>
            )}
          </section>

          <section className="operator-action-panel">
            <header>
              <span>3</span>
              <div>
                <strong>Prepare public media</strong>
                <p>Create a metadata-free derivative with required redactions.</p>
              </div>
            </header>
            {canModerate && record.revision.media.state === 'approved_private' && !derivative ? (
              <>
                <div className="operator-segmented" role="group" aria-label="Redaction decision">
                  <button
                    className={redactionMode === 'clear' ? 'active' : ''}
                    type="button"
                    onClick={() => setRedactionMode('clear')}
                  >
                    No redaction
                  </button>
                  <button
                    className={redactionMode === 'redact' ? 'active' : ''}
                    type="button"
                    onClick={() => {
                      setRedactionMode('redact');
                      if (!rectangles.length) addRectangle();
                    }}
                  >
                    Redact
                  </button>
                </div>
                {redactionMode === 'redact' ? (
                  <div className="operator-redactions">
                    {rectangles.map((rectangle, index) => (
                      <fieldset key={rectangle.id}>
                        <legend>Area {index + 1}</legend>
                        <div>
                          {(['x', 'y', 'width', 'height'] as const).map((field) => (
                            <label key={field}>
                              <span>{field}</span>
                              <input
                                type="number"
                                min={0}
                                max={
                                  field === 'x' || field === 'width'
                                    ? record.revision.media.width
                                    : record.revision.media.height
                                }
                                value={rectangle[field]}
                                onChange={(event) =>
                                  updateRectangle(rectangle.id, field, event.target.value)
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <label className="field">
                          <span>Reason</span>
                          <select
                            value={rectangle.reasonCode}
                            onChange={(event) =>
                              updateRectangle(rectangle.id, 'reasonCode', event.target.value)
                            }
                          >
                            <option value="face">Face</option>
                            <option value="license_plate">License plate</option>
                            <option value="personal_detail">Personal detail</option>
                            <option value="private_document">Private document</option>
                            <option value="other_sensitive">Other sensitive content</option>
                          </select>
                        </label>
                        <button
                          className="icon-button compact"
                          type="button"
                          aria-label={`Remove redaction area ${index + 1}`}
                          title="Remove redaction area"
                          onClick={() =>
                            setRectangles((current) =>
                              current.filter((candidate) => candidate.id !== rectangle.id),
                            )
                          }
                        >
                          <Trash size={16} weight="bold" />
                        </button>
                      </fieldset>
                    ))}
                    <button className="button secondary" type="button" onClick={addRectangle}>
                      <Plus size={16} weight="bold" /> Add area
                    </button>
                  </div>
                ) : null}
                <button
                  className="button primary"
                  type="button"
                  onClick={createDerivative}
                  disabled={Boolean(busy)}
                >
                  {busy === 'derivative' ? 'Preparing...' : 'Create public derivative'}
                </button>
              </>
            ) : derivative ? (
              <div className="operator-step-complete">
                <CheckCircle size={17} weight="fill" /> Public derivative ready
              </div>
            ) : (
              <div className="operator-step-waiting">Complete private media review first.</div>
            )}
          </section>

          <section className="operator-action-panel">
            <header>
              <span>4</span>
              <div>
                <strong>Bind and approve</strong>
                <p>Freeze the public copy and schedule its integrity commitment.</p>
              </div>
            </header>
            {canModerate && derivative ? (
              <>
                {!bindingReceipt ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={issueBinding}
                    disabled={Boolean(busy)}
                  >
                    <Fingerprint size={17} weight="bold" />
                    {busy === 'binding' ? 'Binding...' : 'Bind reviewed media'}
                  </button>
                ) : (
                  <div className="operator-binding-ready">
                    <CheckCircle size={17} weight="fill" />
                    <span>Binding valid until {displayDate(bindingExpiry)}</span>
                  </div>
                )}
                <form className="operator-public-copy" onSubmit={approve}>
                  <label className="field">
                    <span>Public title</span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      minLength={8}
                      maxLength={120}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Public description</span>
                    <textarea
                      value={narrative}
                      onChange={(event) => setNarrative(event.target.value)}
                      minLength={20}
                      maxLength={2000}
                      rows={5}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Public ward label</span>
                    <input
                      value={wardLabel}
                      onChange={(event) => setWardLabel(event.target.value)}
                      maxLength={120}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Public nearby place</span>
                    <input
                      value={localityLabel}
                      onChange={(event) => setLocalityLabel(event.target.value)}
                      maxLength={80}
                    />
                  </label>
                  <label className="field">
                    <span>Public review note</span>
                    <textarea
                      value={publicMessage}
                      onChange={(event) => setPublicMessage(event.target.value)}
                      maxLength={240}
                      rows={3}
                    />
                  </label>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={!bindingReceipt || Boolean(busy)}
                  >
                    {busy === 'approve' ? 'Approving...' : 'Approve public version'}
                    <ArrowRight size={17} weight="bold" />
                  </button>
                </form>
              </>
            ) : record.state === 'approved' ? (
              <div className="operator-step-complete">
                <CheckCircle size={17} weight="fill" /> Approved and awaiting chain publication
              </div>
            ) : (
              <div className="operator-step-waiting">A reviewed derivative is required.</div>
            )}
          </section>

          {canModerate ? (
            <details className="operator-other-decisions">
              <summary>Request changes or reject</summary>
              <div>
                <form onSubmit={(event) => submitDecision(event, 'request_changes')}>
                  <label className="field">
                    <span>Private instruction</span>
                    <textarea name="privateNote" rows={3} maxLength={2000} required />
                  </label>
                  <label className="field">
                    <span>Public-safe message</span>
                    <textarea name="publicSafeMessage" rows={2} maxLength={500} />
                  </label>
                  <button className="button secondary" type="submit" disabled={Boolean(busy)}>
                    Request changes
                  </button>
                </form>
                <form onSubmit={(event) => submitDecision(event, 'reject')}>
                  <label className="field">
                    <span>Private rejection reason</span>
                    <textarea name="privateNote" rows={3} maxLength={2000} required />
                  </label>
                  <label className="field">
                    <span>Public-safe message</span>
                    <textarea name="publicSafeMessage" rows={2} maxLength={500} />
                  </label>
                  <button
                    className="button secondary danger"
                    type="submit"
                    disabled={Boolean(busy)}
                  >
                    <XCircle size={17} weight="bold" /> Reject report
                  </button>
                </form>
              </div>
            </details>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
