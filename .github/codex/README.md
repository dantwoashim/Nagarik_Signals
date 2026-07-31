# Read-Only Automated Review Policy

This directory contains review prompts and policy for optional automated pull
request review.

Automated review is advisory and read-only:

- no auto-merge, branch write, release, deployment, database migration,
  program deployment, secret change, or issue closure;
- no production, civic, private submission, operator, wallet, or key access;
- no execution of untrusted pull-request code with a review credential;
- workflow permissions remain `contents: read`;
- findings cite repository evidence and distinguish confirmed defects from
  missing evidence;
- security exploit details stay in an approved private reporting channel;
- a human reviews every recommendation and all generated changes.

The governing contracts are:

- `docs/production/production-readiness-master-plan.md`
- `docs/production/architecture-contract.md`
- `docs/production/state-machines.md`
- `docs/production/api-contracts.md`
- `docs/production/data-classification.md`
- `docs/production/release-criteria.md`

An automated review result is never release evidence by itself.
