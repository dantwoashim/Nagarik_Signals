'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle,
  Key,
  MapPin,
  NotePencil,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';

import { CategoryPicker } from '@/components/CategoryPicker';
import { PhotoUpload } from '@/components/PhotoUpload';
import { SafetyModal } from '@/components/SafetyModal';
import { PilotLocationPicker } from './PilotLocationPicker';
import { PublicApiError, readPublicApi } from '@/lib/public/api';

type PilotContext = {
  scope: string[];
  expiresAt: string;
  policy: {
    version: string;
    wardGeometryVersion: string;
    wardIds: string[];
  };
};

type SessionResponse = {
  scope: string[];
  expiresAt: string;
};

type UploadResponse = {
  mediaId: string;
  receipt: string;
  expiresAt: string;
  normalization: {
    mimeType: string;
    byteLength: number;
    width: number;
    height: number;
  };
  reviewState: string;
};

type SubmissionResponse = {
  trackingId: string;
  recoveryToken: string;
  state: string;
  receivedAt: string;
  media: { state: string };
  next: string;
};

const stages = [
  { label: 'Photo', icon: Camera },
  { label: 'Details', icon: NotePencil },
  { label: 'Location', icon: MapPin },
  { label: 'Review', icon: ShieldCheck },
] as const;

function kathmanduDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function errorMessage(error: unknown) {
  if (!(error instanceof PublicApiError)) {
    return 'The report service is temporarily unavailable.';
  }
  const messages: Record<string, string> = {
    intake_capability_required: 'This pilot invitation is no longer active.',
    intake_disabled: 'New reports are temporarily paused.',
    pilot_invitation_unavailable: 'This invitation could not be opened.',
    pilot_invitation_invalid: 'Check the invitation and try again.',
    media_too_large: 'The photo is too large. Choose a file under 10 MB.',
    media_type_not_allowed: 'Choose a JPG, PNG, or WebP photo.',
    submission_invalid: 'Check the report details and selected date.',
    outside_pilot_scope: 'Choose a location inside the current pilot area.',
    ward_location_mismatch: 'The selected point is outside that ward.',
    submission_unavailable: 'The report service is temporarily unavailable.',
  };
  return messages[error.code] ?? 'The report could not be sent. Check the fields and try again.';
}

