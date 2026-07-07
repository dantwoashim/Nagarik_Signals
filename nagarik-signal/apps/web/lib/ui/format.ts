import { appConfig } from '../constants/config';

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));
}

export function shortText(value: string | null | undefined, left = 8, right = 8) {
  if (!value) return 'missing';
  return value.length <= left + right + 3 ? value : `${value.slice(0, left)}...${value.slice(-right)}`;
}

export function txUrl(txSig: string | null | undefined) {
  if (!txSig) return null;
  const cluster = appConfig.cluster === 'mainnet-beta' ? '' : `?cluster=${encodeURIComponent(appConfig.cluster)}`;
  return `https://explorer.solana.com/tx/${txSig}${cluster}`;
}

export function addressUrl(address: string | null | undefined) {
  if (!address) return null;
  const cluster = appConfig.cluster === 'mainnet-beta' ? '' : `?cluster=${encodeURIComponent(appConfig.cluster)}`;
  return `https://explorer.solana.com/address/${address}${cluster}`;
}
