# ADR 0006: Operator Identity, Roles, and Signer Custody

Status: accepted for implementation  
Date: 2026-07-31  
Decision owners: architecture, authorization, security  
External key-governance approval: blocked

## Context

The prototype asks a browser user to enter one shared steward secret. It cannot
attribute actions to an individual, scope access to an organization, revoke one
operator, enforce MFA, or separate moderation from system/signing authority.
Prototype session wallets also receive relayer funds and can mutate v1.

## Decision

Use managed Supabase Auth for individual human operators. The application
stores profiles and organization memberships, not password material. Every
privileged interactive request requires:

- valid current managed-auth session;
- Authenticator Assurance Level 2 using approved TOTP MFA for the pilot;
- active profile and organization membership;
- exact action role;
- organization/resource scope;
- expected aggregate version/head;
- immutable actor/request audit context.

Roles do not inherit automatically:

| Role | Scope | Core responsibility |
|---|---|---|
| `moderator` | organization | private intake/media review, changes, approval, rejection, redaction |
| `steward` | organization | published lifecycle and evidence-bearing handoff events |
| `auditor` | organization | read-only restricted audit/reconciliation evidence |
| `privacy_reviewer` | organization | privacy verification/decision, emergency restriction, export, removal/tombstone |
| `org_admin` | organization | membership, role grants, invitations, pilot policy, preapproved evidence types; no content decision by default |
| `system_admin` | platform | feature flags, diagnostics, dead letters, incident controls; no automatic private civic-content access |
| `service_worker` | deployment/machine | predefined outbox, reconciliation, and retention operations only |

`organization_memberships` has one lifecycle row per user/organization.
`organization_role_grants` stores separate append-only role grants/revocations,
so a user may hold multiple explicit grants without an array/bitset rewrite.
Global platform grants and machine identities use separate tables. Every action
checks the specific grant. Revocation is immediate for new requests and
recorded append-only.

The exhaustive action matrix in
`docs/production/architecture-contract.md` is part of this decision.

### Machine and signer boundary

The chain signer is a server-only custody adapter. It accepts only an
already-authorized typed protocol job loaded from the durable outbox. It
enforces:

- deployment/profile, cluster, program ID, and authority;
- operation allowlist and canonical payload type/version;
- expected PDA/current state/update count and both timeline/handoff heads;
- compute, fee, spend, batch, and time bounds;
- simulation and finalized confirmation policy;
- pause/circuit breaker and telemetry.

The signer cannot accept arbitrary transaction bytes or caller-selected
accounts/hashes. Browser/session wallets are absent from v2 and receive no
funding.

Production/mainnet use requires human-reviewed secret storage, key rotation,
upgrade authority, quorum/multisig or equivalent controls, break-glass access,
and incident ownership. Until that evidence exists, mainnet configuration
fails closed.

## Invariants

- No shared operator secret is accepted by production routes.
- No raw auth token, MFA secret, service credential, or signer key is stored in
  application rows, client bundles, logs, or public diagnostics.
- Service role and worker credentials are server-only and least privilege.
- System administrators do not silently gain moderator/steward access.
- Organization administrators do not silently gain moderator, steward, or
  privacy-reviewer access.
- Cross-organization access is denied by service policy and RLS.
- Every privileged mutation is individually attributable and idempotent.
- A machine identity cannot make a civic moderation/lifecycle decision.
- Signer unavailability leaves durable intent pending; it does not bypass
  commitment requirements.

## Rejected alternatives

- **Single shared secret with better UI:** still lacks identity, revocation,
  MFA, scope, and attribution.
- **Wallet address as operator identity only:** does not supply organization
  membership, recovery, MFA policy, or application authorization.
- **One all-powerful service role:** expands compromise blast radius.
- **Signer inside public route:** reintroduces chain-first and arbitrary-input
  risk.
- **Browser-funded session wallets:** creates spending abuse and false identity
  semantics.

## Verification

- exhaustive role/action/organization/RLS negative matrix;
- missing/expired/revoked session and AAL1 versus AAL2 tests;
- old secret header/UI paths fail;
- audit actor/request attribution for every privileged action;
- client bundle/log/error scan for credentials;
- signer wrong-operation/program/cluster/PDA/state/fee/compute tests;
- worker/service cannot invoke civic decision functions;
- pause, revoke, rotation, and custody incident tabletop.

## Rollback

Disable operator mutations, worker, publication, and v2 writes independently.
Revoke affected membership/service grant, pause v2 where approved, and rotate
credentials under the incident runbook. Key-governance and tabletop evidence
remain external release gates.
