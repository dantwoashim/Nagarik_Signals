import { PublicKey } from '@solana/web3.js';
import { appConfig } from '../constants/config';

export function getProgramId() {
  return new PublicKey(appConfig.programId);
}

export const programName = 'nagarik_signal';
