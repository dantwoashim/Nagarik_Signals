# Civic SDK And Sidecars

Phase 3 exposes the civic proof layer in two forms:

- public JSON sidecars under `/proofs/`
- SDK helpers in `viral-sync-sdk`

The sidecars do not replace or rewrite the original Solana proof artifacts. They bind the civic product story to the original devnet manifest, published verifier, fraud gauntlet, proof feed, and readiness packet through SHA-256 hashes.

## Judge Verification

```bash
npm run civic:verify-receipt
```

This command runs offline against `app/public/proofs`. It checks:

- original source artifact hashes
- receipt PDA, nullifier PDA, settlement PDA, record transaction, and settle transaction
- non-wager market design
- forecast credits with no cash value and no transferability
- settlement depending on receipt evidence, not forecast correctness
- replay rejection coverage
- Janamat and zk identity statuses as `specified_not_integrated`

## SDK Verification

```ts
import {
  fetchCivicReceiptVerificationBundle,
  verifyCivicReceiptArtifacts,
} from 'viral-sync-sdk';

const bundle = await fetchCivicReceiptVerificationBundle('https://your-app.example');
const result = verifyCivicReceiptArtifacts(bundle);

if (!result.ok) {
  throw new Error(result.failures.join(', '));
}
```

For offline or test usage, pass already-loaded JSON:

```ts
import { verifyCivicReceiptArtifacts } from 'viral-sync-sdk';

const result = verifyCivicReceiptArtifacts({
  market,
  receipt,
  ledger,
  verifier,
  sidecar,
});
```

## Compatibility Boundaries

`janamat-compatibility.json` and `zk-identity-adapter.json` are specification artifacts only.

They deliberately use:

```text
status = specified_not_integrated
```

That means Viral Sync can explain how these integrations would attach later, but the current project must not claim it consumes Janamat data or verifies private identity proofs.
