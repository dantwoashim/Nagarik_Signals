# Threat Model

Status: current POC-1 threat model, not a completed external audit.

## Existing Implementation

- Merchant rewards are escrowed on devnet before settlement.
- Receipt recording requires merchant authority, enrolled terminal authority, and visitor authority.
- Replay is blocked by campaign-scoped nullifier accounts.
- Settlement is exact-once through a settlement PDA.
- Settlement token accounts must match the beneficiary keys stored on the receipt.
- Child lineage receipts require the referrer payout beneficiary to match the parent receipt visitor beneficiary.
- Hosted pass packets now include nonce, expiration, campaign binding, terminal binding, and one-time-use state in demo/pilot server mode.

## Known Risks

- POC-1 does not independently prove physical-world presence or purchase.
- Merchant staff, visitor, and referrer collusion remains a real-world risk.
- Root referral payout beneficiary protection depends on wallet/display preimage discipline, not only current on-chain state.
- Hosted demo replay does not mint a fresh on-chain claim pass and receipt for every public visitor.
- In-memory pass state is not production durable.
- Experimental non-POC program modules remain in the full program source and are excluded from the reduced POC-1 IDL.

## Required Before Production

- External program and relayer review.
- Persistent pass/replay storage.
- POS/payment/receipt binding for purchase evidence.
- Upgrade authority moved to multisig.
- Monitoring, alerting, and incident response drills.
- Clear wallet UX for beneficiary manifest preimage display and signing.
