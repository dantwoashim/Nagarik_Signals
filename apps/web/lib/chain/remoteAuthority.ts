import { PublicKey, Transaction } from '@solana/web3.js';

import { safeAlertWebhookUrl } from '../ops/alertEndpoint';
import type { V2TransactionAuthority } from '../solana/v2/anchorTransport';
import { ChainExecutionError } from './signer';

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function signerEndpoint(value: string): URL {
  const url = safeAlertWebhookUrl(value);
  if (!url || url.pathname !== '/sign') {
    throw new ChainExecutionError('chain_remote_signer_endpoint_invalid', false);
  }
  return url;
}

function signerSecret(value: string): string {
  const bytes = Buffer.byteLength(value, 'utf8');
  const hasControlCharacter = [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (bytes < 32 || bytes > 1_024 || hasControlCharacter) {
    throw new ChainExecutionError('chain_remote_signer_secret_invalid', false);
  }
  return value;
}

function signedTransaction(value: unknown): Transaction {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2_048 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new ChainExecutionError('chain_remote_signer_response_invalid', false);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) {
    throw new ChainExecutionError('chain_remote_signer_response_invalid', false);
  }
  try {
    return Transaction.from(bytes);
  } catch {
    throw new ChainExecutionError('chain_remote_signer_response_invalid', false);
  }
}

export class RemoteTransactionAuthority implements V2TransactionAuthority {
  readonly publicKey: PublicKey;
  private readonly endpoint: URL;
  private readonly secret: string;

  constructor(
    options: {
      endpoint: string;
      secret: string;
      publicKey: string;
    },
    private readonly fetcher: Fetcher = fetch,
  ) {
    this.endpoint = signerEndpoint(options.endpoint);
    this.secret = signerSecret(options.secret);
    try {
      this.publicKey = new PublicKey(options.publicKey);
    } catch {
      throw new ChainExecutionError('chain_remote_signer_public_key_invalid', false);
    }
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    const expectedMessage = transaction.serializeMessage();
    const unsigned = transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64');
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.secret}`,
          'content-type': 'application/json',
          'user-agent': 'nagarik-chain-worker/1.0',
          'x-nagarik-signer': 'cloudflare-policy-v1',
        },
        body: JSON.stringify({
          schemaVersion: 'nagarik-remote-sign-v1',
          transaction: unsigned,
        }),
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ChainExecutionError('chain_remote_signer_unavailable', true);
    }
    if (!response.ok) {
      throw new ChainExecutionError(
        response.status === 429 || response.status >= 500
          ? 'chain_remote_signer_unavailable'
          : 'chain_remote_signer_rejected',
        response.status === 429 || response.status >= 500,
      );
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > 4_096) {
      throw new ChainExecutionError('chain_remote_signer_response_invalid', false);
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 4_096) {
      throw new ChainExecutionError('chain_remote_signer_response_invalid', false);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ChainExecutionError('chain_remote_signer_response_invalid', false);
    }
    const encoded =
      body && typeof body === 'object' && 'transaction' in body
        ? (body as { transaction?: unknown }).transaction
        : undefined;
    const signed = signedTransaction(encoded);
    if (
      !Buffer.from(signed.serializeMessage()).equals(expectedMessage) ||
      signed.signatures.length !== 1 ||
      !signed.signatures[0].publicKey.equals(this.publicKey) ||
      signed.signatures[0].signature === null ||
      !signed.verifySignatures()
    ) {
      throw new ChainExecutionError('chain_remote_signer_response_invalid', false);
    }
    return signed;
  }
}