export function ReportExperience() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [sessionState, setSessionState] = useState<'checking' | 'required' | 'ready' | 'error'>(
    'checking',
  );
  const [context, setContext] = useState<PilotContext | null>(null);
  const [invitation, setInvitation] = useState('');
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<'idle' | 'uploading' | 'sending'>('idle');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('road');
  const [observedOn, setObservedOn] = useState(kathmanduDate);

  function checkSession() {
    setSessionState('checking');
    readPublicApi<PilotContext>('/api/v2/intake-sessions')
      .then((result) => {
        setContext(result);
        setSessionState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof PublicApiError && error.status === 401) {
          setSessionState('required');
        } else {
          setSessionState('error');
        }
      });
  }

  useEffect(() => {
    readPublicApi<PilotContext>('/api/v2/intake-sessions')
      .then((result) => {
        setContext(result);
        setSessionState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof PublicApiError && error.status === 401) {
          setSessionState('required');
        } else {
          setSessionState('error');
        }
      });
  }, []);

  async function openInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await readPublicApi<SessionResponse>('/api/v2/intake-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          schemaVersion: 'pilot-invitation-v1',
          invitation: invitation.trim(),
        }),
      });
      if (!result.scope.includes('intake')) {
        throw new PublicApiError('pilot_invitation_invalid', 400, false);
      }
      setInvitation('');
      checkSession();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function validateCurrentStage() {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-stage="${stage}"]`);
    if (!section) return false;
    const controls = Array.from(
      section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea',
      ),
    );
    const invalid = controls.find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  }

  function nextStage() {
    if (!validateCurrentStage()) return;
    setStage((current) => Math.min(stages.length - 1, current + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateCurrentStage() || !formRef.current) return;
    const data = new FormData(formRef.current);
    const file = data.get('photo');
    if (!(file instanceof File) || file.size === 0) {
      setStage(0);
      setMessage('Choose a clear infrastructure photo.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      setProgress('uploading');
      const uploadData = new FormData();
      uploadData.set('file', file);
      const upload = await readPublicApi<UploadResponse>('/api/v2/uploads', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: uploadData,
      });

      setProgress('sending');
      const submission = await readPublicApi<SubmissionResponse>('/api/v2/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          schemaVersion: 'submission-v2',
          title,
          description,
          category,
          observedOn,
          mediaReceipt: upload.receipt,
          location: {
            latitudeE6: Number(data.get('latitudeE6')),
            longitudeE6: Number(data.get('longitudeE6')),
            wardId: String(data.get('wardId') ?? ''),
            geometryVersion: String(data.get('geometryVersion') ?? ''),
            ...(String(data.get('localityLabel') ?? '').trim()
              ? { localityLabel: String(data.get('localityLabel')).trim() }
              : {}),
          },
          acknowledgements: {
            publicInfrastructureOnly: true,
            nonEmergency: true,
            publicationAfterReview: true,
          },
        }),
      });
      router.push(`/submissions/${submission.trackingId}`);
    } catch (error) {
      setMessage(errorMessage(error));
      setProgress('idle');
      if (error instanceof PublicApiError && error.status === 401) {
        setSessionState('required');
      }
    } finally {
      setBusy(false);
    }
  }

  if (sessionState === 'checking') {
    return (
      <div className="prod-report-gate" role="status">
        <span className="prod-inline-spinner" aria-hidden="true" />
        Checking pilot access
      </div>
    );
  }

  if (sessionState === 'error') {
    return (
      <div className="prod-report-gate" role="status">
        <WarningCircle size={25} weight="regular" />
        <div>
          <strong>Reporting is temporarily unavailable.</strong>
          <span>Existing public records remain available.</span>
        </div>
        <button className="button secondary" type="button" onClick={checkSession}>
          Try again
        </button>
      </div>
    );
  }

  if (sessionState === 'required') {
    return (
      <div className="prod-invitation-layout">
        <section className="prod-invitation-copy">
          <span className="eyebrow">
            <Key size={14} weight="bold" /> Curated pilot
          </span>
          <h2>Open your reporting invitation</h2>
          <p>
            Reporting is currently limited to invited residents and civic partners while privacy and
            moderation operations are monitored.
          </p>
        </section>
        <form className="prod-invitation-form" onSubmit={openInvitation}>
          <label className="field">
            <span>Invitation</span>
            <textarea
              value={invitation}
              onChange={(event) => setInvitation(event.target.value)}
              rows={4}
              minLength={80}
              maxLength={220}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          {message ? (
            <p className="form-error" role="alert">
              {message}
            </p>
          ) : null}
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Opening...' : 'Continue'} <ArrowRight size={17} weight="bold" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      <SafetyModal />
      <div className="prod-report-shell">
        <nav className="prod-report-steps" aria-label="Report steps">
          {stages.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={index === stage ? 'active' : index < stage ? 'complete' : ''}
                aria-label={`Step ${index + 1}: ${item.label}`}
                aria-current={index === stage ? 'step' : undefined}
                disabled={index > stage}
                onClick={() => setStage(index)}
              >
                <span>
                  {index < stage ? (
                    <CheckCircle size={18} weight="fill" />
                  ) : (
                    <Icon size={18} weight="regular" />
                  )}
                </span>
                <strong>{item.label}</strong>
                <small>{index + 1}</small>
              </button>
            );
          })}
        </nav>

        <form ref={formRef} className="prod-report-form" onSubmit={submitReport}>
          <section data-stage="0" hidden={stage !== 0}>
            <header>
              <span>Step 1 of 4</span>
              <h2>Choose a safe photo</h2>
              <p>Show the public infrastructure issue clearly and avoid identifying people.</p>
            </header>
            <PhotoUpload />
          </section>

          <section data-stage="1" hidden={stage !== 1}>
            <header>
              <span>Step 2 of 4</span>
              <h2>Describe what is visible</h2>
              <p>Keep the description factual, specific, and focused on the public asset.</p>
            </header>
            <div className="form-grid">
              <label className="field">
                <span>Title</span>
                <input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  minLength={8}
                  maxLength={120}
                  placeholder="Example: Loose drain cover beside a public walkway"
                  required
                />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea
                  name="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  minLength={20}
                  maxLength={2000}
                  rows={6}
                  placeholder="Describe the visible condition and how it affects the public space."
                  required
                />
              </label>
              <CategoryPicker value={category} onChange={setCategory} />
              <label className="field">
                <span>Date observed</span>
                <input
                  name="observedOn"
                  type="date"
                  min="2000-01-01"
                  max={kathmanduDate()}
                  value={observedOn}
                  onChange={(event) => setObservedOn(event.target.value)}
                  required
                />
              </label>
            </div>
          </section>

          <section data-stage="2" hidden={stage !== 2}>
            <header>
              <span>Step 3 of 4</span>
              <h2>Place the issue on the map</h2>
              <p>The exact point is private. A coarse area is created only after review.</p>
            </header>
            {context ? (
              <PilotLocationPicker
                active={stage === 2}
                wardGeometryVersion={context.policy.wardGeometryVersion}
                wardIds={context.policy.wardIds}
              />
            ) : null}
          </section>

          <section data-stage="3" hidden={stage !== 3}>
            <header>
              <span>Step 4 of 4</span>
              <h2>Review and send</h2>
              <p>Your report remains private until a moderator approves a public version.</p>
            </header>
            <dl className="prod-report-review">
              <div>
                <dt>Title</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{category.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>{observedOn}</dd>
              </div>
              <div>
                <dt>Photo</dt>
                <dd>Private pending review</dd>
              </div>
            </dl>
            <div className="prod-acknowledgements">
              <label>
                <input type="checkbox" required /> This concerns public infrastructure.
              </label>
              <label>
                <input type="checkbox" required /> This is not an emergency or immediate threat.
              </label>
              <label>
                <input type="checkbox" required /> I understand publication happens only after
                review.
              </label>
            </div>
          </section>

          {message ? (
            <p className="form-error" role="alert">
              <WarningCircle size={17} weight="bold" /> {message}
            </p>
          ) : null}

          <footer className="prod-report-actions">
            {stage > 0 ? (
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setStage((current) => Math.max(0, current - 1))}
              >
                <ArrowLeft size={17} weight="bold" /> Back
              </button>
            ) : (
              <span />
            )}
            {stage < stages.length - 1 ? (
              <button className="button primary" type="button" onClick={nextStage}>
                Continue <ArrowRight size={17} weight="bold" />
              </button>
            ) : (
              <button className="button primary" type="submit" disabled={busy}>
                {progress === 'uploading'
                  ? 'Preparing photo...'
                  : progress === 'sending'
                    ? 'Sending report...'
                    : 'Submit for review'}
                <ArrowRight size={17} weight="bold" />
              </button>
            )}
          </footer>
        </form>
      </div>
    </>
  );
}
