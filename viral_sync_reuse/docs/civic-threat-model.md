# Civic Threat Model

## Assets

- Sponsor reward pool
- Civic receipt record
- Participant privacy
- Verifier authority
- Public proof artifacts
- Civic source dataset

## Protected In Phase 1

- Duplicate receipt settlement is blocked by the existing nullifier path.
- Wrong participant authority is rejected by the protocol evidence.
- Wrong verifier station is rejected by the protocol evidence.
- Settlement and receipt records are visible in public proof artifacts.
- The civic market packet is hash-bound to the current devnet proof files.

## Not Protected Yet

- A live civic source can still be wrong unless the source is permissioned and auditable.
- A field verifier can still be socially compromised unless verifier governance exists.
- Private identity claims are not verified until an identity adapter is integrated.
- Real-value treasury operations require external review and monitoring.

## Required Hardening

- Add source dataset signatures.
- Add verifier authority rotation and suspension.
- Add persistent pass storage with atomic consume semantics.
- Add privacy adapter verification and public failure modes.
- Add production monitoring before real-value deployment.
