# Mainnet Readiness Gates

Status: blocking checklist. Passing the devnet POC-1 proof does not satisfy these gates.

## Current State

- Devnet proof artifacts are source-bound and assertable.
- The hosted app can run a demo/pilot pass loop, but public visitors do not yet create fresh on-chain receipts.
- Merchant traction is not claimed unless permissioned evidence is added.
- The program is not externally audited for real funds.

## Required Gates

- External audit or named security review with remediation notes.
- Multisig upgrade authority.
- Persistent pass lifecycle and replay storage.
- Production key management for merchant, terminal, relayer, and deploy authorities.
- POS/payment/receipt binding or an equivalent evidence source.
- Monitoring for failed confirmations, settlement failures, replay attempts, and relayer saturation.
- Incident response process tested at least once.
- Merchant caps, reward caps, refund policy, and dispute process.
- Clear customer and merchant terms.

## Mainnet Claim Rule

Until every required gate is complete, describe Viral Sync as a devnet POC-1 or capped pilot candidate, not as production-ready infrastructure for real merchant funds.
