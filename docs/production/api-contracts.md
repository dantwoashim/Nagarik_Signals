# Production API Contracts

Status: frozen and accepted for implementation  
API version: `v2`  
Canonical JSON version: `nagarik-json-v2`

## General protocol

### Transport

- HTTPS is mandatory outside local development.
- JSON request bodies use `Content-Type: application/json`.
- Uploads use bounded `multipart/form-data`.
- Mutation endpoints reject untrusted `Origin` and unexpected content types.
- Browser operator sessions use secure, HttpOnly, same-site cookies and CSRF
  protection. CORS is same-origin unless an explicit reviewed client is added.
- Request bodies are bounded before full buffering.

Every application capability cookie uses a `__Host-` name, `Secure`,
`HttpOnly`, `Path=/`, no `Domain`, `SameSite=Strict`, and an expiry no later
than the backing capability. Cookie values are never readable by client
JavaScript. Managed-auth cookies must meet the provider's equivalent
host-only/secure policy; operator mutations still require origin and CSRF
validation.

### Identifiers

- Native v2 public issue IDs are canonical lowercase UUIDv4 values. Imported
  v1 public IDs are deterministic UUIDv5 values under namespace
  `029aa1f6-cf8c-41d0-b778-a0eff42ba87d` with name
  `nagarik-signal:v1:{numericIssueId}`. Submission, media, event, and tracking
  IDs are UUIDv4 or versioned opaque identifiers with at least 128 random bits.
  No sequential database or v1 numeric ID is used as a private lookup key.
- IDs are case-sensitive and have a versioned prefix where useful.
- A malformed, unknown, unauthorized, or non-public private identifier returns
  the same neutral `404` response.

### Request ID

Every response includes:

```http
X-Request-Id: <opaque-random-id>
```

The JSON body repeats `requestId`. A caller may supply a syntactically valid
`X-Request-Id`; the server may replace it and never trusts it for authorization.

### Success envelope

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {}
}
```

### Error envelope

```json
{
  "ok": false,
  "requestId": "req_...",
  "error": {
    "code": "stable_machine_code",
    "message": "Safe user-facing explanation.",
    "fields": {
      "optionalField": ["stable_validation_code"]
    },
    "retryable": false
  }
}
```

Public responses never include stack traces, SQL/RPC/Blob errors, internal
paths, storage keys, raw exception messages, operator identity, or secret
configuration. Diagnostic detail is correlated by `requestId` in restricted
structured logs.

### Idempotency

Every mutation requires a caller-generated UUIDv4:

```http
Idempotency-Key: 7d55a4b8-f197-4b0c-82cb-5c8ec8f5fd71
```

The scope includes API version, operation, organization, and
actor/capability identity. The server hashes the canonical semantic request.

- Same scope/key/request hash returns the stored status/body and
  `Idempotency-Replayed: true`.
- Same scope/key with a different request hash returns `409
  idempotency_key_reused`.
- A concurrent duplicate waits for or returns the same logical result.
- A `202` response means durable intent exists; it does not claim publication
  or chain confirmation.
- Raw authorization/tracking/media tokens are excluded from persisted request
  diagnostics.

The idempotency row stores the stable logical status and non-secret data, not
the per-attempt envelope. Each attempt receives a fresh `requestId`. Capability
tokens and `Set-Cookie` headers are regenerated from a protected capability
reference; their raw values are never stored in the idempotency response.

Capability issuance is deterministic for replay:

```text
derivation_input =
  ASCII("nagarik:capability-secret:v1\0")
  || key_version_le_u16
  || purpose_u8
  || organization_uuid_network_bytes_16
  || capability_uuid_network_bytes_16
  || subject_uuid_network_bytes_16
  || idempotency_uuid_network_bytes_16

secret_32 =
  HMAC-SHA-256(capability_derivation_key[key_version], derivation_input)

verifier_input =
  ASCII("nagarik:capability-verifier:v1\0")
  || key_version_le_u16
  || purpose_u8
  || organization_uuid_network_bytes_16
  || capability_uuid_network_bytes_16
  || subject_uuid_network_bytes_16
  || secret_32

verifier_32 =
  HMAC-SHA-256(capability_verifier_key[key_version], verifier_input)
```

All UUIDs are canonical lowercase UUID strings at the API and 16 network-order
bytes in the formula. `key_version` is `1..65535`. Purpose discriminants are:

```text
1 pilot_invitation      prefix npi
2 pilot_intake          prefix npc
3 pilot_signal          prefix nsg
4 submission_tracking   prefix nsc
5 privacy_tracking      prefix npr
6 submission_media      prefix nmr
7 operator_media        prefix nomr
8 privacy_export        prefix npe
```

The subject UUID in both formulas is exact:

| Purpose | `subject_uuid` |
|---|---|
| `pilot_invitation` | invitation row UUID |
| `pilot_intake` | consumed invitation UUID |
| `pilot_signal` | consumed invitation UUID |
| `submission_tracking` | private submission UUID |
| `privacy_tracking` | privacy request UUID |
| `submission_media` | private media row UUID |
| `operator_media` | operator media row UUID |
| `privacy_export` | encrypted export artifact UUID |

The organization UUID is always the organization owning that subject. A
cross-purpose or cross-organization row is invalid even if its verifier bytes
match.

The exact token grammar is
`<prefix>.<decimal-key-version>.<canonical-capability-uuid>.<secret>`.
The decimal key version has no leading zero. `secret` is unpadded base64url of
exactly 32 bytes and therefore 43 ASCII characters. No whitespace, alternate
base64 alphabet, unknown prefix, noncanonical UUID, or extra segment is
accepted. Dot is the delimiter because it is outside the base64url alphabet;
underscore would be ambiguous. The prefix must match `purpose_u8`.

The database stores organization, capability UUID, purpose, subject UUID,
idempotency UUID, expiry, state, key version, and `verifier_32`; it never stores
`secret_32` or token text. Verification parses strictly, recomputes
`verifier_32`, and compares all 32 bytes in constant time before state/scope
authorization. Derivation and verifier keys are independent 32-byte-or-longer
secrets. This lets an exact authorized replay reproduce the same token/cookie
without raw-token persistence. Expired or revoked replay returns the same token
and original expiry, but it remains unusable and is not renewed. Keys remain
available until every dependent capability and idempotency row expires;
compromise revokes the affected key version and triggers rotation.

### Optimistic concurrency

Operator event mutations include aggregate-specific database concurrency tokens:

```json
{
  "expected": {
    "workflowVersion": 3,
    "workflowHead": "<64 lowercase hex characters>",
    "state": "open"
  }
}
```

Only fields relevant to the named domain aggregate are required. These are
database workflow tokens, not Solana proof inputs. No external API accepts a
caller-selected `chainSequence`, expected on-chain update count, timeline head,
handoff head, event/operation ID, canonical payload, or payload/account hash.
Inside the mutation transaction, the server locks the issue checkpoint row and
derives/reserves those values from projected chain state. A stale domain value
returns `409 stale_aggregate`. The response includes a safe current version
reference but no private row or chain preimage.

### Standard status codes

| Status | Meaning |
|---|---|
| `200` | successful read or replayed completed mutation |
| `201` | new bounded resource created |
| `202` | durable asynchronous intent accepted |
| `204` | successful action with no body where explicitly documented |
| `400` | malformed request or unsupported content |
| `401` | no valid authentication/capability |
| `403` | authenticated identity lacks role/MFA/scope; operator routes only |
| `404` | unknown, never-public, private, or denied public/capability resource |
| `409` | idempotency conflict, stale state/head, receipt replay, or transition conflict |
| `413` | request or decoded media exceeds limit |
| `415` | unsupported media type |
| `422` | syntactically valid but semantically invalid fields |
| `429` | rate limit; includes bounded `Retry-After` |
| `503` | dependency unavailable or feature safely disabled; stable category only |

Private public-facing routes prefer neutral `404` over authorization detail.
Operator routes may use `401`/`403` because the resource class is already
authenticated.

### Feature availability

The profile/static/runtime semantics are frozen in
`architecture-contract.md`. Every handler enforces the effective capability;
navigation or button visibility is never authorization.

- retired legacy mutation: `410 legacy_mutation_retired`;
- supported mutation disabled by release ceiling, kill switch, or dependency
  guard: `503 feature_temporarily_unavailable`;
- disabled public read: `503 feature_temporarily_unavailable`;
- malformed/unauthorized requests do not receive dependency or private-state
  detail.

`GET /api/v2/capabilities` is public, `no-store`, and returns only:

The example below represents an activated pilot after the named guards pass;
the migration/default response has all four booleans `false`.

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "schemaVersion": "capabilities-v1",
    "profile": "curated_pilot_v2_non_mainnet",
    "publicRead": true,
    "publicMedia": true,
    "inviteIntake": true,
    "inviteSignals": true
  }
}
```

The response omits operator, publication, v2-write, kill-switch, dependency,
and diagnostic state. Its booleans are a user-interface snapshot only. The
capability route is a minimal edge allowlist exception so it can report a
public-read/media shutdown without accessing civic data.

## Authentication modes

| Mode | Mechanism | Routes |
|---|---|---|
| public | none | published issue list/detail/proof, approved media |
| intake | short-lived secure HttpOnly capability cookie | upload and initial submission |
| tracking | `Authorization: NagarikTracking <raw-token>` or short-lived HttpOnly exchange session | private submission tracking/withdrawal |
| operator | managed auth session, active membership, role, organization scope, AAL2 | `/api/operator/**` |
| system | managed auth session, active platform grant, AAL2 | `/api/system/**` |
| machine | provider-issued service identity or dedicated short-lived service token with audience | `/api/internal/**` |

The raw tracking token is returned once and is never accepted in a URL query.
Machine credentials are not interactive operator credentials and never enter
browser code.

## Operator invitation API

### `POST /api/operator/invitations`

Auth: AAL2 `org_admin`.  
Idempotency: required.

Request:

