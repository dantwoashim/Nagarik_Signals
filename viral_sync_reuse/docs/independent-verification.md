# Independent Verification

Reviewers can inspect the civic project without trusting the rendered frontend.

## Route Checks

```bash
npm run civic:assert-routes
```

This checks that the civic app routes, API routes, redirects, mobile navigation, and demo access rules exist.

## Claim Checks

```bash
npm run claims:scan
```

This scans the primary civic surface for unsupported production, privacy, and outcome claims.

## Artifact Checks

```bash
npm run civic:assert-artifacts
```

This verifies that the civic proof packets exist, are non-empty JSON, keep the missing integration boundary visible, and match the current source proof file hashes.

## Receipt Verification

```bash
npm run civic:verify-receipt
```

This is the judge-safe Phase 3 command. It verifies the civic receipt bundle without network access and without mutating artifacts:

- source artifact hashes for the original devnet manifest, published verifier, fraud gauntlet, proof feed, and readiness packet
- receipt PDA, nullifier PDA, settlement PDA, record transaction, and settle transaction bindings
- non-wager market design and forecast-to-settlement decoupling
- published verifier pass fields
- replay rejection coverage
- Janamat and zk identity compatibility boundaries as `specified_not_integrated`

## Signed Pass Checks

```bash
npm run test:protocol
```

The Phase 3 civic tests verify stateless pass issuance, tamper rejection, replay proof generation, SDK civic wrappers, independent receipt verification, and the absence of forecast-to-settlement coupling.

## SDK Checks

External builders can verify the public civic proof bundle through the SDK:

```ts
import {
  fetchCivicReceiptVerificationBundle,
  verifyCivicReceiptArtifacts,
} from 'viral-sync-sdk';

const bundle = await fetchCivicReceiptVerificationBundle('https://your-app.example');
const result = verifyCivicReceiptArtifacts(bundle);
```

`result.ok` is true only when the sidecar, receipt, market, ledger, and verifier artifacts agree on the receipt binding and claim boundaries.

## Technical Proof

The raw proof files remain available under `/proofs/`. The civic app routes users through `/ledger`, which now exposes the independent verifier command and source artifact hash bindings directly in the UI.
