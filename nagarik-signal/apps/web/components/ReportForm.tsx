'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { ApproxLocationPicker } from './ApproxLocationPicker';
import { CategoryPicker } from './CategoryPicker';
import { PhotoUpload } from './PhotoUpload';
import { ProofPreview } from './ProofPreview';
import { SessionChoice } from './SessionChoice';
import { SubmitProgress, type SubmitStep } from './SubmitProgress';
import { WardSelect } from './WardSelect';
import { getWard } from '@/lib/geo/wards';
import { buildProofMetadata, computeLocationHash, computeMetadataHash, normalizeGeohash } from '@/lib/proof/metadata';
import { getOrCreateCivicSession, type CivicSession } from '@/lib/session/civicSession';
import type { IssueCategory } from '@/lib/types';

type UploadResult = {
  photoUrl: string;
  evidenceHash: string;
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

export function ReportForm() {
  const router = useRouter();
  const [session, setSession] = useState<CivicSession | null>(null);
  const [step, setStep] = useState<SubmitStep>('idle');
  const [message, setMessage] = useState('Ready to create a civic proof object.');
  const [preview, setPreview] = useState<{ evidenceHash?: string; metadataHash?: string; locationHash?: string; photoUrl?: string }>({});
  const [created, setCreated] = useState<CreatedReport | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSession = useCallback((current: CivicSession) => {
    setSession(current);
  }, []);

  async function uploadPhoto(file: File) {
    const uploadData = new FormData();
    uploadData.append('file', file);
    const response = await fetch('/api/upload', { method: 'POST', body: uploadData });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'upload_failed');
    return payload as UploadResult;
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
      const currentSession = session ?? getOrCreateCivicSession('anonymous civic session');
      const sessionId = currentSession.mode === 'wallet'
        ? `wallet-relayed:${currentSession.publicKey}`
        : currentSession.publicKey;
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          identityMode: currentSession.mode,
          walletPubkey: currentSession.mode === 'wallet' ? currentSession.publicKey : null,
          displayName: currentSession.label,
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
    <form action={submit} className="panel pad form-grid">
      <SessionChoice onSession={handleSession} />
      <label className="field">
        <span>Title</span>
        <input name="title" required minLength={8} placeholder="Broken drain near public bus stop" />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea name="description" required minLength={20} rows={5} placeholder="Describe the public infrastructure issue safely." />
      </label>
      <CategoryPicker />
      <WardSelect />
      <label className="field">
        <span>First observed</span>
        <input name="firstObservedAt" type="datetime-local" required />
        <span className="helper">This date is committed through the metadata hash. It cannot be more than 180 days old.</span>
      </label>
      <PhotoUpload />
      <ApproxLocationPicker />
      <ProofPreview {...preview} />
      <section className="panel pad">
        <h2 style={{ marginTop: 0 }}>Submit progress</h2>
        <SubmitProgress current={step} />
      </section>
      <button className="button crimson" type="submit" disabled={busy}>
        {busy ? <WarningCircle size={17} weight="bold" /> : <ArrowRight size={17} weight="bold" />}
        {busy ? 'Creating proof...' : 'Create public proof'}
      </button>
      <p className={step === 'failed' ? 'proof-bad' : 'muted'} role="status" style={{ margin: 0, lineHeight: 1.55 }}>
        {step === 'indexed' ? <CheckCircle size={16} weight="bold" /> : null} {message}
      </p>
      {created ? (
        <div className="notice">
          Issue #{created.issueId} is indexed. <Link href={created.url}>Open public issue page</Link>
        </div>
      ) : null}
    </form>
  );
}