```json
{
  "schemaVersion": "pilot-invitation-create-v1",
  "scopes": ["intake", "signal"],
  "expiresAt": "2026-08-07T12:00:00.000Z",
  "pilotPolicyVersion": "pilot-boundary-2026-01"
}
```

Expiry must be future and no more than seven days from creation. Exactly one
consumption is allowed. Success returns invitation ID and a deterministically
replayable raw `npi.1.<capability-uuid>.<secret>` token to the same
org-admin/idempotency context.
The application does not email, message, or log the token; authorized humans
distribute it out of band. Provisioning is audited.

`POST /api/operator/pilot-capabilities/{capabilityId}/revoke` requires AAL2
`org_admin`, idempotency, expected version, and reason. Revocation invalidates
pilot and linked signal-context cookies for new requests and is audited.

`POST /api/operator/invitations/{invitationId}/revoke` uses
`{"schemaVersion":"pilot-invitation-revoke-v1","expectedVersion":<u32>,"reasonCode":<enum>}`.
It requires the same controls, works only before consumption/expiry, and never
reveals or recreates the raw invitation. Pilot-capability revocation uses the
parallel exact schema
`{"schemaVersion":"pilot-capability-revoke-v1","expectedVersion":<u32>,"reasonCode":<enum>}`.

## `POST /api/v2/intake-sessions`

Purpose: consume a curated-pilot invitation and establish bounded intake and/or
signal capability.  
Auth: single-use invitation in the JSON body.  
Idempotency: required.  
Cache: `no-store`.

Request:

```json
{
  "schemaVersion": "pilot-invitation-v1",
  "invitation": "npi.1.<capability-uuid>.<secret>"
}
```

Success `201` sets a Secure, HttpOnly, SameSite=Strict
`__Host-nagarik-pilot` capability cookie. If signal scope is present, it also
sets an independent `__Host-nagarik-signal-context` cookie. Both are revocable,
purpose-separated, and expire no later than seven days after consumption.
The response returns only:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "scope": ["intake", "signal"],
    "expiresAt": "2026-08-07T12:00:00.000Z"
  }
}
```

The invitation is database-backed and bound to organization, pilot
geometry/policy version, exact scopes, expiry, and one consumption. The raw
value is never logged or persisted. Consumption, pilot capability, and signal
context are committed atomically. Invalid, used, expired, revoked, or
wrong-audience invitations return the same neutral error. An exact authorized
idempotent replay regenerates the same cookies without granting a second
consumption or extending expiry.

## `POST /api/v2/uploads`

Purpose: normalize and stage one private evidence image.

Auth: intake capability; the server may mint the secure cookie on the first
valid request.  
Idempotency: required.  
Body: multipart field `file`, exactly one file.

Limits:

- request/input stream: 10 MiB;
- decoded pixels: 25 megapixels;
- private normalized longest side: 4096 pixels, no enlargement;
- output: 6 MiB;
- accepted input: single-frame JPEG, PNG, WebP;
- normalized output: exact JPEG/WebP selection and encoder settings under
  `image-v2` in `architecture-contract.md`.

Success `201`:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "mediaId": "med_...",
    "receipt": "nmr.1.<capability-uuid>.<secret>",
    "expiresAt": "2026-07-31T12:00:00.000Z",
    "normalization": {
      "version": "image-v2",
      "mimeType": "image/webp",
      "width": 1600,
      "height": 1200,
      "byteLength": 245100,
      "sha256": "<64 lowercase hex>"
    },
    "reviewState": "staged"
  }
}
```

The response contains no URL, storage key, original filename, EXIF, or private
scanner details. `receipt` is one-time, bound to intake capability, media ID,
exact normalized hash, purpose `submission`, and expiry.

Stable errors include:

- `upload_missing`
- `upload_too_large`
- `decoded_image_too_large`
- `unsupported_image`
- `animated_or_multipage_image`
- `malformed_image`
- `normalized_image_too_large`
- `media_storage_unavailable`
- `intake_disabled`

Every upload first lands under a private, unguessable `staging/` object key
whose provider-enforced lifecycle deletes it after 24 hours independently of
the application database. The proxy denies any object without an eligible DB
row. If storage succeeds and the DB transaction fails, immediate deletion is
attempted; failure is safe because storage expiry still applies. A bounded
inventory sweeper lists the private staging prefix, deletes objects without an
eligible row, and alerts on deletion failure or oldest-object age. A DB outage
plus failed immediate deletion is a required test and may not make the object
retrievable.

## `POST /api/v2/submissions`

Purpose: create private moderated intake.  
Auth: intake capability.  
Idempotency: required.  
Result: no public issue and no chain operation.

Request:

```json
{
  "schemaVersion": "submission-v2",
  "title": "Loose drain cover beside a public walkway",
  "description": "The cover is displaced and leaves an opening beside the pedestrian path.",
  "category": "water",
  "observedOn": "2026-07-30",
  "mediaReceipt": "nmr.1.<capability-uuid>.<secret>",
  "location": {
    "latitudeE6": 27700123,
    "longitudeE6": 85312345,
    "wardId": "configured-ward-id",
    "geometryVersion": "pilot-boundary-2026-01",
    "localityLabel": "Optional user-entered locality"
  },
  "acknowledgements": {
    "publicInfrastructureOnly": true,
    "nonEmergency": true,
    "publicationAfterReview": true
  }
}
```

Validation defaults:

- title: 8-120 Unicode code points after normalization;
- description: 20-2000 code points;
- `observedOn`: required civic date `YYYY-MM-DD`, not after the current
  Asia/Kathmandu date and not before `2000-01-01`;
- locality label: optional, 1-80 code points, treated as private until review;
- category: one of `road`, `waste`, `water`,
  `electricity_lighting`, `public_facility`, `public_safety_hazard`, or
  `other_public_infrastructure`;
- `latitudeE6`/`longitudeE6`: JSON integers in
  `-90000000..90000000`/`-180000000..180000000`; the server applies the exact
  half-away-from-zero E6-to-E3 rounding in `architecture-contract.md`, then
  requires the stored point to be inside the reviewed Nepal boundary,
  configured pilot scope, and selected ward geometry;
- media receipt: unexpired, unconsumed, matching capability/purpose/media row;
- emergency/personal/legal-complaint content: rejected or routed to reviewed
  guidance without publication.

Success `202`:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "trackingId": "trk_...",
    "recoveryToken": "nsc.1.<capability-uuid>.<secret>",
    "state": "received",
    "receivedAt": "2026-07-31T12:00:00.000Z",
    "media": {"state":"promotion_pending"},
    "next": "review"
  }
}
```

The response also sets a Secure, HttpOnly, SameSite=Strict tracking cookie.
`recoveryToken` is returned only on the original logical response/replay to the
same active intake context and is never logged. It is accepted through
`Authorization: NagarikTracking <token>` to recover tracking on another
browser. Server persistence contains only its versioned keyed hash.

Stable errors include:

- `submission_invalid`
- `category_not_allowed`
- `outside_nepal`
- `outside_pilot_scope`
- `ward_unknown`
- `ward_location_mismatch`
- `media_receipt_invalid`
- `media_receipt_expired`
- `media_receipt_consumed`
- `intake_disabled`

Transaction:

1. reserve idempotency;
2. lock and consume media receipt;
3. create immutable private `community_report` submission/revision with
   `observedOn` and server `receivedAt`;
4. bind media, move it `staged -> promotion_pending`, and create the
   deterministic durable-private media-promotion outbox operation;
5. derive but do not publish canonical coarse location;
6. store only keyed capability identifiers;
7. append audit;
8. store the stable `202` result.

The submission cannot enter review until media reconciliation has copied and
hash-verified the exact object into durable private storage and changed it to
`quarantined`. Promotion failure leaves the submission private and opens the
safe re-upload path; it never skips into review.

## `GET /api/v2/submissions/{trackingId}`

Purpose: capability-scoped private tracking.  
Auth: matching tracking capability.  
Cache: `Cache-Control: no-store`.

Success `200`:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "trackingId": "trk_...",
    "state": "changes_requested",
    "receivedAt": "2026-07-31T12:00:00.000Z",
    "lastChangedAt": "2026-08-01T08:00:00.000Z",
    "action": {
      "type": "submit_revision",
      "publicSafeMessage": "Please provide a wider photo showing the surrounding public walkway.",
      "expiresAt": "2026-08-31T08:00:00.000Z"
    },
    "publication": {
      "state": "not_published",
      "publicIssueId": null
    }
  }
}
```

The response omits private moderation notes, operator identity, precise
coordinates, scanner details, storage keys, outbox/chain diagnostics, and other
submissions. A published submission may return its public issue ID.

Wrong, expired, revoked, or cross-submission capability returns neutral `404`.

### `POST /api/v2/submissions/{trackingId}/revisions`

Auth: matching non-expired tracking capability.  
State: only `changes_requested`.  
Idempotency: required.  
Concurrency: expected revision number and state required.

Request is a complete immutable private revision:

```json
{
  "schemaVersion": "submission-revision-v2",
  "expected": {"revision": 1, "state": "changes_requested"},
  "title": "Revised private title",
  "description": "Revised private description with the requested context.",
  "category": "water",
  "observedOn": "2026-07-30",
  "mediaReceipt": "nmr.1.<capability-uuid>.<secret>",
  "location": {
    "latitudeE6": 27700123,
    "longitudeE6": 85312345,
    "wardId": "configured-ward-id",
    "geometryVersion": "pilot-boundary-2026-01",
    "localityLabel": "Optional private locality"
  },
  "acknowledgements": {
    "publicInfrastructureOnly": true,
    "nonEmergency": true,
    "publicationAfterReview": true
  }
}
```

The transaction reserves idempotency, consumes the new purpose-bound media
receipt, creates revision `n + 1`, retains prior revisions immutably, moves the
submission to `revision_pending`, moves the bound media from `staged` to
`promotion_pending`, creates the deterministic promotion outbox operation,
appends audit, and returns `202` with
`{"state":"revision_pending","media":{"state":"promotion_pending"}}`. Media
reconciliation changes the submission to `under_review` only after every
current-revision object is durably promoted and quarantined. Promotion failure
returns it to `changes_requested` with a safe re-upload message. No public or
chain record is created.

