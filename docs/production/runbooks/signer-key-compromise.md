# Signer Or Key Compromise

## Trigger

Use this procedure for a leaked or suspected signer credential, unknown Solana
transaction, unexpected program authority change, custody-policy bypass, or a
service credential exposed in logs, artifacts, or a provider console.

## Containment

1. Declare a security incident and record the last known-good signature/slot.
2. Disable `v2WritesEnabled`, `publicationEnabled`, and
   `operatorMutationsEnabled`. Stop outbox and reconciliation workers.
3. Pause the v2 program through the approved authority path when that action is
   available and independently authorized.
4. Revoke the affected custody role or credential at its provider. Rotate
   related worker, database, storage, and correlation secrets if compromise
   scope is uncertain.
5. Do not delete outbox, attempt, audit, or chain-binding records.

## Investigation

Inventory every transaction from the last known-good slot. Verify genesis,
program ownership, authority, instruction discriminator, operation ID, issue
PDA, event PDA, sequence, both heads, and account bytes against database intent.
Run dry reconciliation and classify every mismatch; never treat RPC timeout as
account absence.

## Recovery

Provision a replacement signer under the approved spend/program/instruction
policy. Have a different reviewer verify custody settings and authority state.
Test one synthetic canary operation in the approved non-mainnet environment,
then reconcile it through two independent RPC providers.

## Exit Criteria

All observed transactions map to approved intent or a documented incident;
old credentials are revoked; authority and custody evidence is independently
reviewed; no dead letters or unknown descendants remain; and capabilities are
re-enabled one at a time. Mainnet stays prohibited without the external audit
and key-governance gates.
