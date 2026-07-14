import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

type UploadReceipt = {
  version: 1;
  sessionId: string;
  photoUrl: string;
  evidenceHash: string;
  expiresAt: number;
};

function receiptSecret() {
  const configured = process.env.NAGARIK_UPLOAD_RECEIPT_SECRET ?? process.env.NAGARIK_COOKIE_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('nagarik_upload_receipt_secret_missing');
  return 'nagarik-signal-local-development-upload-receipt';
}

function sign(payload: string) {
  return createHmac('sha256', receiptSecret()).update(payload).digest('base64url');
}

export function createUploadReceipt(input: Omit<UploadReceipt, 'version' | 'expiresAt'>) {
  const receipt: UploadReceipt = {
    version: 1,
    ...input,
    expiresAt: Date.now() + 30 * 60_000,
  };
  const payload = Buffer.from(JSON.stringify(receipt)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyUploadReceipt(token: string, expected: Omit<UploadReceipt, 'version' | 'expiresAt'>) {
  const [payload, receivedSignature] = token.split('.');
  if (!payload || !receivedSignature) return false;
  const expectedSignature = sign(payload);
  const left = Buffer.from(receivedSignature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const receipt = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadReceipt;
    return receipt.version === 1
      && receipt.expiresAt >= Date.now()
      && receipt.sessionId === expected.sessionId
      && receipt.photoUrl === expected.photoUrl
      && receipt.evidenceHash === expected.evidenceHash;
  } catch {
    return false;
  }
}