### `POST /api/v2/submissions/{trackingId}/withdrawal`

Auth: matching tracking capability.  
Idempotency and expected revision/state: required.

Request:

```json
{
  "schemaVersion": "submission-withdrawal-v1",
  "expected": {"revision": 2, "state": "under_review"},
  "reasonCategory": "reporter_withdrew"
}
```

The transaction appends withdrawal, revokes all write scope, denies bound
private media except restricted retention/legal access, schedules retention,
and returns the safe terminal tracking result. The capability remains
read-only for at most 90 days after the terminal event so the reporter can
confirm outcome and replay the exact withdrawal; it cannot revise or submit
another mutation.

## Privacy request API

Privacy requests are private and do not accept identity documents or evidence
uploads through the public API.

### `POST /api/v2/privacy-requests`

Auth: invite-derived pilot capability for the target organization. A
`submission` target additionally requires the exact matching tracking
capability; it is never optional.  
Idempotency: required.

Request:

```json
{
  "schemaVersion": "privacy-request-v1",
  "target": {
    "type": "public_issue",
    "id": "6f62862a-c3d3-4758-bd40-3012ab63ab86"
  },
  "requestType": "media_restriction",
  "description": "The published image may contain personal information."
}
```

`target.type` is `submission` or `public_issue`. `requestType` is `access`,
`correction`, `withdrawal`, `media_restriction`, `erasure`, or `other`.
Description is 20-1000 code points and remains private.

The server derives organization scope from the target row and rejects a
caller-supplied organization field as unknown. The pilot capability,
submission tracking capability when required, target, privacy request, and
operator queue must all resolve to that same organization. Unknown, wrong
capability, cross-organization, and never-public targets return the same
neutral `404`.

Success `202` sets a separate secure privacy-tracking cookie and returns a
deterministically replayable recovery capability:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "privacyRequestId": "privacy-request-opaque-id",
    "recoveryToken": "npr.1.<capability-uuid>.<secret>",
    "state": "received",
    "receivedAt": "2026-07-31T12:00:00.000Z"
  }
}
```

### `GET /api/v2/privacy-requests/{privacyRequestId}`

Matching privacy-tracking capability only; `no-store`. Returns state, safe
information request, last transition time, and whether an export is available.
It excludes operator identity/private notes, legal-hold detail, other records,
storage URLs, and internal verification method.

### `POST /api/v2/privacy-requests/{privacyRequestId}/withdrawal`

Matching privacy capability, idempotency, expected version/state. Appends
withdrawal and leaves only bounded read-only tracking under retention.

### Operator privacy routes

`GET /api/operator/privacy-requests` and
`GET /api/operator/privacy-requests/{id}` require AAL2
`privacy_reviewer`, organization scope, and `no-store`.

`POST /api/operator/privacy-requests/{id}/transitions` requires idempotency and
expected version/state. The discriminated action is:

- `verify_capability_or_identity`;
- `begin_review`;
- `request_information`;
- `fulfill`;
- `partially_fulfill`;
- `deny`.

`verify_capability_or_identity` records `tracking_capability` or an approved
out-of-band method identifier and verifier hash; it stores no identity
document. Terminal decisions require a private reason, public-safe outcome,
affected record/version IDs, retention/media actions, and audit.
Correction/removal outcomes invoke their dedicated immutable services rather
than editing rows.

`POST /api/operator/privacy-requests/{id}/access-overlays` is the only
single-issue emergency restriction/restoration route. It requires AAL2
`privacy_reviewer`, organization/resource scope, idempotency, and an exact
expected object:

```json
{
  "schemaVersion": "public-access-overlay-v1",
  "action": "restrict",
  "expected": {
    "privacyRequestVersion": 3,
    "privacyRequestState": "in_review",
    "overlayVersion": 0,
    "publicVersionId": "version-uuid"
  },
  "reasonCategory": "privacy_safety_review",
  "decisionEventId": null
}
```

`action` is `restrict` or `clear`. `restrict` requires an active checked privacy
request targeting the derived issue and no terminal removal. Its transaction
increments `overlayVersion`, records actor/reason/case, denies issue/media
origin authorization, and creates typed edge-deny/cache-purge jobs. Public
issue/media reads reveal no content and return stable `503
issue_temporarily_restricted` while the overlay is active.

`clear` requires `decisionEventId` to identify a terminal, attributable
`no_removal_required` privacy decision for the same case. It also requires the
same current approved public version and exact overlay version. The transaction
increments the overlay version, clears the deny state, rechecks all public
eligibility, and creates edge/cache invalidation jobs. Only a
`privacy_reviewer` may clear; a removed issue, changed version, stale decision,
or missing purge/edge control fails closed. Every apply/clear effect and purge
acknowledgment is audited.

`POST /api/operator/privacy-requests/{id}/exports` requires AAL2
`privacy_reviewer`, an eligible checked request, idempotency, and expected
version. It creates a minimal encrypted-at-rest export artifact with a 24-hour
expiry and no raw storage URLs. It does not return a download secret to the
operator.

`POST /api/v2/privacy-requests/{id}/export-receipts` requires the matching
privacy-tracking capability, idempotency, an available unexpired artifact, and
`Cache-Control: no-store`. It returns a raw
`npe.1.<capability-uuid>.<secret>` receipt only in the JSON
body. The receipt is bound to purpose `privacy_export`, privacy request,
artifact, capability, 15-minute expiry, nonce, and key version. Persistence
contains only its keyed verifier and non-secret binding. Exact authorized
idempotent replay re-derives the same active receipt; replay never renews
expiry or revocation.

`GET /api/v2/privacy-requests/{id}/export` requires the matching privacy
capability plus
`Authorization: NagarikExport npe.1.<capability-uuid>.<secret>`; receipts are never
accepted in a URL or cookie. A transaction acquires one bounded download lease,
so concurrent use fails. It streams the artifact from the same origin with
`Cache-Control: no-store`, restrictive attachment headers, and no redirect.
Successful stream completion atomically marks the receipt consumed and records
the audit result. An interrupted stream releases or expires the lease without
consuming the receipt, allowing only that receipt to retry before its original
expiry. Artifact expiry/revocation always wins. Consumption, interruption,
expiry, and deletion are audited; verifier deletion follows the 30-day
capability-verifier maximum.

## `GET /api/v2/issues`

Purpose: public approved issue list.  
Auth: public.  
Source: public database projection only.

Query:

- `cursor`: opaque server cursor;
- `limit`: 1-50, default 20;
- `category`: exact public enum;
- `wardId`: exact configured public ward ID;
- `lifecycle`: public lifecycle enum;
- `publishedBefore`: optional ISO timestamp for stable snapshots.

Ordering is stable `(published_at DESC, public_id DESC)`. The cursor binds the
filter set and ordering version.

Success `200`:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "items": [
      {
        "publicId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
        "workflowVersion": "v2",
        "versionId": "ver_...",
        "title": "Approved title",
        "summary": "Approved bounded summary",
        "category": "water",
        "ward": {"id": "ward-id", "label": "Ward label"},
        "location": {
          "policyVersion": "grid-0.01deg-v1",
          "coarseCellId": "g1-11770-26531",
          "centerLatE6": 27705000,
          "centerLngE6": 85315000,
          "uncertaintyRadiusM": 800
        },
        "lifecycle": "open",
        "legacyStatus": null,
        "legacySignalCount": null,
        "publishedAt": "2026-07-31T12:00:00.000Z",
        "signalCount": 4,
        "media": {"mediaId": "med_public_...", "alt": "Approved description"}
      }
    ],
    "nextCursor": "cur_...",
    "snapshotAt": "2026-07-31T12:30:00.000Z"
  }
}
```

No total count is returned unless it comes from an exact indexed aggregate.
Private/sample/QA records never appear.

Each item includes `workflowVersion: "v2"` or `"v1_legacy"`. Native v2 items
have a lifecycle and `legacyStatus: null`. Imported v1 items have
`lifecycle: null`, preserve the exact raw `legacyStatus`
(`submitted`, `verified`, `in_progress`, `resolved`, `disputed`, or
`rejected`), and expose `legacySignalCount` with meaning
`legacy_session_signal_count_not_unique_people`. No v1 status is mapped into
v2 lifecycle. Only explicitly reviewed production-eligible v1 records appear.

## `GET /api/v2/issues/{publicId}`

Purpose: public approved immutable version and public event projection.  
Auth: public.

Success includes:

- public identity and current immutable version;
- approved narrative/category/coarse location/media;
- source/provenance and freshness labels;
- publication and lifecycle states;
- public status/correction/handoff events;
- neutral signal count;
- v1/v2 binding summary and proof endpoint URL.

Public provenance is:

```json
{
  "kind": "community_report",
  "firstObservedOn": "2026-07-30",
  "receivedAt": "2026-07-31T12:00:00.000Z",
  "lastCheckedAt": "2026-08-01T09:00:00.000Z"
}
```

or:

```json
{
  "kind": "public_source",
  "publisher": "Approved publisher name",
  "sourceUrl": "https://public.example/source",
  "sourceIdentity": "<64 lowercase hex>",
  "contentSha256": "<64 lowercase hex>",
  "sourcePublishedAt": "2026-07-30T06:00:00.000Z",
  "contentCheckedAt": "2026-07-31T12:00:00.000Z",
  "statusUpdatedAt": "2026-07-31T12:00:00.000Z",
  "nextReviewAt": "2026-08-31T12:00:00.000Z",
  "status": "current"
}
```

`status` is `current`, `stale`, `unavailable`, or `superseded` and describes
source freshness/availability, not truth. `sourcePublishedAt` is a canonical
timestamp or JSON `null` when the reviewed source exposes no publication time.
Reporter identity, import diagnostics, and private source-review notes are
absent.

The issue DTO also exposes `sourceReviewOverdue`, derived as server time at or
after canonical `nextReviewAt`; that flag is not part of the committed
provenance object. It prevents a delayed checkpoint from presenting an overdue
source as freshly reviewed.

