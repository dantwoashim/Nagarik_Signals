# Why Solana

Nagarik Signal uses Solana for compact commitments that benefit from public,
independent inspection.

The v2 protocol records:

- an `IssueCommitment` for evidence, metadata, coarse location, lifecycle,
  handoff, and current event-head hashes;
- a sequential `CommitmentEvent` for each approved change;
- protocol configuration, pause state, scoped role grants, and authority
  transfer.

Postgres remains authoritative for submissions, moderation, operator identity,
idempotency, retention, public projections, and outbox state. Private object
storage holds evidence bytes. Putting those records on-chain would increase
privacy risk and make lawful moderation and retention harder.

Solana fits the commitment layer because finalized accounts are publicly
readable, transactions are fast enough for an asynchronous publication worker,
and small deterministic accounts can be verified without operating the Nagarik
Signal database.

The application does not write to Solana directly from a browser request. A
database transaction records immutable intent first, then a bounded worker
submits and reconciles the external operation. Public visibility waits for an
exact finalized observation.

Solana establishes commitment integrity and order. It does not establish
physical truth, unique human identity, government receipt, or permanent media
availability. Mainnet writes remain disabled until the independent program and
key-governance gates pass.
