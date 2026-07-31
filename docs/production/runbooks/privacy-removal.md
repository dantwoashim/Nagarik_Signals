# Privacy Restriction And Removal

## Trigger

Use this procedure when a published issue or media object may contain personal,
sensitive, unsafe, or unlawfully published information. Treat uncertain cases
as restricted while they are reviewed.

## Owners

The privacy reviewer makes the content decision. A system administrator owns
provider-edge and cache actions. A second operator verifies public denial.

## Procedure

1. Open a restricted privacy case. Record the public ID, release SHA, request
   source, received time, and reason category without copying unnecessary media.
2. If exposure scope is uncertain, disable public media/read at the provider
   edge and complete a cache purge before continuing.
3. Read the current domain version and timeline head from the authenticated
   operator issue view.
4. Send the AAL2 removal request:

```http
POST /api/operator/issues/{publicId}/removal
Origin: https://approved-origin.example
Idempotency-Key: <uuid-v4>
Cookie: <managed AAL2 session>
Content-Type: application/json

{
  "expectedDomainVersion": 7,
  "expectedTimelineHead": "<64 lowercase hex characters>",
  "reasonCode": "privacy_request",
  "publicMessage": "This record was removed after a privacy review.",
  "privateNote": "Restricted case reference and reviewer decision.",
  "cachePurgeReference": "provider-purge-reference"
}
```

The transaction creates a privacy request and restricted access overlay before
returning. Public list, stats, detail, proof, and media paths honor that overlay.
Native v2 returns a pending removal checkpoint; imported v1 creates a terminal
database tombstone and `not_applicable_v1_legacy` without a chain job.

## Verification

From a clean, unauthenticated browser and a separate network path, confirm the
issue returns only the neutral tombstone, media returns neutral `404`, list and
stats exclude the issue, and no prior response remains in CDN cache. For v2,
process and reconcile the removal event only through the bounded worker, then
confirm the finalized tombstone. Never restore a terminal removal.

## Evidence And Exit

Retain the case reference, request ID, idempotency key, cache purge reference,
privacy/audit IDs, public denial checks, and v2 checkpoint state. Close after a
different operator confirms denial and the reviewer records the retention,
legal-hold, and deletion-ledger decision.
