'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle,
  MapPin,
  NotePencil,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import { CategoryPicker } from './CategoryPicker';
import { PhotoUpload } from './PhotoUpload';
import { ProofPreview } from './ProofPreview';
import { ReportLocation } from './ReportLocation';
import { SessionChoice } from './SessionChoice';
import { SubmitProgress, type SubmitStep } from './SubmitProgress';
import { categoryLabel } from '@/lib/constants/categories';
import { getWard } from '@/lib/geo/wards';
import { buildProofMetadata, computeLocationHash, computeMetadataHash, normalizeGeohash } from '@/lib/proof/metadata';
import type { IssueCategory } from '@/lib/types';

type UploadResult = {
  photoUrl: string;
  evidenceHash: string;
  uploadReceipt: string;
};

type CreatedReport = {
  issueId: number;
  issuePda: string;
  txSig: string;
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
  url: string;
  explorerUrl?: string;
};

type ReviewSnapshot = {
  title: string;
  category: string;
  locality: string;
  firstObservedAt: string;
};

const stages = [
  { title: 'Evidence', shortTitle: 'Photo', icon: Camera },
  { title: 'Issue details', shortTitle: 'Details', icon: NotePencil },
  { title: 'Approximate place', shortTitle: 'Place', icon: MapPin },
  { title: 'Review and anchor', shortTitle: 'Review', icon: ShieldCheck },
] as const;