Never-public, non-public, and unknown IDs return the same neutral `404`. Every
previously published ID in `removed` state returns a neutral tombstone:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "publication": "removed",
    "tombstone": {
      "schemaVersion": "nagarik-public-tombstone-v1",
      "canonicalization": "RFC8785",
      "publicIssueId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
      "removedVersionId": "9daef02a-7c24-4c60-8051-b45d2592564b",
      "removedAt": "2026-08-04T12:00:00.000Z",
      "reasonCategory": "privacy_safety",
      "notice": "This issue is no longer publicly available."
    },
    "correctionHistoryAvailable": true,
    "checkpoint": {"state":"pending"}
  }
}
```

The example is a native v2 tombstone with a pending removal checkpoint. For an
imported v1 issue, `checkpoint` is exactly
`{"state":"not_applicable_v1_legacy"}`. The nested tombstone object is
byte-for-byte canonical in both cases. Its hash is committed by the native v2
removal event; for imported v1 it is retained only in the append-only database
audit/recovery record and is never presented as a chain commitment. It never
repeats removed title, narrative, exact location, media, moderation note,
private reason, operator, or requester detail.

## `POST /api/v2/issues/{publicId}/signals`

Purpose: record a neutral off-chain attention/corroboration signal.  
Auth: invite-derived bounded pilot signal cookie/capability.  
Idempotency: required.

Request:

```json
{"schemaVersion":"signal-v1"}
```

Success `200` or `201`:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "accepted": true,
    "signalCount": 5,
    "meaning": "attention_signal_not_identity_or_truth"
  }
}
```

A repeat from the same issue-scoped keyed signal context is idempotent. It does
not call Solana, create a verification account, or change publication,
lifecycle, handoff, proof, priority, or official status.

The target may be an eligible currently public native v2 issue or reviewed
imported v1 issue in the canonical union. For imported v1, this endpoint's
`signalCount` counts only new `signal-v1` off-chain signals and is stored
separately from immutable `legacySignalCount`; the two values are never added
together or described as unique people.

`DELETE /api/v2/issues/{publicId}/signals` retracts the current capability's
active signal idempotently. It does not rewrite historical aggregate audit
events or reveal whether another capability signaled.

## `GET /api/v2/issues/{publicId}/proof`

Purpose: independently report integrity dimensions.  
Auth: public.  
Cache: bounded public cache keyed by immutable version and binding.

Optional `versionId` selects a published/current or superseded-public immutable
version. Without it, the current public version is selected. Unknown,
never-public, pending, or denied versions use the same neutral `404`.

Success:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "proofVersion": "v2",
    "issueVersionId": "ver_...",
    "metadataSchemaVersion": "nagarik-public-metadata-v2",
    "eventSchemaVersion": "nagarik-public-event-v2",
    "canonicalization": "RFC8785",
    "locationPolicyVersion": "grid-0.01deg-v1",
    "bytes": {
      "status": "match",
      "algorithm": "sha256",
      "expected": "<hex>",
      "observed": "<hex>"
    },
    "metadata": {
      "status": "match",
      "algorithm": "sha256",
      "expected": "<hex>",
      "observed": "<hex>"
    },
    "location": {
      "status": "match",
      "policyVersion": "grid-0.01deg-v1",
      "expected": "<hex>",
      "observed": "<hex>"
    },
    "chain": {
      "status": "confirmed",
      "protocol": "nagarik-v2",
      "cluster": "approved-non-mainnet-profile",
      "programId": "<public-key>",
      "genesisHash": "<pinned-genesis-hash>",
      "issueAccount": {
        "address": "<public-key>",
        "owner": "<program-public-key>",
        "accountSha256": "<64 lowercase hex>",
        "updateCount": 4,
        "timelineHead": "<64 lowercase hex>",
        "handoffHead": "<64 lowercase hex>",
        "publicationRemoved": false
      },
      "versionBinding": {
        "eventType": "metadata_version_committed",
        "eventId": "<64 lowercase hex>",
        "chainSequence": 2,
        "eventAccount": "<public-key>",
        "eventAccountSha256": "<64 lowercase hex>",
        "signature": "<signature>"
      },
      "confirmationQuorum": {
        "requiredIndependentProviders": 2,
        "agreedIndependentProviders": 2,
        "minimumFinalizedSlot": 123456
      },
      "confirmedAt": "2026-07-31T12:00:00.000Z"
    },
    "availability": {
      "publicDerivative": "available"
    },
    "limitation": "Integrity commitments show that delivered bytes and canonical public metadata match the recorded commitment. They do not prove the real-world claim is true."
  }
}
```

The `bytes`, `metadata`, and `location` dimensions can independently be
`match`, `mismatch`, `unavailable`, `not_applicable`, or
`unknown_dependency_error`. A terminally removed record additionally permits
`bytes.status="unavailable_removed"` and
`location.status="historical_commitment_only"`; those values cannot be used for
a non-removed record. One dimension never converts another to pass.
`bytes` means the selected immutable version's approved public derivative
delivered by the media proxy and compared with its binding event's
`issue_evidence_hash` (and, for the current version, the matching
`IssueCommitment.evidence_hash`); it never means Solana account bytes.
`versionBinding.eventId` is the protocol-derived 32-byte ID in lowercase hex,
not the database UUID. The binding account is the immutable creation/metadata
event for the selected version. The issue account is the latest finalized
snapshot and may have a greater update count because of later lifecycle or
handoff events.

Chain status is `pending`, `blocked`, `dead_letter`, `confirmed`,
`mismatch`, or `unknown_dependency_error`. RPC errors are never interpreted as
account absence. `confirmed` requires at least two configured independently
operated providers to agree on pinned genesis, finalized signature, expected
program ownership, byte-identical immutable binding-event bytes, and the
reported finalized issue-account snapshot. Provider names/endpoints and
diagnostics remain restricted; disagreement or partial availability reports
`unknown_dependency_error` and cannot publish. v1 responses declare
`proofVersion: "v1_legacy"` and preserve historical meaning.

The verifier fetches only allowlisted public media and configured RPC hosts; it
cannot follow arbitrary URLs, redirects, internal IPs, or raw storage URLs.

## Public media

`GET /api/media/{opaqueMediaId}` is retained as the same-origin byte proxy.

- Public access requires an `approved_public` derivative attached to a
  published/current or superseded-public version.
- Private access requires matching tracking capability or operator role and
  `Cache-Control: no-store`.
- Unknown, denied, orphan, rejected, expired, removed, deleted, wrong-session,
  or cross-organization media returns neutral `404`.
- The route never accepts a storage path or URL and never redirects.
- Public responses use browser `max-age` no more than 60 seconds and
  shared-cache lifetime no more than 300 seconds with mandatory revalidation;
  `immutable` is forbidden. Removal revokes origin authorization
  transactionally and starts a monitored provider purge with a five-minute
  completion threshold.

## Operator moderation API

All routes require managed identity, active organization membership, role, and
AAL2.

### `POST /api/operator/uploads`

Stages purpose-bound private operator source media. Request field `purpose` is
`public_source_submission`, `correction_source`, `status_evidence_source`, or
`handoff_evidence_source`. It uses the same normalization limits, opaque IDs,
lifecycle authorization, and idempotency as public intake and additionally
binds organization, uploader, and exact purpose. Its transaction creates the
media row plus deterministic durable-private promotion operation and returns
`202 {mediaId,state:"promotion_pending"}`. It never returns a storage URL or
consumable receipt. The media is not reviewable until reconciliation verifies
the durable copy and changes it to `quarantined`.

`POST /api/operator/media/{mediaId}/decisions` requires AAL2 `moderator`,
idempotency, and exact expected media version/state. Its body is:

```json
{
  "schemaVersion": "private-media-decision-v1",
  "expected": {"version": 2, "state": "quarantined"},
  "decision": "approve_private",
  "reasonCode": "privacy_review_complete",
  "privateNote": null
}
```

`decision` is `approve_private` or `reject`. Approval changes only a
hash-verified `quarantined` source to `approved_private`; it returns no receipt
and never makes bytes public. Rejection requires a reviewed reason code and
denies origin access.

`POST /api/operator/media/{mediaId}/derivatives` requires an
`approved_private` source, AAL2 `moderator`, idempotency, exact expected media
version/state, and:

```json
{
  "schemaVersion": "public-derivative-v1",
  "expected": {"version": 3, "state": "approved_private"},
  "reviewDecision": "redact",
  "rectangles": [
    {"x":120,"y":80,"width":220,"height":140,"reasonCode":"personal_detail"}
  ],
  "privateNote": "Restricted review context."
}
```

`reviewDecision` is `no_redaction_required` with an empty array or `redact`
with 1-32 rectangles. Coordinates/dimensions are JSON integers, dimensions are
positive, and every source rectangle must be wholly inside the normalized
source. `reasonCode` is `face`, `license_plate`, `personal_detail`,
`private_document`, or `other_sensitive`. `privateNote` is null or 1-1000 code
points. The server applies exact `public-derivative-v1` from
`architecture-contract.md`, creates a distinct denied
`redacted_derivative` child row/object, and returns `201` with its opaque ID,
version, dimensions, MIME, byte length, and SHA-256 but no storage URL.

`POST /api/operator/media/{mediaId}/binding-receipts` requires AAL2
`moderator`, idempotency, exact expected media version/state, and:

```json
{
  "schemaVersion": "operator-media-binding-v1",
  "expected": {"version": 1, "state": "redacted_derivative"},
  "binding": {
    "purpose": "initial_publication",
    "targetType": "submission",
    "targetId": "submission-uuid"
  }
}
```

Binding purpose/subject state/target are exact:

| Purpose | Eligible media | Target |
|---|---|---|
| `public_source_submission` | `approved_private` source uploaded for that purpose | `targetType="new_public_source_submission"`, `targetId=null` |
| `initial_publication` | `redacted_derivative` | same-organization `submission` UUID |
| `correction_publication` | `redacted_derivative` | same-organization native-v2 `public_issue` UUID |
| `status_evidence` | `redacted_derivative` | same-organization native-v2 `public_issue` UUID |
| `handoff_evidence` | `redacted_derivative` | same-organization native-v2 `public_issue` UUID |

Success returns a deterministically replayable one-time
`nomr.1.<capability-uuid>.<secret>` receipt bound to media ID/version/hash,
organization, original uploader, binding purpose/target, issuance
idempotency UUID, and 24-hour expiry. Issuance does not change media state or
public access. The matching target transaction must lock and consume the
receipt; for derivative purposes it atomically changes the exact child to
`approved_public` and binds it to the version/event. Wrong actor, purpose,
target, organization, media version/state, replay, rejection, or expiry fails.
Issuance and consumption are audited.

### `GET /api/operator/moderation`

Returns a stable cursor queue of private review summaries. It never includes
raw tracking tokens, storage URLs, outbox payloads, or unrelated organization
rows.

### `GET /api/operator/moderation/{submissionId}`

Returns the assigned private revision, authorized media proxy IDs, validation
results, prior append-only decisions, and a server-generated public preview.
Response is `no-store`.

### `POST /api/operator/moderation/{submissionId}/decisions`

Idempotency and expected version are required.

Request:

```json
{
  "schemaVersion": "moderation-decision-v1",
  "decision": "approve",
  "expected": {"version": 2, "state": "under_review"},
  "reasonCode": "meets_pilot_policy",
  "privateNote": "Restricted operator note",
  "publicSafeMessage": null,
  "publicVersion": {
      "title": "Approved title",
      "narrative": "Approved narrative",
      "category": "water",
      "operatorMediaReceipt": "nomr.1.<capability-uuid>.<secret>",
      "locationPolicyVersion": "grid-0.01deg-v1",
    "provenance": {
      "kind": "community_report",
      "firstObservedOn": "2026-07-30",
      "receivedAt": "2026-07-31T11:30:00.000Z",
      "lastCheckedAt": "2026-07-31T12:00:00.000Z"
    }
  }
}
```

Allowed decisions are state-dependent:

- `start_review`
- `request_changes`
- `approve`
- `reject`
- `withdraw`
- `remove_publication` through the dedicated privacy/removal service

Approval returns `202` with non-public issue/version ID and publication
`commit_pending`. It does not return a public URL before finalized exact
binding.

Approval requires an unexpired `initial_publication` binding receipt targeting
that submission. Under the same transaction, the server locks/consumes it,
changes the exact derivative to `approved_public`, binds it to the frozen
version, derives its media ID/hash/dimensions into canonical metadata, freezes
the version, and creates the issue/checkpoint outbox. A caller-selected media
hash or storage key is never accepted.

The server validates the complete provenance object against the private source
record. A moderator correction to `firstObservedOn`, publisher, URL, or source
dates requires a private reason and becomes part of immutable decision/audit
history.

### `POST /api/operator/public-sources`

Auth: AAL2 `moderator`.  
Idempotency: required.

Request:

```json
{
  "schemaVersion": "public-source-intake-v1",
  "title": "Private review title",
  "description": "Private review narrative.",
  "category": "water",
  "operatorMediaReceipt": "nomr.1.<capability-uuid>.<secret>",
  "location": {
    "latitudeE6": 27700123,
    "longitudeE6": 85312345,
    "wardId": "configured-ward-id",
    "geometryVersion": "pilot-boundary-2026-01",
    "localityLabel": null
  },
  "provenance": {
    "kind": "public_source",
    "publisher": "Publisher name",
    "sourceUrl": "https://public.example/source",
    "sourcePublishedAt": "2026-07-30T06:00:00.000Z",
    "nextReviewAt": "2026-08-31T12:00:00.000Z"
  }
}
```

The request URL is an input, not committed provenance. Before the transaction,
the server uses the bounded egress broker to perform a credential-free `GET`
with fixed headers, no cookies, no ambient proxy credentials, strict TLS, a
10-second total deadline, at most three redirects, and 2 MiB limits on both
wire and transfer/content-decoded bytes. Every hop must be public HTTPS, use no
userinfo, resolve only to allowlisted public addresses (including
IPv4-mapped-IPv6 checks), pin the validated address for that connection, and
repeat DNS/redirect validation before the next hop. Redirects cannot downgrade
scheme or inherit authorization. The final response must be `2xx`; unsupported
content encodings, limit overruns, and truncated bodies fail closed.
`contentCheckedAt` and `statusUpdatedAt` are both the server time after the
successful initial fetch; initial status is `current`.

Canonical source URL serialization is exact:

1. parse with the WHATWG URL algorithm implemented by the pinned Node runtime;
2. require scheme `https`, empty username/password/fragment, and port absent or
   `443`;
3. serialize the IDNA ASCII hostname lowercase without a trailing dot, omit
   port `443`, use `/` for an empty path, and use the parser's resolved
   dot-segment/percent-encoding serialization;
4. preserve path case and query parameter order/duplicates; do not remove
   parameters; omit the fragment;
5. encode the resulting URL as UTF-8 and require at most 2048 bytes.

The committed `sourceUrl` is this canonical final URL, never the submitted or
intermediate URL. The fetch body used for checksum is the exact byte stream
after HTTP transfer/content decoding and before text decoding. Identity and
checksum are:

```text
sourceIdentity =
  SHA-256(
    ASCII("nagarik:public-source-identity:v1\0")
    || canonical_url_utf8_length_be_u32
    || canonical_url_utf8
  )

