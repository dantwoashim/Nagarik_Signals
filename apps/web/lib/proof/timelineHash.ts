import type { StatusTimelineEntry } from '../types';
import { canonicalize } from './canonicalize';
import { sha256Hex } from './hash';

export async function computeTimelineHash(entries: StatusTimelineEntry[]) {
  return sha256Hex(canonicalize(entries.map(({ seq, status, proofHash, createdAt }) => ({ seq, status, proofHash, createdAt }))));
}