export function ReportForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const movedRef = useRef(false);
  const [stage, setStage] = useState(0);
  const [step, setStep] = useState<SubmitStep>('idle');
  const [message, setMessage] = useState('Ready to create a civic proof object.');
  const [preview, setPreview] = useState<{ evidenceHash?: string; metadataHash?: string; locationHash?: string; photoUrl?: string }>({});
  const [review, setReview] = useState<ReviewSnapshot | null>(null);
  const [created, setCreated] = useState<CreatedReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!movedRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>(`[data-stage="${stage}"] h2`)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stage]);

  async function uploadPhoto(file: File) {
    const uploadData = new FormData();
    uploadData.append('file', file);
    const response = await fetch('/api/upload', { method: 'POST', body: uploadData });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'upload_failed');
    return payload as UploadResult;
  }

  function validateStage(index: number) {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-stage="${index}"]`);
    if (!section) return false;
    const controls = Array.from(section.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
    const invalid = controls.find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  }

  function captureReview() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const category = String(data.get('category') ?? 'road') as IssueCategory;
    const ward = getWard(String(data.get('wardId') ?? 'kathmandu-10'));
    setReview({
      title: String(data.get('title') ?? '').trim(),
      category: categoryLabel(category),
      locality: ward.label,
      firstObservedAt: String(data.get('firstObservedAt') ?? '').replace('T', ' at '),
    });
  }

  function moveTo(nextStage: number) {
    movedRef.current = true;
    setStage(Math.max(0, Math.min(stages.length - 1, nextStage)));
  }

  function continueFlow() {
    if (!validateStage(stage)) return;
    const nextStage = Math.min(stages.length - 1, stage + 1);
    if (nextStage === stages.length - 1) captureReview();
    moveTo(nextStage);
  }

  async function submit(formData: FormData) {
    setBusy(true);
    setCreated(null);
    setMessage('Uploading evidence...');
    setStep('uploading');
    try {
      const file = formData.get('photo');
      if (!(file instanceof File) || file.size === 0) throw new Error('safe public photo required');

      const upload = await uploadPhoto(file);
      setPreview({ evidenceHash: upload.evidenceHash, photoUrl: upload.photoUrl });

      setStep('hashing');
      setMessage('Hashing metadata...');
      const title = String(formData.get('title') ?? '').trim();
      const description = String(formData.get('description') ?? '').trim();
      const category = String(formData.get('category') ?? 'water') as IssueCategory;
      const wardId = String(formData.get('wardId') ?? 'kathmandu-10');
      const ward = getWard(wardId);
      const latDisplay = Number(formData.get('latDisplay') ?? ward.lat);
      const lngDisplay = Number(formData.get('lngDisplay') ?? ward.lng);
      const firstObservedValue = String(formData.get('firstObservedAt') ?? '');
      const firstObservedAt = new Date(firstObservedValue).toISOString();
      const geohash = normalizeGeohash(latDisplay, lngDisplay);
      const metadata = buildProofMetadata({
        title,
        description,
        category,
        wardId: ward.id,
        locality: ward.label,
        latDisplay,
        lngDisplay,
        geohash,
        firstObservedAt,
        evidenceHash: upload.evidenceHash,
        photoUrl: upload.photoUrl,
      });
      const [metadataHash, locationHash] = await Promise.all([
        computeMetadataHash(metadata),
        computeLocationHash(ward.id, geohash),
      ]);
      setPreview({
        evidenceHash: upload.evidenceHash,
        metadataHash,
        locationHash,
        photoUrl: upload.photoUrl,
      });

      setStep('anchoring');
      setMessage('Anchoring proof on Solana devnet...');
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          category,
          wardId: ward.id,
          locality: ward.label,
          latDisplay,
          lngDisplay,
          geohash,
          firstObservedAt,
          photoUrl: upload.photoUrl,
          evidenceHash: upload.evidenceHash,
          uploadReceipt: upload.uploadReceipt,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'report_create_failed');

      setStep('confirming');
      setMessage('Confirming and indexing issue...');
      const report = payload as CreatedReport;
      setCreated(report);
      setStep('indexed');
      setMessage(`Proof anchored. Opening issue ${report.issueId}.`);
      router.push(report.url);
      router.refresh();
    } catch (error) {
      setStep('failed');
      setMessage(error instanceof Error ? error.message.replaceAll('_', ' ') : 'Unable to create report');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} action={submit} className="report-workflow" aria-busy={busy}>
      <nav className="report-stage-nav" aria-label="Report progress">
        {stages.map((item, index) => {
          const Icon = item.icon;
          const state = index < stage ? 'complete' : index === stage ? 'current' : 'upcoming';
          return (
            <button
              key={item.title}
              type="button"
              className={`report-stage-tab ${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
              disabled={index > stage}
              onClick={() => index < stage && moveTo(index)}
            >
              <span className="report-stage-icon">{state === 'complete' ? <CheckCircle size={18} weight="fill" /> : <Icon size={18} weight="bold" />}</span>
              <span><small className="mono">0{index + 1}</small><strong>{item.shortTitle}</strong></span>
            </button>
          );
        })}
      </nav>

      <div className="report-stage-viewport">
        <section className="report-step" data-stage="0" hidden={stage !== 0}>
          <div className="report-step-heading"><span className="mono">01</span><div><h2 tabIndex={-1}>Add safe evidence</h2><p>Use one clear photo of the public asset. Image metadata is stripped before upload.</p></div></div>
          <PhotoUpload />
          <div className="report-stage-actions end">
            <button className="button primary" type="button" onClick={continueFlow}>Continue to details <ArrowRight size={17} weight="bold" /></button>
          </div>
        </section>

        <section className="report-step" data-stage="1" hidden={stage !== 1}>
          <div className="report-step-heading"><span className="mono">02</span><div><h2 tabIndex={-1}>Describe only what is visible</h2><p>Keep the record factual, useful, and focused on public infrastructure.</p></div></div>
          <div className="form-grid">
            <label className="field">
              <span>Title</span>
              <input name="title" required minLength={8} maxLength={140} placeholder="Broken drain beside a public bus stop" />
              <span className="helper">Name the asset and the observable problem. Avoid people, blame, or speculation.</span>
            </label>
            <label className="field">
              <span>Description</span>
              <textarea name="description" required minLength={20} maxLength={1200} rows={6} placeholder="Describe what is visible, how public access is affected, and any immediate physical context." />
            </label>
            <CategoryPicker />
          </div>
          <div className="report-stage-actions">
            <button className="button secondary" type="button" onClick={() => moveTo(0)}><ArrowLeft size={17} weight="bold" />Back</button>
            <button className="button primary" type="button" onClick={continueFlow}>Continue to place <ArrowRight size={17} weight="bold" /></button>
          </div>
        </section>

        <section className="report-step" data-stage="2" hidden={stage !== 2}>
          <div className="report-step-heading"><span className="mono">03</span><div><h2 tabIndex={-1}>Place it approximately</h2><p>Ward-level context is useful. Exact reporter coordinates are not.</p></div></div>
          <ReportLocation />
          <div className="report-stage-actions">
            <button className="button secondary" type="button" onClick={() => moveTo(1)}><ArrowLeft size={17} weight="bold" />Back</button>
            <button className="button primary" type="button" onClick={continueFlow}>Review the record <ArrowRight size={17} weight="bold" /></button>
          </div>
        </section>

        <section className="report-step final-step" data-stage="3" hidden={stage !== 3}>
          <div className="report-step-heading"><span className="mono">04</span><div><h2 tabIndex={-1}>Review and anchor</h2><p>Confirm the public summary and inspect what the proof process will commit.</p></div></div>
          {review ? (
            <section className="review-summary" aria-label="Report review summary">
              <div><span>Public title</span><strong>{review.title}</strong></div>
              <div><span>Category</span><strong>{review.category}</strong></div>
              <div><span>Approximate place</span><strong>{review.locality}</strong></div>
              <div><span>First observed</span><strong>{review.firstObservedAt}</strong></div>
            </section>
          ) : null}
          <div className="review-proof-grid">
            <SessionChoice />
            <ProofPreview {...preview} />
          </div>
          <div className="submit-progress-block">
            <h3>Publishing progress</h3>
            <SubmitProgress current={step} />
          </div>
          <div className="report-stage-actions publish-actions">
            <button className="button secondary" type="button" onClick={() => moveTo(2)} disabled={busy}><ArrowLeft size={17} weight="bold" />Back</button>
            <button className="button primary submit-proof" type="submit" disabled={busy}>
              {busy ? <WarningCircle size={17} weight="bold" /> : <ShieldCheck size={17} weight="bold" />}
              {busy ? 'Creating proof...' : 'Create public proof'}
            </button>
          </div>
          <p className={step === 'failed' ? 'proof-bad form-status' : 'form-status'} role={step === 'failed' ? 'alert' : 'status'} aria-live="polite">
            {step === 'indexed' ? <CheckCircle size={16} weight="bold" /> : null} {message}
          </p>
          {created ? <div className="notice">Issue #{created.issueId} is indexed. <Link href={created.url}>Open public issue page</Link></div> : null}
        </section>
      </div>
    </form>
  );
}