contentSha256 = SHA-256(decoded_response_body_bytes)
```

The response body is streamed through the checksum and discarded before the
request completes. It is never stored as source content; persistence is limited
to the checksum, canonical provenance, bounded redirect/status/content-type
metadata, validated address class, and timing needed for restricted fetch
audit.

Publisher is NFC-normalized, trimmed, internal whitespace collapsed to one
ASCII space, and 1-120 code points. `sourcePublishedAt` is a canonical
timestamp or JSON `null`; when non-null it must not follow server
`contentCheckedAt`. `nextReviewAt` must follow `statusUpdatedAt`.

The operator media receipt must be issued for
`public_source_submission` from an `approved_private` source. The transaction
consumes it, binds the source, creates a private
`public_source` submission in `under_review`, records canonical final URL,
`sourceIdentity`, `contentSha256`, redirect count, and fetch evidence, and
returns `202`. It does not publish or create a chain job.

The database has one source record per `sourceIdentity`. Same identity and
checksum with identical normalized provenance returns the existing logical
source under idempotency. Same identity/checksum with changed publisher/date
returns `409 source_metadata_conflict`. Same identity with a changed checksum
returns `409 source_revision_required`; the source-recheck route creates the
next immutable revision. Different submitted URLs that resolve to the same
canonical final URL are the same identity.

### `POST /api/operator/issues/{publicId}/source-rechecks`

Auth: AAL2 `moderator`; issue must be `public_source`.  
Idempotency and expected current version: required.

This route applies only to a native v2 issue. An imported v1 public ID returns
`409 legacy_read_only`; the service does not create a v2 wrapper, mutate the v1
program, or reinterpret its historical source binding.

Request supplies the source URL, source-published/review dates, a public-safe
recheck note, and optional complete corrected public fields/media/location
under the correction contract. The same fetch, final-URL normalization,
identity, and checksum algorithm runs again. Identity must match the current
source. On success, `contentCheckedAt=statusUpdatedAt` at the later server time
and a changed checksum creates a source revision. On a categorized fetch
failure, the prior canonical URL/identity, `contentSha256`, and
`contentCheckedAt` remain unchanged; `statusUpdatedAt` advances, status becomes
`unavailable`, and no failed-response body is retained. `nextReviewAt` must be
later than `statusUpdatedAt`. Status is `current`, `stale`, `unavailable`, or
`superseded`. A changed final identity requires separate new source intake and
explicit supersession rather than rewriting identity.

The service creates an immutable correction version with reason
`source_recheck` and mandatory `metadata_version_committed` outbox operation.
The prior version stays public until finalized. An application/egress
dependency failure that cannot establish a trustworthy source attempt creates
no version and never silently changes freshness; a categorized source
unavailability observation follows the explicit unavailable-version path
above.

A scheduled freshness service may perform only the deterministic
`current -> stale` transition when `nextReviewAt` is reached. It preserves
canonical source URL/identity, content hash/check time, publisher, and source
publication time; sets `statusUpdatedAt` to server time; sets the next bounded
retry time to no more than seven days later; freezes a complete immutable
metadata version; and uses the same FIFO checkpoint path. It cannot mark a
source current, unavailable, or superseded and cannot change civic content.

## Operator issue API

### `POST /api/operator/issues/{publicId}/corrections`

Auth: AAL2 `moderator` grant for the issue organization.  
Idempotency: required.  
Concurrency: exact current public version ID and version number required.

This route applies only to a native v2 issue. An imported v1 public ID returns
`409 legacy_read_only`; no v2 wrapper or v1 chain mutation is created.

Request:

```json
{
  "schemaVersion": "public-correction-v1",
  "expected": {
    "currentVersionId": "50cedad4-9610-4bee-a826-0257f4f3a8dc",
    "versionNumber": 1
  },
  "reasonCategory": "correction",
  "publicReason": "The approved location label was corrected after review.",
  "publicVersion": {
    "title": "Complete approved title",
    "narrative": "Complete approved narrative.",
    "category": "water",
    "ward": {
      "id": "configured-ward-id",
      "label": "Approved ward label",
      "geometryVersion": "pilot-boundary-2026-01"
    },
    "localityLabel": null,
    "location": {
      "mode": "retain"
    },
    "media": {
      "mode": "retain"
    },
    "provenance": {
      "kind": "community_report",
      "firstObservedOn": "2026-07-30",
      "receivedAt": "2026-07-31T11:30:00.000Z",
      "lastCheckedAt": "2026-08-02T09:00:00.000Z"
    }
  }
}
```

The request is a complete replacement public version, not JSON Patch.
`location.mode` is `retain` or `replace_from_reviewed_point`; replacement
requires operator-restricted integer `latE3`, `lngE3`, ward ID, and geometry
version, which the server validates and coarsens. `media.mode` is `retain` or
`replace`; replacement requires an unexpired
`correction_publication` binding receipt targeting this native-v2 issue.
Consumption atomically changes/binds the exact derivative to
`approved_public`; caller media hashes and storage keys are rejected. The two
accepted media objects are exactly `{"mode":"retain"}` and
`{"mode":"replace","operatorMediaReceipt":"nomr.1.<capability-uuid>.<secret>"}`.

The transaction freezes version `current + 1`, records the source-version
relation and correction reason, inserts a
`metadata_version_committed` outbox job, and returns:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "versionId": "new-version-uuid",
    "versionNumber": 2,
    "publication": "commit_pending",
    "checkpointState": "pending"
  }
}
```

