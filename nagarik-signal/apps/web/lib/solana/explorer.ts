import { appConfig } from '../constants/config';

export function explorerUrl(signatureOrAddress: string, type: 'tx' | 'address' = 'tx') {
  const path = type === 'tx' ? 'tx' : 'address';
  const cluster = appConfig.cluster === 'mainnet-beta' ? '' : `?cluster=${encodeURIComponent(appConfig.cluster)}`;
  return `https://explorer.solana.com/${path}/${signatureOrAddress}${cluster}`;
}
