import { Connection } from '@solana/web3.js';
import { appConfig } from '../constants/config';

export function getConnection() {
  return new Connection(appConfig.rpcUrl, 'confirmed');
}