The prior version remains current and public until the new exact binding is
finalized. Then the new version becomes current and the prior version becomes
`superseded` atomically. A failed/dead-lettered correction remains private and
does not alter the prior public projection. Public correction history exposes
version IDs, public reason category/text, and publication times only.

### `POST /api/operator/issues/{publicId}/status`

Auth: AAL2 `steward` for the issue organization.  
Idempotency: required.  
Unknown fields: rejected.

This route applies only to a native v2 issue. An imported v1 public ID returns
`409 legacy_read_only`; its historical v1 status is never advanced through the
v2 lifecycle.

Request:

```json
{
  "schemaVersion": "status-event-v2",
  "to": "in_progress",
  "expected": {
    "workflowVersion": 3,
    "workflowHead": "<64 lowercase hex>",
    "state": "open"
  },
  "reasonCode": "work_started",
  "publicNote": "A steward recorded that work has started.",
  "observedAt": "2026-07-31T11:45:00.000Z",
  "evidence": {
    "type": "operator_observation"
  },
  "disputedEventId": null,
  "disputeResolutionEventId": null,
  "closureDisposition": null
}
```

`workflowVersion` and `workflowHead` address the private lifecycle workflow
aggregate, including pending events; they are not the public Solana timeline
head. The server constructs canonical event bytes/hash and reserves the global
chain sequence plus both expected chain heads while holding the checkpoint
lock. No chain/proof input is accepted from the caller. The transaction appends
status/audit/outbox and returns durable `202` with
`checkpointState: "pending"`. The operator projection shows the pending event;
public lifecycle and timeline remain at the prior finalized head until
reconciliation finalizes it.

`reasonCode` is one of:

```text
work_started
progress_observed
resolution_evidence_reviewed
administrative_closure
duplicate_record
outside_pilot_scope
superseded_record
safety_restriction
dispute_opened
dispute_resolved
other_reviewed
```

`evidence` is exactly one discriminated object:

```json
{"type":"operator_observation"}
```

```json
{
  "type": "approved_public_media",
  "operatorMediaReceipt": "nomr.1.<capability-uuid>.<secret>"
}
```

```json
{
  "type": "reviewed_external_reference",
  "url": "https://public.example/reference",
  "publisher": "Approved publisher",
  "title": "Reference title"
}
```

`public_authority_notice` is represented by
`reviewed_external_reference` with explicit publisher provenance; it is not a
separate trust shortcut. Transition to `resolved` is allowed only from
`in_progress` or `disputed` and requires approved public media or a reviewed
external reference. None automatically proves truth.

For external reference input, the server runs the same bounded egress,
redirect, canonical-final-URL, and decoded-body checksum algorithm as public
source intake. Canonical event evidence replaces the input with final `url`,
normalized publisher/title, server `checkedAt`, and `contentSha256`. For
approved media input, `operatorMediaReceipt` must be an unexpired
`status_evidence` binding receipt targeting this issue. It is consumed,
atomically binds the derivative to the event as `approved_public`, and is
replaced with the server-derived public media ID and exact byte hash. Raw input
receipts and submitted URLs never enter canonical payloads.

When entering `disputed`, `disputedEventId` must identify the finalized public
event being disputed. When leaving `disputed`,
`disputeResolutionEventId` must identify the current dispute event.

When entering `closed`, `closureDisposition` is required and is one of:

```text
resolved_then_closed
administrative_unresolved
duplicate
outside_scope
superseded
```

`resolved_then_closed` is valid only from `resolved`; closing from `open` or
`in_progress` must use another disposition and cannot display as resolved.
`observedAt` is optional, cannot be more than five minutes in the future, and
cannot predate the current issue publication; `createdAt` is always server
transaction time.

An approved-media receipt is consumed atomically with idempotency, event,
projection, audit, and outbox. Public event DTO is:

```json
{
  "eventId": "event-uuid",
  "chainSequence": 4,
  "from": "open",
  "to": "in_progress",
  "reasonCode": "work_started",
  "publicNote": "A steward recorded that work has started.",
  "observedAt": "2026-07-31T11:45:00.000Z",
  "createdAt": "2026-07-31T12:00:00.000Z",
  "evidence": {"type":"operator_observation"},
  "checkpoint": {"state":"finalized","signature":"..."}
}
```

It excludes operator identity, internal notes, raw receipts, private reference
values, and storage URLs.

### `POST /api/operator/issues/{publicId}/handoffs`

Auth: AAL2 `steward`.  
Idempotency and expected private aggregate
`privateSequence`/`privateHead`/`activeCycleId`/`state`: required.  
Unknown fields: rejected.

This route applies only to a native v2 issue. An imported v1 public ID returns
`409 legacy_read_only`; no v2 handoff aggregate is synthesized for it.

Example `send` request:

```json
{
  "schemaVersion": "handoff-event-v2",
  "action": "send",
  "expected": {
    "privateSequence": 1,
    "privateHead": "<64 lowercase hex>",
    "activeCycleId": "95b4bf41-66bd-432e-a58c-57e11ded4377",
    "state": "prepared"
  },
  "publicNote": "The issue record was sent through the configured portal.",
  "occurredAt": "2026-07-31T11:55:00.000Z",
  "evidence": {
    "type": "portal_ticket_reference",
    "privateReference": "restricted full reference",
    "publicReference": "KMC-2026-123",
    "operatorMediaReceipt": null
  }
}
```

`action` is `prepare`, `send`, `acknowledge`, `close`, `fail`,
`supersede`, or `record_action`. Public canonical values map `send` to `sent`,
`acknowledge` to `acknowledged`, and `record_action` to `action_recorded`.

Every accepted private event increments the gapless aggregate `sequence` and
advances the private aggregate `head`, including `prepare` and `fail`.
Private sequence and `publicHandoffSequence` are capped at
`9007199254740991`; reaching the cap freezes further handoff writes for reviewed
migration rather than wrapping.
The request's `expected` object always addresses that issue-level private
aggregate. The first prepare uses sequence `0`, a zero head, null cycle/state;
preparing after `closed` or `failed` expects the prior cycle/state. `prepare`
generates a new server UUID `handoffCycleId`; every later event in that cycle
copies it. Only one cycle may be active at a time.

A separate gapless `publicHandoffSequence` is reserved in the mutation
transaction for an event that requires a public checkpoint, included in
canonical bytes, and becomes visible only after issue-global FIFO
finalization. A dead letter freezes the reservation and descendants; it cannot
create a skipped gap.

Action-specific fields are exact; fields not listed for an action are rejected:

| Action | Allowed aggregate state | Required semantic fields | Result |
|---|---|---|---|
| `prepare` | null, `closed`, or `failed` | `recipientClass`, `channel`, nullable `privateNote` | new cycle, state `prepared`, private only |
| `send` | `prepared` | nullable `publicNote`, `occurredAt`, dispatch `evidence` | state `sent`, public checkpoint |
| `acknowledge` | `sent` | nullable `publicNote`, `occurredAt`, recipient-generated acknowledgment `evidence` | state `acknowledged`, public checkpoint |
| `close` | `acknowledged` | nullable `publicNote`, `occurredAt`, `reasonCode` | state `closed`, public checkpoint with null evidence |
| `fail` | `prepared` or `sent` | `occurredAt`, `failureReasonCode`, `privateNote` | state `failed`, private only |
| `record_action` | `sent`, `acknowledged`, or `closed` | non-null `publicNote`, `occurredAt`, action `evidence` | state unchanged, public checkpoint |
| `supersede` | any existing aggregate state | `supersededEventId`, `correctionReasonCategory`, complete action-specific `replacement` | state unchanged; checkpoint iff target was public |

`recipientClass` and `channel` are accepted only on `prepare`; later actions
carry them from the active cycle. `privateNote` is null or 1-2000 code points
and never public. `failureReasonCode` is `delivery_failed`,
`recipient_unreachable`, `invalid_recipient`, `operator_cancelled`, or
`other_reviewed`.

Close `reasonCode` is `delivery_cycle_complete`, `recipient_closed_process`,
`superseded_process`, or `other_reviewed`. Acknowledgment evidence must be
recipient-generated; a platform or operator-generated value fails with `422
official_receipt_required`.

For `supersede`, the target event belongs to the same issue. `replacement`
uses the target's original action, cycle ID, and complete action-specific
schema; it cannot rewrite aggregate state. A public target produces a new
canonical event whose actual `handoffType` matches the replacement and whose
`supersededEventId` references the target. A private `prepared`/`failed` target
produces only a private correction event. There is no canonical `superseded`
handoff type. `correctionReasonCategory` is `incorrect_reference`,
`incorrect_recipient`, `incorrect_channel`, `incorrect_time`, or
`other_reviewed`.

Dispatch evidence types are `email_message_id`, `registered_mail_receipt`,
`portal_ticket_reference`, `physical_receipt_scan`, and
`other_reviewed_reference`. Acknowledgment evidence types are
`official_email_reply`, `portal_acknowledgment`, `signed_receipt`,
`authority_ticket_status`, and `other_reviewed_acknowledgment`. The
`other_reviewed_*` variants require a pre-existing active
`organization_evidence_type` policy created by an AAL2 org admin. That policy
defines stage (`dispatch` or `acknowledgment`), public-label/redaction rules,
and whether approved media is required. Free-form type names and per-event
ad-hoc approval are rejected.

