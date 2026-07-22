# Architecture

Nagarik Signal separates civic context, media delivery, and public proof. That separation is intentional: text and moderation state need a queryable store, evidence needs controlled delivery, and compact integrity commitments need an independently inspectable ledger.

## Request Path

1. The server creates a signed, HttpOnly civic-session cookie.
2. The upload route verifies Origin and rate limits by session and hashed IP.
3. Sharp decodes the image, rejects oversized pixel surfaces, rotates it, strips metadata, resizes it, and re-encodes it.
4. The sanitized bytes are hashed and written to private storage under the full SHA-256 filename.
5. The server returns a short-lived HMAC receipt binding session, URL, and evidence hash.
6. The report route verifies that receipt, rejects duplicate public evidence, rounds the displayed coordinates, and builds canonical metadata.
7. A deterministic session signer creates the Issue PDA after the relayer circuit breaker and balance checks pass.
8. The durable read model is updated only after chain confirmation.

## Read and Verification Path

1. Public list queries include community reports and public-source dossiers only.
2. Illustrative samples require an explicit scope. QA fixtures cannot enter list results.
3. Evidence is served through a same-origin, private, no-store proxy. Hidden or rejected media returns a safety-policy response instead of bytes.
4. Proof verification fetches the bytes delivered by that proxy and recomputes SHA-256.
5. Canonical metadata and all stored chain fields are compared with the live Issue account.
6. Missing evidence is reported as unavailable, never treated as a match.

## Durable State

The current hosted adapter is private Vercel Blob:

- one fixed-path JSON read model;
- immutable, hash-addressed media objects;
- process-local serialization;
- ETag compare-and-swap for cross-instance conflict detection;
- bounded retry with jitter;
- atomic temp-file replacement in local mode.

The normalized PostgreSQL design in `apps/web/lib/db/schema.sql` remains the migration target for higher write volume and richer reporting. It includes issue provenance, verification uniqueness, status updates, authority handoffs, request events, and rate-limit buckets.

## Authority Handoff Path

Official follow-up is intentionally separate from the Solana lifecycle:

1. A steward selects only a valid next state: `prepared`, `submitted`, `acknowledged`, `follow_up`, or `closed`.
2. The API authenticates the steward, enforces the trusted Origin, session, body limit, and rate limit, and rejects samples and fixtures.
3. `submitted` requires an external reference or redacted receipt. `acknowledged` requires a newly uploaded receipt and explicit privacy review.
4. The event commits its normalized fields and previous event hash with SHA-256.
5. The durable store compares the expected previous hash before appending, preventing stale concurrent writes.
6. Public reads expose the chronology with a permanent platform-recorded boundary.

An idempotency key returns the original immutable event on an exact-state retry. Reusing that key for another issue or state fails. A closed trail cannot be reopened by rewriting history.

## Identity and Signing

The browser never receives a Solana private key. Production sessions use an HMAC-derived deterministic keypair from a server secret and a random signed cookie ID. The relayer funds only the minimum configured session balance and refuses to cross its reserve.

This gives stable duplicate detection for one browser session. Clearing cookies or using another client creates another identity, so this is not proof of personhood.

## Solana Accounts

- `Registry`: issue counter and program authority.
- `Steward`: active status-updater authorization.
- `Issue`: evidence, metadata, location, timeline, status, and count commitments.
- `Verification`: one PDA per issue and signer.
- `StatusUpdate`: one immutable update record per issue sequence.

The API and program enforce the same lifecycle policy. Open records can advance toward follow-up, resolution, dispute, or rejection; disputed records can return to review; resolved and rejected records are terminal. The program rejects unchanged, backward, and reopened states even when called outside the web application.

Authority handoffs are not Solana accounts. StatusUpdate PDAs prove the platform signer committed a civic lifecycle state; the handoff ledger records the platform's operational interaction with an external channel. Neither proves that an authority authored a response.

Program ID:

```text
76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY
```

The program is deployed on devnet and is currently upgradeable by its authority.

## Record Classes

| Kind | Public totals | Live chain claim | Provenance |
|---|---:|---:|---|
| `community_report` | Yes | Yes | Sanitized resident report |
| `public_source` | Yes | Yes | Publisher, URL, dates, expiry, confidence |
| `illustrative_sample` | No | No | Explicit interface sample |
| `qa_fixture` | No | Historical test activity only | Engineering audit record |

## Failure Behavior

- Missing production secrets fail closed.
- Untrusted or malformed Origins are rejected.
- Invalid upload receipts cannot create records.
- Blob conflicts retry and then return an explicit write-conflict error.
- Handoff transitions, stale previous hashes, and reused idempotency keys fail explicitly.
- Evidence mismatch or unavailability fails proof verification.
- Session and global relayer limits protect the funded signer.
- Rejected records leave public discovery; hidden media leaves the proof record visible without serving the artifact.

## Reuse Boundary

Viral Sync contributed patterns for deterministic verification, PDA discipline, receipt integrity, and artifact handling. Nagarik Signal has its own civic metadata contract, account lifecycle, safety policy, and public-source provenance model. Viral Sync receipts are not accepted as Nagarik Signal issue proof.
