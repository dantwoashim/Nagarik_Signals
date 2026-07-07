# Upgrade Authority Policy

Status: policy target for pilots and mainnet readiness.

## Current State

The POC-1 devnet program is controlled by the configured deploy authority. This is acceptable for a devnet proof but not for uncapped production use.

## Pilot Requirement

- Record the current program ID, deploy authority, and release commit before every pilot proof run.
- Do not claim immutable or decentralized governance while a single deploy authority can upgrade the program.
- Treat any program upgrade as a new proof boundary requiring artifact regeneration.

## Mainnet Requirement

- Move upgrade authority to a multisig before real-value launch.
- Document signer set, threshold, emergency process, and upgrade notice period.
- Store upgrade proposals and execution records with release notes.
- Include upgrade authority status on the proof/readiness page or release packet.