`privateReference` remains operator restricted. `publicReference` is an
explicit reviewed projection and may be `null`; if null, the public evidence
object says `referenceWithheld: true` and does not publish or commit a
low-entropy private reference hash. `operatorMediaReceipt`, when present, must
be an unexpired `handoff_evidence` binding receipt targeting this issue. It is
consumed atomically and binds the exact derivative to the event as
`approved_public`.

The server transforms private input into the exact six-field
`publicEvidence` union in `protocol-v2-contract.md`, including paired public
media ID/hash and evidence-policy version. Raw/private receipt/reference
values are excluded before canonicalization.

`sent`, `acknowledged`, `closed`, and `action_recorded` return `202` with a
pending checkpoint and remain absent from the public handoff timeline until
finalized. `prepared` and `failed` are operator-only and return `201` without a
chain outbox job. `prepare` returns its new cycle ID; all later responses return
the active cycle ID. Superseding a previously public event returns `202` and
creates a checkpoint; superseding a private-only `prepared` or `failed` event
returns `201` and remains private. A public event remains current while its
replacement is pending or failed, then remains visible as superseded history
after the replacement finalizes.

Public handoff DTO is:

```json
{
  "eventId": "event-uuid",
  "chainSequence": 4,
  "issueVersionId": "9daef02a-7c24-4c60-8051-b45d2592564b",
  "handoffCycleId": "95b4bf41-66bd-432e-a58c-57e11ded4377",
  "publicHandoffSequence": 2,
  "handoffType": "sent",
  "recipientClass": "municipal_department",
  "channel": "portal",
  "publicNote": "The issue record was sent through the configured portal.",
  "occurredAt": "2026-07-31T11:55:00.000Z",
  "publicEvidence": {
    "type": "portal_ticket_reference",
    "publicReference": "KMC-2026-123",
    "referenceWithheld": false,
    "publicMediaId": null,
    "sha256": null,
    "evidencePolicyVersion": null
  },
  "reasonCode": null,
  "supersededEventId": null,
  "correctionReasonCategory": null,
  "checkpoint": {"state":"finalized","signature":"..."}
}
```

It excludes private references, raw receipt/media tokens, storage URLs,
operator identity, internal notes, and private aggregate sequence/head.

### `POST /api/operator/issues/{publicId}/removals`

Auth: AAL2 `privacy_reviewer` for the issue organization.  
Idempotency: required.  
Unknown fields: rejected.

```json
{
  "schemaVersion": "publication-removal-v1",
  "expected": {
    "publicVersionId": "version-uuid",
    "publicationState": "published",
    "overlayVersion": 1,
    "privacyRequestVersion": 4,
    "privacyRequestState": "in_review"
  },
  "privacyRequestId": "privacy-request-uuid",
  "reasonCategory": "privacy_safety",
  "privateReason": "Restricted decision basis."
}
```

`reasonCategory` is exactly `privacy_safety`, `legal_requirement`,
`outside_scope`, `duplicate`, `source_retracted`, `policy_violation`, or
`other_reviewed`. `privateReason` is 20-2000 code points and never public.
`privacyRequestId` must be a checked in-review request for the same
organization/issue with an eligible attributable removal decision.
The expected object addresses database publication, access-overlay, and privacy
workflow state only. The transaction locks those rows plus the issue checkpoint
row and derives the next global chain sequence and both prior chain heads
server-side.

A moderator may use only the separate case-escalation path and cannot restrict,
restore, or make the terminal privacy/removal decision. The dedicated
privacy-reviewer access-overlay route handles emergency restriction.

For a native v2 issue, the transaction generates the event UUID/time,
constructs the exact `nagarik-public-tombstone-v1` object and event from
`protocol-v2-contract.md`, computes both hashes, revokes issue/media origin
access, creates the neutral public tombstone, appends decision/audit/recovery
ledger entries, schedules retention and cache/edge purge, and reserves the
issue-global FIFO `publication_removed` checkpoint.

For an imported v1 issue, the same authorized privacy decision atomically
revokes issue/media origin access, creates the neutral public tombstone,
appends the decision/audit/recovery-ledger entries, and schedules retention and
cache/edge purge. It does not invoke v1, create a v2 issue or event account, or
reserve a chain sequence. No v2 wrapper is created implicitly. The historical
v1 account and proof binding remain read-only evidence of the record as it
existed before removal.

Success `202` is:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "publicId": "6f62862a-c3d3-4758-bd40-3012ab63ab86",
    "publicationState": "removed",
    "tombstoneVersion": "nagarik-public-tombstone-v1",
    "removedAt": "2026-08-04T12:00:00.000Z",
    "checkpoint": {
      "chainSequence": 5,
      "state": "pending"
    }
  }
}
```

The example above is the native v2 response. For an imported v1 issue,
`checkpoint` is exactly
`{"state":"not_applicable_v1_legacy"}`; it has no `chainSequence`. Every other
field in the response has the same meaning.

The removal does not promise erasure of an already public chain commitment.
Historical v2 event accounts and the current issue account can still expose
public program/account addresses, category/lifecycle discriminants, timestamps,
service-signer keys, and irreversible hashes/heads. The application does not
repeat removed civic text/media/location, but cannot erase those already-public
compact fields from Solana.

Native v2 removal also creates a deterministic `publication_removed` outbox
job. The tombstone is immediately public and origin media authorization is
revoked even while the checkpoint is pending or failed; proof reports that
checkpoint state without exposing removed content. Imported v1 removal creates
no chain outbox job and reports the removal checkpoint as
`not_applicable_v1_legacy`.

Every previously published removed ID returns the exact canonical tombstone
projection, never `404`. Its proof response reports
`bytes.status="unavailable_removed"`, `metadata.status="match"` against the
canonical tombstone hash, `location.status="historical_commitment_only"`
without serving content, `availability.publicDerivative="removed"`, and a
`removalCheckpoint`. For native v2, that checkpoint contains its
`chainSequence` and state `pending`, `blocked`, `dead_letter`, or `confirmed`.
It may expose public signatures/account/hash values but never removed fields,
media bytes, private reason, requester, or operator. No API restores a terminal
removal.

For imported v1, the proof response instead keeps
`proofVersion: "v1_legacy"`, reports removal checkpoint
exactly as `{"state":"not_applicable_v1_legacy"}`, and preserves the immutable
historical v1 account binding while reporting the selected media/content as
removed and unavailable. It never claims an on-chain v1 removal or v2
migration.

## Administrative control plane

Administrative mutation routes are `no-store`, reject unknown fields, require
a UUIDv4 `Idempotency-Key`, AAL2, an active grant, and append-only audit.
Transitions or mutations of existing resources additionally require the exact
documented resource version; create commands use their documented parent
version where applicable. Organization routes derive the organization from the
active session; an organization ID in the body is rejected. Create responses
are `201`; accepted state transitions are `200`; stale state is `409`. List/read
routes use bounded cursor pagination.

| Route | Required role | Exact command |
|---|---|---|
| `POST /api/operator/admin/memberships` | `org_admin` | `{schemaVersion:"membership-create-v1", managedAuthSubject:<UUID>}` |
| `POST /api/operator/admin/memberships/{id}/transitions` | `org_admin` | `{schemaVersion:"membership-transition-v1", action:"activate"|"revoke", expectedVersion:<u32>, reasonCode:<enum>}` |
| `POST /api/operator/admin/role-grants` | `org_admin` | `{schemaVersion:"organization-role-grant-v1", membershipId:<UUID>, role:<organization-role>, expectedMembershipVersion:<u32>, reasonCode:<enum>}` |
| `POST /api/operator/admin/role-grants/{id}/revoke` | `org_admin` | `{schemaVersion:"organization-role-revoke-v1", expectedVersion:<u32>, reasonCode:<enum>}` |
| `POST /api/operator/admin/evidence-types` | `org_admin` | exact versioned evidence policy below |
| `POST /api/operator/admin/evidence-types/{id}/transitions` | `org_admin` | `{schemaVersion:"evidence-policy-transition-v1", action:"activate"|"deactivate", expectedVersion:<u32>, reasonCode:<enum>}` |
| `POST /api/operator/admin/pilot-policies` | `org_admin` | exact immutable pilot policy below |
| `POST /api/operator/admin/pilot-policies/{id}/transitions` | `org_admin` | `{schemaVersion:"pilot-policy-transition-v1", action:"activate"|"deactivate", expectedVersion:<u32>, reasonCode:<enum>}` |
| `POST /api/system/platform-role-grants` | `system_admin` | `{schemaVersion:"platform-role-grant-v1", managedAuthSubject:<UUID>, role:"system_admin", reasonCode:<enum>}` |
| `POST /api/system/platform-role-grants/{id}/revoke` | `system_admin` | `{schemaVersion:"platform-role-revoke-v1", expectedVersion:<u32>, reasonCode:<enum>}` |
| `POST /api/system/feature-switches/{name}` | `system_admin` | `{schemaVersion:"feature-switch-v1", action:"disable"|"clear_disable", expectedVersion:<u32>, policyVersion:<string>, reasonCode:<enum>}` |
| `POST /api/system/outbox/{jobId}/decisions` | `system_admin` | `{schemaVersion:"dead-letter-decision-v1", action:"retry_exact"|"acknowledge_freeze", expectedAttempt:<u32>, expectedState:"dead_letter", reasonCode:<enum>}` |
| `POST /api/system/reconciliation-runs` | `system_admin` | `{schemaVersion:"reconciliation-run-v1", mode:"dry_run"|"apply_safe", expectedPolicyVersion:<string>, reasonCode:<enum>}` |

Organization roles are exactly `moderator`, `steward`, `privacy_reviewer`,
`auditor`, and `org_admin`. Membership/role activation checks the managed-auth
subject exists. Grants are append-only; revocation creates a revocation event
and never deletes history. An actor cannot revoke their own currently used
grant, the last active `org_admin` in an organization, or the last active
`system_admin` platform grant.

Evidence policy creation is:

```json
{
  "schemaVersion": "organization-evidence-policy-v1",
  "stage": "dispatch",
  "code": "other_reviewed_reference",
  "publicLabel": "Reviewed reference",
  "publicReferenceMode": "optional_redacted",
  "requiresApprovedMedia": false,
  "reasonCode": "partner_policy"
}
```

`stage` is `dispatch` or `acknowledgment`; `code` must be the matching frozen
`other_reviewed_*` code. `publicReferenceMode` is `withheld`,
`optional_redacted`, or `required_redacted`. A changed policy creates a new
immutable policy version; events retain the version they used.

Pilot policy creation is:

```json
{
  "schemaVersion": "pilot-policy-v1",
  "policyVersion": "pilot-boundary-2026-01",
  "geometryArtifactId": "geometry-artifact-uuid",
  "geometrySha256": "<64 lowercase hex>",
  "allowedCategoryIds": [
    "road",
    "waste",
    "water",
    "electricity_lighting",
    "public_facility",
    "public_safety_hazard",
    "other_public_infrastructure"
  ],
  "intakeOpensAt": "2026-08-01T00:00:00.000Z",
  "intakeClosesAt": "2026-09-01T00:00:00.000Z",
  "legalApprovalArtifactId": "restricted-artifact-id"
}
```

The geometry artifact must already be reviewed/checksummed. Live intake cannot
activate unless the restricted `EXT-003` artifact is valid/current. Policy
versions are immutable; activation/deactivation is a separate expected-version
transition.

Feature names are exactly the seven ceilings in ADR 0007. Database rows begin
disabled and cannot enable beyond static release configuration. Public-read or
public-media changes also execute the independent edge-deny and purge
operation; `clear_disable` succeeds only after dependency guards and edge
acknowledgment. Missing/unreadable state remains disabled.

`retry_exact` changes only scheduling/lease state. It cannot change the
operation payload, event ID, sequence, expected heads/count, predecessor, or
signer policy. `acknowledge_freeze` records incident ownership while keeping
the issue and every descendant checkpoint frozen. No API can skip, cancel,
rebase, or reorder a dead-lettered chain operation.

### Bootstrap and lockout recovery

There is no public/runtime bootstrap endpoint. An offline, non-deployed
`admin:bootstrap` provisioning command runs with a direct database-owner
credential and a reviewed JSON manifest containing one managed-auth subject,
one organization, one membership, one `org_admin` grant, and one
`system_admin` grant. Its serializable transaction succeeds only when the
singleton bootstrap row is incomplete and all five target tables are empty,
then stores the manifest SHA-256, actor/correlation data, and completion time.
It can never run twice.

An offline `admin:recover-access` command is the sole lockout path. It requires
database-owner access, a two-person approved recovery artifact, an exact
currently locked-out scope, and a named managed-auth subject. It can add only
one `org_admin` or `system_admin` grant, never read civic content or change a
workflow/feature/outbox state, and appends an independently exported recovery
audit record. Both commands fail if invoked by the application service role,
are excluded from deployment artifacts, and are exercised in an isolated
tabletop.

## Internal worker APIs

Internal endpoints are not browser APIs.

Manual `POST` calls require the dedicated worker bearer and the exact
`X-Nagarik-Worker-Audience` documented below. They accept no query parameters.
Registered schedules use a bodyless `GET` alias, the separate `CRON_SECRET`
bearer, and the exact route path. Vercel identifies itself with
`vercel-cron/1.0`. The reviewed external scheduler identifies itself with
`nagarik-scheduler/1.0` and
`X-Nagarik-Scheduler: cloudflare-cron-v1`. A scheduled alias has fixed
server-side behavior and accepts no caller-selected limit, mode, account, hash,
or signer input.

### `POST /api/internal/outbox/process`

- machine auth and audience required;
- audience: `nagarik-worker/outbox-process/v1`;
- exact body `{"schemaVersion":"outbox-process-v1"}`; unknown fields rejected;
- bounded batch, lease duration, operation allowlist, and time budget;
- duplicate invocation is safe;
- response exposes only aggregate counts and request ID;
- detailed results remain in restricted diagnostics.

### `POST /api/internal/reconcile`

- machine auth and exact body `{"schemaVersion":"reconcile-worker-v1"}`;
- audience: `nagarik-worker/reconcile/v1`;
- processes only an existing typed reconciliation run or the server's scheduled
  dry run; it accepts no mode, job, account, hash, program, or signer selector;
- bounded deterministic binding checks;
- no account creation when RPC returns error/timeout;
- `apply_safe` actions require the system-admin-created run, matching policy
  version, explicit typed allowlist, and audit.

### `POST /api/internal/retention`

- machine auth and exact body `{"schemaVersion":"retention-worker-v1"}`;
- audience: `nagarik-worker/retention/v1`;
- bounded expiry/deletion batch;
- legal hold and current lifecycle checked;
- storage deletion and DB state converge through retryable intent;
- repeated invocation is safe;
- typed policy uses the exact maximums in `data-classification.md`;
- configuration may shorten but cannot extend a maximum;
- policy/version mismatch makes readiness false and performs no deletion.

The scheduled reconciliation alias is dry-run only. A safe repair remains a
separate system-admin-created, version-bound reconciliation run; adding a query
parameter cannot turn the scheduled route into an apply operation.

## Health API

### `GET /api/health/live`

Public. Returns only process liveness:

```json
{"ok":true,"requestId":"req_...","data":{"status":"live"}}
```

### `GET /api/health/ready`

Public minimal readiness:

```json
{
  "ok": true,
  "requestId": "req_...",
  "data": {
    "status": "ready",
    "releaseId": "immutable-release-id"
  }
}
```

When not ready, status is `503` with only a stable category. It does not reveal
which secret, dependency, path, account, or balance failed.

Authenticated diagnostics are a separate operator/system-admin route and may
show schema version, redacted dependency state, v1/v2 checks, backup evidence
age, worker backlog/dead letters, and signer circuit-breaker status.

## Legacy compatibility

Frozen v1 identity:

```text
program ID:
  76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY

baseline IDL SHA-256:
  776832A82DB6C76B8165614327D866C182E60FC2D121C9536410D016C032A61A
```

Wave 4 renames the generated artifact to `idl/nagarik_signal_v1.json` without
changing bytes and commits immutable fixtures under `tests/fixtures/v1/` for
one public issue/account, proof response, PDA vector, and safe legacy API DTO.

Exact route matrix:

| Route | Production behavior |
|---|---|
| `GET /api/reports` | v1 legacy public imported records only; existing envelope with safe `LegacyPublicIssue` DTO; limit 1-50 and numeric compatibility cursor; no samples |
| `GET /api/reports/{numericId}` | one reviewed v1 legacy public DTO, the canonical neutral tombstone if it was published then removed, or neutral `404` if unknown/never public |
| `GET /api/verify-proof/{numericId}` | versioned `v1_legacy` proof with independent bytes/metadata/chain/availability statuses and truth limitation; removed records preserve historical binding and report `not_applicable_v1_legacy` removal checkpoint |
| `GET /api/dashboard` | active exact aggregate over the approved v1/v2 public projection; not a legacy mutation |
| `GET /api/v2/issues*` | canonical union of native v2 and reviewed imported v1 records using UUID public IDs and explicit `workflowVersion` |
| `POST /api/operator/issues/{publicId}/removals` | authorized terminal privacy removal for native v2 and imported v1; v2 reserves the frozen removal checkpoint, while v1 creates the DB/public tombstone and media denial with `not_applicable_v1_legacy` and no chain mutation |
| native-v2 correction/status/handoff/source-recheck routes targeting imported v1 | `409 legacy_read_only`; no automatic v2 wrapper or v1 mutation |
| `/steward` | redirects to authenticated `/operator` entry without loading or serializing private data |
| `POST /api/upload` | `410 legacy_mutation_retired` |
| `POST /api/reports` | `410 legacy_mutation_retired` |
| `POST /api/reports/{id}/verify` | `410 legacy_mutation_retired` |
| `POST /api/reports/{id}/status` | `410 legacy_mutation_retired` |
| `POST /api/reports/{id}/moderation` | `410 legacy_mutation_retired` |
| `POST /api/reports/{id}/handoff` | `410 legacy_mutation_retired` |
| any mutation method on `/api/reindex` | `410 legacy_mutation_retired` |

The safe `LegacyPublicIssue` DTO contains:

```text
workflowVersion = "v1_legacy"
publicId (deterministic UUIDv5)
issueId (historical numeric ID)
approved title/description/category
approved ward/locality/coarse display location
record kind and public provenance
firstObservedAt/proofAnchoredAt
legacyStatus
legacySignalCount
signalMeaning = "legacy_session_signal_count_not_unique_people"
public media ID
safe v1 proof summary
safe historical timeline
```

It excludes reporter/session/wallet identifiers, raw verification rows,
moderation fields, private/exact location, raw media/storage URL, operator
identity, request events, and internal handoff/diagnostic data.

Legacy GET responses include `X-Nagarik-Contract: v1-legacy`,
`Deprecation: true`, and a `Link` to the corresponding v2 route. They use the
same bounded public cache policy as v2 and query only the imported public
database projection. No legacy read path initializes protocol state, funds a
wallet, writes JSON/DB, or performs a hidden chain mutation.

Example:

```json
{
  "ok": false,
  "requestId": "req_...",
  "error": {
    "code": "legacy_mutation_retired",
    "message": "This legacy write path is unavailable.",
    "retryable": false
  }
}
```

## Contract tests

Every endpoint requires:

- schema success and all validation failures;
- body/content-type/origin limits;
- idempotent replay and key/payload conflict;
- concurrent duplicate mutation;
- wrong/expired/revoked capability;
- unauthenticated, wrong role, wrong organization, and missing AAL2;
- stale expected version/head;
- sentinel private-field leak scan in body, headers, cache, logs, source maps,
  and analytics;
- dependency failure mapped to stable redacted errors;
- recovery after retry where applicable;
- assertions that no route directly invokes a v1/v2 chain mutation outside the
  worker boundary.
