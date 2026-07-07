# Nagarik Signal — Master Architecture, Roadmap, and Execution Plan

**Project:** Nagarik Signal  
**Tagline:** Public proof for public problems.  
**Bounty target:** Superteam Nepal Solana bounty  
**Primary goal:** Build a polished, working Solana MVP that can win the bounty and continue into a serious civic-tech product.  
**Final positioning sentence:** **Janamat shows what citizens think. Nagarik Signal shows what citizens proved.**

---

## 0. Executive Decision

Build **Nagarik Signal**, not Pramaan, not FieldProof, not a voting app, and not a token/payment product.

Nagarik Signal is a **Solana-backed public proof layer for ignored civic issues in Nepal**. Citizens report public infrastructure problems, other citizens verify them, and every status update becomes a tamper-evident civic record. The product does not replace government complaint systems. It creates a public accountability layer that civic groups, journalists, NGOs, campuses, local communities, and eventually Janamat or municipalities can reference.

The strongest version of the idea is not:

> A complaint app on blockchain.

The strongest version is:

> A public memory layer that makes ignored civic issues impossible to quietly erase, rewrite, or deny.

The project wins only if the proof layer is the hero. The form, map, dashboard, and database exist to support the proof layer.

---

## 1. Core Thesis

Nepal already has complaint channels: government grievance systems, local ward offices, Facebook groups, Viber groups, municipal portals, civic apps, and public posts. The missing piece is not another place to complain. The missing piece is a public, tamper-evident record that proves:

1. An issue was reported.
2. Evidence existed at a specific time.
3. The reported location/category/status were committed to.
4. Other citizens verified the issue.
5. Status changes happened publicly.
6. Resolution proof was submitted, or the issue remained unresolved.
7. The number of days ignored can be independently checked.

Nagarik Signal turns civic issues into **public proof objects**.

A public proof object has:

- a stable public URL;
- a visible issue photo or sanitized evidence;
- safe public infrastructure category;
- approximate location;
- ward/locality;
- hash of evidence;
- hash of canonical metadata;
- on-chain Issue PDA;
- verification PDA records;
- tamper-evident status timeline;
- Solana transaction links;
- live proof verification button;
- “Observed for X days” / “Ignored for X days” counter;
- dashboard aggregation.

---

## 2. Winning Bounty Story

### 2.1 The 10-second story

> Civic complaints already exist. Public memory does not. Nagarik Signal anchors civic issue proof on Solana so ignored problems become publicly undeniable.

### 2.2 The 30-second story

> A citizen sees a broken drain, pothole, waste pile, or damaged public facility. They create a Signal with a photo, category, description, ward, and approximate location. Nagarik Signal hashes the evidence and metadata, creates a Solana proof record, lets other citizens verify it once, and tracks every status update publicly. The dashboard shows which wards/localities have unresolved issues and how long they have been ignored.

### 2.3 The 45-second judge pitch

> Nagarik Signal is a Solana-backed public accountability layer for civic issues in Nepal. Nepal already has complaint channels, Facebook groups, and local apps. The missing piece is public proof. Reports can be ignored, lost, or trapped inside closed systems. With Nagarik Signal, a citizen reports a public infrastructure issue, the evidence and metadata are hashed, and a proof record is created on Solana. Other citizens can verify it once, and stewards can update status with tamper-evident history. The emotional core is Days Ignored: every unresolved issue publicly shows how long it has remained unresolved, and the dashboard ranks wards/localities by ignored civic problems. No tokens, no payments, no rewards. Solana is used only for timestamped public proof. Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

### 2.4 The one line judges should remember

> This is the app that makes ignored civic issues impossible to hide.

---

## 3. What The Product Is and Is Not

| Nagarik Signal is | Nagarik Signal is not |
|---|---|
| A public proof layer for civic issues | Another complaint form |
| A tamper-evident civic memory system | A government complaint portal |
| A community verification layer | A legal complaint filing system |
| A ward/locality accountability dashboard | A social media complaint board |
| A Solana-backed proof and attestation MVP | A token/reward/payment app |
| A Janamat-adjacent civic data layer | A Janamat clone |
| A public-goods civic infrastructure project | A DAO, NFT marketplace, or wallet app |

The project must never be pitched as “we built a complaint app.” That phrasing weakens the project immediately.

The correct phrasing:

> We built a public proof layer for ignored civic issues.

---

## 4. Non-Negotiable Product Principles

1. **Proof is the product.** The report form is only the intake path.
2. **The issue page is the hero screen.** It must be stronger than the landing page.
3. **Days Ignored is the emotional hook.** It must appear on issue cards, issue pages, and dashboard.
4. **Solana must be visible.** Explorer links, ProofPanel, PDA data, and hash comparison must be present.
5. **No crypto-money.** No token rewards, payments, stablecoins, escrow, vouchers, remittance, betting, or prediction markets.
6. **No government dependency.** The MVP works for civic groups even if no ward office joins.
7. **No fake identity claims.** No claim of national identity, citizenship verification, zkID, or proof-of-personhood in MVP.
8. **Safety over virality.** Public infrastructure only. No personal accusations, faces, license plates, or private homes.
9. **Civic UX, not crypto UX.** Browsing should require no wallet. Civic session mode should exist. Wallet mode should be optional.
10. **Do not overbuild features that weaken clarity.** Coding may be fast with Codex, but trust, UX, story, moderation, and judge clarity are the real limits.

---

## 5. Final MVP Scope

The MVP must include the following 25 items:

1. Landing page.
2. Public issue feed.
3. Report issue flow.
4. Walletless/gasless civic session mode.
5. Optional wallet mode for crypto-native users and judges.
6. Photo upload.
7. EXIF stripping.
8. Metadata canonicalization.
9. Evidence hash.
10. Metadata hash.
11. Location commitment hash.
12. Solana Anchor program on devnet.
13. Issue PDA creation.
14. Verification PDA creation.
15. Duplicate verification prevention.
16. Reporter/session cannot verify own issue.
17. Steward status update.
18. StatusUpdate PDA.
19. Resolution proof upload.
20. Rolling timeline hash or status update chain.
21. Public issue page.
22. ProofPanel with live on-chain verification.
23. Dashboard with ward/locality leaderboard.
24. Days Observed / Days Ignored counter.
25. Seeded safe demo data.

If a feature does not strengthen these 25 items, it should be pushed to roadmap.

---

## 6. Features Explicitly Not Built in MVP

| Feature | Decision | Reason |
|---|---|---|
| Real-money payments | Kill | Legal/regulatory risk and not needed. |
| Token rewards | Kill | Makes the project look crypto-gamified and distracts from civic proof. |
| Stablecoins/remittance | Kill | Wrong category and high legal risk in Nepal context. |
| Prediction markets | Kill | Disallowed and not aligned with civic proof. |
| DAO voting | Kill | Generic and confuses the Janamat differentiation. |
| Full zkID | Roadmap | Valuable later, but fake if rushed. |
| zkPassport | Roadmap | Too large and unnecessary for MVP proof. |
| Solana Attestation Service | Roadmap/optional v1.5 | Strong later, not needed to show proof now. |
| State compression | Roadmap | Great for 100k+ records, but plain PDAs are clearer for demo. |
| cNFT issue receipts | Roadmap/stretch | Can look gimmicky. Not core. |
| Token Extensions | Roadmap | Useful later for non-transferable civic credentials, not MVP. |
| Native mobile app | Roadmap | Responsive web is enough. |
| AI moderation | Roadmap | Manual steward + safe categories is clearer. |
| Open comments | Kill | Moderation and defamation risk. |
| Official government integration | Roadmap | Not needed and cannot be claimed honestly. |
| Exact GPS public display | Kill | Privacy risk. Use approximate map and location hash. |
| Personal allegations | Kill | Unsafe and off-mission. |

---

## 7. User Personas

### 7.1 Citizen reporter

A student, youth volunteer, civic-minded local, or resident who sees a public issue and wants proof that it exists.

Needs:

- fast mobile submission;
- no crypto confusion;
- confidence that the report is public;
- clear safety rules;
- shareable issue link.

### 7.2 Citizen verifier

Someone who has also seen the issue and wants to attest “I saw this too.”

Needs:

- one-click verification;
- no repeated gas/SOL setup;
- clear confirmation;
- proof that duplicate verification is blocked.

### 7.3 Community steward

A trusted project admin, civic club lead, campus moderator, or NGO volunteer who reviews reports and updates status.

Needs:

- queue of reports;
- safe content moderation;
- status update controls;
- resolution proof upload;
- audit trail.

### 7.4 Journalist/watchdog

Someone who wants dashboard evidence of ignored issues by ward/locality.

Needs:

- dashboard;
- filters;
- public links;
- exportable issue list;
- verifiable proof.

### 7.5 Judge

A Solana/Superteam judge checking if this is a real Solana project or just a Web2 app with a hash.

Needs:

- devnet program ID;
- Explorer links;
- live ProofPanel;
- account model;
- proof that Solana prevents duplicate verification;
- clear why-chain explanation.

---

## 8. Core User Flows

### 8.1 Browse without wallet

1. User opens landing page.
2. Sees hero: “Public proof for public problems.”
3. Sees live stats: issues proven, verified, unresolved, avg days ignored.
4. Opens dashboard or issue feed.
5. Clicks issue card.
6. Reads public issue page.
7. Opens ProofPanel.
8. Clicks Explorer link or Verify On-chain.
9. Can share issue URL.

Wallet is not required for browsing.

### 8.2 Report issue with civic session

1. User clicks “Report an issue.”
2. App shows safety modal:
   - public infrastructure only;
   - no faces;
   - no license plates;
   - no private homes;
   - no personal accusations;
   - not for emergencies;
   - not a legal complaint filing system.
3. User accepts.
4. User starts civic session:
   - continue with email, Google, or anonymous session;
   - app creates session identity;
   - backend relayer pays devnet fee.
5. User uploads photo.
6. App strips EXIF.
7. User selects category.
8. User enters short title and description.
9. User selects ward/locality.
10. User places approximate map pin.
11. App computes photo hash.
12. App builds canonical metadata JSON.
13. App computes metadata hash and location hash.
14. Review screen shows:
    - title;
    - category;
    - ward;
    - approximate location;
    - evidence hash;
    - metadata hash;
    - “This creates public proof on Solana devnet.”
15. User submits.
16. Backend sends Solana transaction.
17. UI shows progress:
    - uploading evidence;
    - hashing metadata;
    - anchoring proof;
    - confirming transaction;
    - indexing issue.
18. User lands on public issue page.
19. Issue page shows tx signature and proof status.

### 8.3 Report issue with connected wallet

1. User chooses “Use my wallet.”
2. Connects Phantom/Backpack.
3. Report flow is the same.
4. User signs transaction directly or backend sponsors fee depending on implementation.
5. Report PDA stores reporter wallet.
6. This mode is ideal for judge demo and crypto-native users.

### 8.4 Verify issue

1. User opens issue page.
2. Clicks “I saw this too.”
3. Uses civic session or connected wallet.
4. App checks basic conditions:
   - issue is open;
   - user/session is not reporter;
   - user/session has not verified before.
5. Solana program creates Verification PDA with seeds based on issue and verifier.
6. If duplicate, transaction fails at program level.
7. UI shows success and tx link.
8. Verification count increments.
9. If threshold reached, UI may mark status as community-verified or steward can update status.

### 8.5 Duplicate verification demo

1. Same user clicks “I saw this too” again.
2. Program rejects because Verification PDA already exists.
3. UI shows:
   - “Already verified. One verification per citizen/session per issue is enforced by the Solana program.”
4. This is a key technical demo moment.

### 8.6 Steward status update

1. Steward opens `/steward`.
2. Authenticates as steward.
3. Sees queue of submitted/verified issues.
4. Opens an issue.
5. Chooses new status:
   - submitted;
   - verified;
   - in progress;
   - resolved;
   - disputed;
   - rejected.
6. If resolved, steward uploads after-photo/resolution note.
7. App hashes resolution metadata.
8. Steward signs or backend uses steward key.
9. StatusUpdate PDA is created.
10. Issue timeline updates.
11. If resolved, Days Ignored freezes.

### 8.7 Judge verifies proof

1. Judge opens issue page.
2. Opens ProofPanel.
3. Clicks “Verify on-chain now.”
4. Browser/API fetches Issue PDA from Solana.
5. App recomputes metadata hash from displayed DB metadata.
6. App compares on-chain hash vs recomputed hash.
7. App displays:
   - green check if match;
   - red warning if mismatch;
   - account address;
   - tx signature;
   - timestamp;
   - verification count;
   - status.

This must be one of the most polished parts of the product.

---

## 9. Information Architecture / Screens

### 9.1 Landing page `/`

Purpose: explain the idea in 10 seconds and route to dashboard/report.

Sections:

1. Hero:
   - H1: “Public proof for public problems.”
   - Subhead: “Janamat shows what citizens think. Nagarik Signal shows what citizens proved.”
   - CTAs: Report an issue / View dashboard.
2. Live stat strip:
   - issues proven;
   - citizen verifications;
   - unresolved issues;
   - average days ignored.
3. Problem section:
   - “Complaints disappear. Proofs don’t.”
4. How it works:
   - Report;
   - Hash;
   - Anchor;
   - Verify;
   - Track.
5. Featured ignored issues.
6. Why blockchain, honestly.
7. Safety note.
8. Links: GitHub, demo video, program ID.

### 9.2 Report page `/report`

Purpose: create civic proof quickly.

Components:

- SafetyModal
- SessionChoice
- PhotoUpload
- CategoryPicker
- DescriptionField
- WardSelect
- ApproxLocationPicker
- ProofPreview
- SubmitProgress
- SuccessCard

### 9.3 Explore page `/explore`

Purpose: browse issues.

Features:

- map with coarse pins;
- list of issue cards;
- filters by status/category/ward;
- sort by most ignored, newest, most verified;
- search by title/ward.

### 9.4 Issue page `/issues/[id]`

Purpose: strongest screen.

Sections:

1. Header:
   - title;
   - status badge;
   - category;
   - ward/locality;
   - Days Observed/Ignored badge.
2. Evidence:
   - photo;
   - description;
   - approximate map.
3. ProofPanel:
   - Issue PDA;
   - metadata hash;
   - evidence hash;
   - location hash;
   - tx signatures;
   - Verify on-chain button;
   - match/mismatch result.
4. Verification panel:
   - count;
   - “I saw this too”;
   - duplicate message.
5. Status timeline:
   - submitted;
   - verified;
   - in progress;
   - resolved/disputed/rejected;
   - tx links for each.
6. Resolution proof if resolved.
7. Safety/disclaimer block.

### 9.5 Dashboard `/dashboard`

Purpose: second demo climax.

Sections:

- KPI cards;
- ward/locality leaderboard;
- category breakdown;
- most ignored issues;
- recent verifications;
- resolved-after proof examples.

### 9.6 Steward console `/steward`

Purpose: manage status updates safely.

Features:

- report queue;
- filters;
- issue detail preview;
- status update form;
- resolution proof upload;
- moderation controls;
- tx progress;
- audit trail.

### 9.7 About / docs page `/about`

Purpose: judge-friendly explanation.

Sections:

- What this is/is not;
- Why Solana;
- Competitor comparison;
- Safety and privacy;
- Roadmap.

---

## 10. Visual Design Direction

### 10.1 Visual identity

Tone: civic, serious, public-record, Nepali, trustworthy.  
Avoid: purple crypto gradients, cartoon NFTs, web3 icon spam, gambling/trading aesthetics.

Recommended design:

- Background: warm off-white / paper tone.
- Primary accent: Nepal-flag crimson or deep civic red.
- Secondary: dark navy/charcoal.
- Success: muted green.
- Warning/ignored: strong red/orange.
- Font: Inter for UI, Noto Sans Devanagari for Nepali text support.
- Use large monospace numbers for Days Ignored.

### 10.2 Core UI pattern

Every issue card should show:

```text
[Photo]
Road · Kathmandu Ward 10 · Verified
Broken drain near bus stop
Observed for 18 days
3 citizen verifications
Proof anchored on Solana
```

The proof language should be human-friendly:

- “Proof anchored” instead of “transaction created.”
- “Citizen verification” instead of “attestation PDA.”
- “Verify on-chain” only in proof panel.

---

## 11. Technical Stack

### 11.1 Final recommended stack

| Layer | Technology | Reason |
|---|---|---|
| On-chain program | Rust + Anchor | Real Solana program logic, PDAs, account constraints, IDL, judge credibility. |
| Frontend | Next.js + TypeScript | Fast polished app, SSR for public pages, API routes available. |
| Styling | Tailwind + shadcn/ui | Clean and fast UI. |
| Maps | MapLibre or Leaflet + OSM | Avoid paid map dependency for MVP. |
| Wallet | Solana Wallet Adapter | Optional wallet mode. |
| Civic session | App session + generated key/session identity + relayer | Walletless UX while preserving proof record. |
| Database | Supabase Postgres | Dashboard queries and read model. |
| Storage | Supabase Storage | Evidence/resolution images. |
| RPC | Helius devnet RPC + public fallback | Reliable demo. |
| Hashing | Web Crypto / Node crypto + canonical JSON | Stable proof hashes. |
| Hosting | Vercel + Supabase | Simple public demo. |
| Testing | Anchor TS tests + Playwright/Cypress light e2e | Contract lifecycle + demo stability. |

### 11.2 Why not Cloudflare D1/R2 for final version

Cloudflare is fine, but Supabase + Next.js is stronger for a polished Codex-built app:

- Postgres queries are easier for dashboard aggregation.
- Supabase Storage is straightforward.
- Next.js API routes reduce deployment friction.
- Solana signing and Anchor clients are simpler in Node runtime than edge runtime.
- Codex has strong patterns for Next.js + Supabase.

### 11.3 Why Rust/Anchor is required

A memo transaction with a hash would be faster but weaker. It would look like decorative blockchain use. Nagarik Signal needs custom program logic:

- Issue PDA creation;
- Verification PDA duplicate prevention;
- reporter/session cannot verify own issue;
- steward authorization;
- StatusUpdate PDA timeline;
- on-chain verification count;
- on-chain status;
- emitted events;
- IDL for client decoding.

Anchor gives typed accounts, PDA constraints, events, IDL, and strong developer ergonomics.

---

## 12. High-Level Architecture

```text
Citizen / Judge Browser
  |
  |  Next.js app
  |  - landing
  |  - report flow
  |  - explore
  |  - issue page
  |  - ProofPanel
  |  - dashboard
  |  - steward console
  |
  |---- Supabase Storage
  |       - sanitized evidence photos
  |       - resolution photos
  |
  |---- Next.js API routes
  |       - upload
  |       - reports
  |       - verification
  |       - status
  |       - dashboard
  |       - proof verification
  |       - reindex/cron
  |
  |---- Supabase Postgres
  |       - readable issue data
  |       - status timelines
  |       - verifications
  |       - dashboard cache
  |       - session identities
  |
  |---- Solana Devnet via Helius RPC
          - Anchor program
          - Registry PDA
          - Steward PDA
          - Issue PDA
          - Verification PDA
          - StatusUpdate PDA
```

### 12.1 Source of truth model

Solana is the **source of public proof**:

- issue creation proof;
- evidence hash;
- metadata hash;
- location hash;
- verification count;
- status;
- status update hashes;
- transaction history.

Database is the **read/display layer**:

- image URLs;
- descriptions;
- titles;
- ward text;
- map coordinates;
- dashboard aggregates;
- UI-friendly records.

The database can be rebuilt from the chain plus stored metadata. The issue page must prove whether the DB display matches Solana.

---

## 13. On-Chain / Off-Chain Data Split

| Data | On-chain? | Where | Reason |
|---|---:|---|---|
| Issue ID | Yes | Issue PDA | Public reference. |
| Reporter/session pubkey | Yes | Issue PDA | Accountability / duplicate prevention. |
| Category enum | Yes | Issue PDA | Small and important. |
| Current status | Yes | Issue PDA | Must be public proof. |
| Verification count | Yes | Issue PDA | Tamper-evident count. |
| Metadata hash | Yes | Issue PDA | Commits to full off-chain record. |
| Evidence hash | Yes | Issue PDA | Commits to image evidence. |
| Location hash | Yes | Issue PDA | Commits to approximate location without exact exposure. |
| First observed timestamp | Yes | Issue PDA | Supports observed/ignored counter. |
| Proof anchored timestamp | Yes | Issue PDA via Clock | Public chain timestamp. |
| Resolution hash | Yes | Issue PDA / StatusUpdate | Proof of resolution evidence. |
| Status update hash | Yes | StatusUpdate PDA | Tamper-evident timeline. |
| Images | No | Supabase Storage | Too expensive and privacy-sensitive for chain. |
| Full description | No | Postgres | UI/display. Hash committed on-chain. |
| Exact lat/lng | No | Postgres, possibly rounded | Privacy. |
| Ward text | No | Postgres/constants | Display, committed through metadata hash. |
| Comments | Not built | None | Moderation risk. |
| Dashboard stats | No | Computed from DB | Aggregation layer. |

---

## 14. Time Semantics: Days Observed vs Days Ignored

This is a critical trust detail.

Do not fake old Solana timestamps.

Use two time concepts:

### 14.1 First Observed

User-declared date/time when the issue was first noticed. This is included in metadata and committed on-chain via hash. It supports:

> Observed for 23 days.

### 14.2 Proof Anchored

Actual Solana timestamp from program execution. It supports:

> Proof anchored 2 hours ago.

### 14.3 Days Ignored

For MVP, define it as:

> Days Ignored = days since first_observed_at while issue is unresolved, with first_observed_at committed to the on-chain metadata hash.

Display honestly:

```text
Observed for 23 days
Proof anchored on Solana today
```

or:

```text
Ignored for 23 days, based on first-observed date committed in proof metadata.
```

For actual post-MVP usage, after reports age naturally, Days Ignored can be based on proof anchored time or whichever civic policy the product defines.

---

## 15. Solana Program Design

Program name: `nagarik_signal`  
Cluster: Solana devnet for bounty  
Framework: Anchor  
Language: Rust

### 15.1 Accounts

#### Registry

Purpose:

- global config;
- authority;
- issue counter;
- steward management.

Seed:

```text
["registry"]
```

Fields:

```rust
pub struct Registry {
    pub authority: Pubkey,
    pub issue_count: u64,
    pub created_at: i64,
    pub bump: u8,
}
```

#### Steward

Purpose:

- allowlist steward wallets/session pubkeys;
- only active stewards can update status.

Seed:

```text
["steward", wallet_pubkey]
```

Fields:

```rust
pub struct Steward {
    pub wallet: Pubkey,
    pub active: bool,
    pub created_at: i64,
    pub revoked_at: i64,
    pub bump: u8,
}
```

#### Issue

Purpose:

- core public proof object.

Seed:

```text
["issue", issue_id.to_le_bytes()]
```

Fields:

```rust
pub struct Issue {
    pub id: u64,
    pub reporter: Pubkey,
    pub category: u8,
    pub status: u8,
    pub first_observed_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub resolved_at: i64,
    pub metadata_hash: [u8; 32],
    pub evidence_hash: [u8; 32],
    pub location_hash: [u8; 32],
    pub verification_count: u32,
    pub update_count: u32,
    pub timeline_hash: [u8; 32],
    pub resolution_hash: [u8; 32],
    pub bump: u8,
}
```

#### Verification

Purpose:

- one verification per verifier per issue;
- duplicate prevention enforced by PDA.

Seed:

```text
["verification", issue_pda, verifier_pubkey]
```

Fields:

```rust
pub struct Verification {
    pub issue: Pubkey,
    pub verifier: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}
```

#### StatusUpdate

Purpose:

- tamper-evident timeline entry;
- one account per status update.

Seed:

```text
["status_update", issue_pda, seq.to_le_bytes()]
```

Fields:

```rust
pub struct StatusUpdate {
    pub issue: Pubkey,
    pub seq: u32,
    pub updater: Pubkey,
    pub old_status: u8,
    pub new_status: u8,
    pub proof_hash: [u8; 32],
    pub previous_timeline_hash: [u8; 32],
    pub new_timeline_hash: [u8; 32],
    pub created_at: i64,
    pub bump: u8,
}
```

### 15.2 Enums

#### Category enum

```text
0 = Road
1 = Waste
2 = Water
3 = ElectricityLighting
4 = PublicFacility
5 = PublicSafetyHazard
6 = OtherPublicInfrastructure
```

#### Status enum

```text
0 = Submitted
1 = Verified
2 = InProgress
3 = Resolved
4 = Disputed
5 = Rejected
```

### 15.3 Instructions

#### initialize_registry

Creates Registry PDA.

Rules:

- authority signs;
- issue_count starts at 0;
- created_at = current clock.

#### add_steward

Creates Steward PDA.

Rules:

- only registry authority;
- steward becomes active.

#### revoke_steward

Marks Steward inactive.

Rules:

- only registry authority;
- revoked_at set.

#### create_issue

Inputs:

```rust
issue_id: u64
category: u8
first_observed_at: i64
metadata_hash: [u8; 32]
evidence_hash: [u8; 32]
location_hash: [u8; 32]
```

Rules:

- `issue_id == registry.issue_count + 1`;
- category valid;
- hashes not zero;
- `first_observed_at <= now + 5 minutes`;
- `first_observed_at >= now - 180 days`;
- status = Submitted;
- registry issue_count increments;
- timeline_hash initialized from issue fields.

Effects:

- creates Issue PDA;
- emits IssueCreated event.

#### verify_issue

Inputs:

```rust
issue_id: u64
```

Rules:

- verifier signs or relayed session signer signs;
- verifier cannot equal reporter;
- Verification PDA must not already exist;
- issue status must not be Resolved or Rejected;
- increments verification_count;
- optionally if status Submitted and verification_count >= threshold, status becomes Verified.

Effects:

- creates Verification PDA;
- increments issue verification_count;
- emits IssueVerified event.

#### update_status

Inputs:

```rust
seq: u32
new_status: u8
proof_hash: [u8; 32]
```

Rules:

- signer must be active steward;
- seq must equal issue.update_count + 1;
- new_status valid;
- proof_hash non-zero;
- if status Resolved, resolution proof required;
- if status Resolved, resolved_at set;
- updates timeline_hash.

Effects:

- creates StatusUpdate PDA;
- updates Issue status;
- increments update_count;
- emits StatusUpdated event.

#### submit_resolution

Can be separate or merged into update_status.

Recommendation:

- implement resolution as `update_status(new_status=Resolved, proof_hash=resolution_metadata_hash)`;
- store resolution_hash on Issue.

### 15.4 Program errors

```rust
pub enum ErrorCode {
    InvalidCategory,
    InvalidStatus,
    InvalidHash,
    InvalidObservedDate,
    UnauthorizedSteward,
    StewardInactive,
    DuplicateVerification,
    SelfVerificationNotAllowed,
    IssueClosed,
    InvalidSequence,
    ResolutionProofRequired,
    ArithmeticOverflow,
}
```

### 15.5 Events

```rust
IssueCreated {
    issue: Pubkey,
    issue_id: u64,
    reporter: Pubkey,
    category: u8,
    created_at: i64,
}

IssueVerified {
    issue: Pubkey,
    verifier: Pubkey,
    verification_count: u32,
    created_at: i64,
}

StatusUpdated {
    issue: Pubkey,
    updater: Pubkey,
    old_status: u8,
    new_status: u8,
    seq: u32,
    created_at: i64,
}
```

---

## 16. Wallet / Onboarding Model

### 16.1 Final decision

Use **hybrid wallet/session onboarding**.

The MVP must support:

1. **Gasless civic session mode** for normal users.
2. **Optional wallet mode** for judges and crypto-native users.

### 16.2 Why not pure wallet mode

Pure wallet mode makes the app feel like a crypto app. That weakens civic adoption and demo clarity.

Problems:

- user needs Phantom/Backpack;
- devnet SOL confusion;
- signing popups distract from civic story;
- non-crypto judges/users see friction.

### 16.3 Why not pure relayer mode

Pure backend signing creates a centralization/trust question:

> If your server signs everything, what are citizens proving?

### 16.4 Hybrid solution

Normal user path:

- app creates civic session;
- user submits issue without managing SOL;
- backend relays transaction;
- session identity/verifier pubkey is recorded;
- proof goes on-chain.

Judge/crypto path:

- user connects wallet;
- user signs transaction;
- Verification PDA uses wallet pubkey;
- duplicate prevention is visibly wallet-based.

### 16.5 README framing

Use this wording:

> Nagarik Signal supports walletless civic sessions for accessibility and optional wallet mode for cryptographic self-custody. In both cases, Solana is used only for public proof, never money movement.

---

## 17. Metadata and Hashing Design

### 17.1 Evidence hash

The image file is hashed after EXIF stripping and compression.

```text
evidence_hash = SHA256(sanitized_image_bytes)
```

### 17.2 Metadata JSON

Use canonical JSON to avoid hash mismatches.

Example:

```json
{
  "version": "1.0",
  "title": "Broken drain near bus stop",
  "description": "Drain cover is broken and water is overflowing near the public bus stop.",
  "category": "water",
  "wardId": "kathmandu-10",
  "locality": "Kathmandu Ward 10",
  "approxLocation": {
    "latRounded": 27.700,
    "lngRounded": 85.300
  },
  "geohashPrecision": 6,
  "firstObservedAt": "2026-07-01T10:15:00+05:45",
  "photoHash": "...",
  "photoUrl": "https://...",
  "safetyDeclaration": true
}
```

### 17.3 Metadata hash

```text
metadata_hash = SHA256(canonicalize(metadata_json))
```

### 17.4 Location hash

```text
location_hash = SHA256(ward_id + geohash + salt_or_version)
```

Use rounded/approximate location for display. Do not publish exact coordinates on-chain.

### 17.5 ProofPanel verification

ProofPanel must:

1. Fetch DB metadata.
2. Canonicalize metadata.
3. Recompute metadata hash.
4. Fetch Issue PDA from Solana.
5. Compare DB-derived hash with on-chain hash.
6. Compare evidence hash.
7. Show green match or red mismatch.

---

## 18. Database Design

Use Supabase Postgres.

### 18.1 `issues`

```sql
create table issues (
  id bigserial primary key,
  issue_id bigint unique not null,
  issue_pda text unique not null,
  reporter_pubkey text not null,
  reporter_mode text not null check (reporter_mode in ('session', 'wallet')),
  title text not null,
  description text not null,
  category text not null,
  ward_id text not null,
  locality text not null,
  lat_display numeric,
  lng_display numeric,
  geohash text,
  first_observed_at timestamptz not null,
  proof_anchored_at timestamptz,
  status text not null default 'submitted',
  verification_count integer not null default 0,
  update_count integer not null default 0,
  evidence_hash text not null,
  metadata_hash text not null,
  location_hash text not null,
  photo_url text not null,
  resolution_hash text,
  resolution_photo_url text,
  create_tx_sig text,
  latest_tx_sig text,
  safety_review_status text not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 18.2 `verifications`

```sql
create table verifications (
  id bigserial primary key,
  issue_id bigint not null references issues(issue_id),
  verifier_pubkey text not null,
  verifier_mode text not null check (verifier_mode in ('session', 'wallet')),
  verification_pda text unique not null,
  tx_sig text not null,
  created_at timestamptz not null default now(),
  unique(issue_id, verifier_pubkey)
);
```

### 18.3 `status_updates`

```sql
create table status_updates (
  id bigserial primary key,
  issue_id bigint not null references issues(issue_id),
  seq integer not null,
  updater_pubkey text not null,
  old_status text not null,
  new_status text not null,
  proof_hash text not null,
  previous_timeline_hash text,
  new_timeline_hash text,
  status_update_pda text unique not null,
  tx_sig text not null,
  note text,
  proof_photo_url text,
  created_at timestamptz not null default now(),
  unique(issue_id, seq)
);
```

### 18.4 `sessions`

```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  session_pubkey text unique not null,
  session_hash text not null,
  display_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
```

### 18.5 `stewards`

```sql
create table stewards (
  id bigserial primary key,
  wallet_pubkey text unique not null,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
```

### 18.6 Dashboard view

```sql
create view dashboard_issue_stats as
select
  count(*) as total_issues,
  count(*) filter (where status not in ('resolved', 'rejected')) as unresolved_issues,
  count(*) filter (where status = 'resolved') as resolved_issues,
  count(*) filter (where status = 'verified') as verified_issues,
  avg(extract(epoch from (coalesce(proof_anchored_at, now()) - first_observed_at)) / 86400)
    filter (where status not in ('resolved', 'rejected')) as avg_days_observed_unresolved
from issues
where safety_review_status = 'visible';
```

### 18.7 Ward leaderboard query

```sql
select
  ward_id,
  locality,
  count(*) filter (where status not in ('resolved', 'rejected')) as unresolved_count,
  count(*) as total_count,
  avg(extract(epoch from (now() - first_observed_at)) / 86400)
    filter (where status not in ('resolved', 'rejected')) as avg_days_ignored
from issues
where safety_review_status = 'visible'
group by ward_id, locality
order by avg_days_ignored desc, unresolved_count desc
limit 10;
```

---

## 19. Backend API Design

### 19.1 `POST /api/upload`

Purpose:

- validate image type/size;
- strip EXIF;
- compress image;
- compute evidence hash;
- upload to storage;
- return `photo_url` and `evidence_hash`.

Input:

- file.

Output:

```json
{
  "photoUrl": "...",
  "evidenceHash": "..."
}
```

### 19.2 `POST /api/reports`

Purpose:

- validate report form;
- canonicalize metadata;
- compute metadata/location hashes;
- create Issue PDA transaction;
- insert DB row after confirmation.

Input:

```json
{
  "sessionOrWallet": "...",
  "title": "...",
  "description": "...",
  "category": "water",
  "wardId": "kathmandu-10",
  "locality": "Kathmandu Ward 10",
  "latDisplay": 27.70,
  "lngDisplay": 85.30,
  "geohash": "...",
  "firstObservedAt": "...",
  "photoUrl": "...",
  "evidenceHash": "..."
}
```

Output:

```json
{
  "issueId": 1,
  "issuePda": "...",
  "txSig": "...",
  "metadataHash": "...",
  "url": "/issues/1"
}
```

### 19.3 `GET /api/reports`

Filters:

- ward;
- category;
- status;
- sort;
- limit;
- cursor.

### 19.4 `GET /api/reports/[id]`

Returns full issue detail:

- issue fields;
- verifications;
- timeline;
- computed days observed/ignored;
- proof data.

### 19.5 `POST /api/reports/[id]/verify`

Purpose:

- create Verification PDA;
- prevent duplicates;
- update DB after confirmation.

### 19.6 `POST /api/reports/[id]/status`

Purpose:

- steward-only status update;
- resolution proof if needed;
- create StatusUpdate PDA;
- update DB.

### 19.7 `GET /api/dashboard`

Returns:

- KPIs;
- ward leaderboard;
- category breakdown;
- most ignored issues;
- recent resolved issues.

### 19.8 `GET /api/verify-proof/[id]`

Purpose:

- fetch Issue PDA from Solana;
- recompute metadata hash;
- compare with on-chain values;
- return match result.

Output:

```json
{
  "matches": true,
  "issuePda": "...",
  "onChain": {
    "metadataHash": "...",
    "evidenceHash": "...",
    "status": "verified",
    "verificationCount": 3
  },
  "computed": {
    "metadataHash": "...",
    "evidenceHash": "..."
  },
  "explorerUrl": "..."
}
```

### 19.9 `GET /api/health`

Returns:

- app status;
- RPC status;
- relayer balance;
- DB status;
- program ID;
- latest indexed issue.

This is useful before recording demo.

### 19.10 `POST /api/reindex`

Protected by secret.

Purpose:

- fetch program accounts;
- reconcile DB with chain;
- flag mismatches.

---

## 20. Frontend Components

### 20.1 `SafetyModal`

Shows rules:

- public infrastructure only;
- no faces;
- no license plates;
- no private homes;
- no personal accusations;
- not for emergencies;
- reports become public proof.

### 20.2 `ReportForm`

Fields:

- title;
- description;
- category;
- first observed date;
- ward/locality;
- photo;
- approximate location.

### 20.3 `ProofPreview`

Before submission, show:

- evidence hash;
- metadata hash;
- location hash;
- “This creates public proof on Solana devnet.”

### 20.4 `SubmitProgress`

Steps:

- preparing evidence;
- uploading image;
- hashing metadata;
- sending Solana transaction;
- confirming proof;
- indexing record.

### 20.5 `IssueCard`

Shows:

- photo;
- category;
- ward;
- status;
- title;
- Days Observed/Ignored;
- verification count;
- proof anchored indicator.

### 20.6 `ProofPanel`

Most important technical component.

Shows:

- Issue PDA;
- metadata hash;
- evidence hash;
- location hash;
- transaction signatures;
- Verify on-chain button;
- match/mismatch result;
- raw proof JSON link.

### 20.7 `VerifyButton`

States:

- available;
- connecting session/wallet;
- verifying;
- success;
- already verified;
- reporter cannot verify own issue;
- issue closed.

### 20.8 `StatusTimeline`

Displays:

- submitted;
- verified;
- in progress;
- resolved/disputed/rejected;
- tx link for each event;
- hash for each status update.

### 20.9 `DaysIgnoredBadge`

Logic:

- unresolved: show “Observed for X days” / “Ignored for X days.”
- resolved: show “Resolved after X days.”
- new proof: show “Proof anchored today.”

### 20.10 `WardLeaderboard`

Shows:

- rank;
- ward/locality;
- unresolved count;
- average days ignored;
- most ignored issue.

---

## 21. File-by-File Implementation Plan

```text
nagarik-signal/
  README.md
  ARCHITECTURE.md
  ROADMAP.md
  DEMO_SCRIPT.md
  SAFETY.md
  .env.example
  package.json
  pnpm-workspace.yaml

  programs/
    nagarik_signal/
      Anchor.toml
      Cargo.toml
      programs/
        nagarik_signal/
          Cargo.toml
          src/
            lib.rs
            state.rs
            errors.rs
            events.rs
            instructions/
              mod.rs
              initialize_registry.rs
              add_steward.rs
              revoke_steward.rs
              create_issue.rs
              verify_issue.rs
              update_status.rs
      tests/
        nagarik_signal.ts

  apps/
    web/
      package.json
      next.config.ts
      tsconfig.json
      tailwind.config.ts
      app/
        layout.tsx
        page.tsx
        report/
          page.tsx
        explore/
          page.tsx
        dashboard/
          page.tsx
        issues/
          [id]/
            page.tsx
        steward/
          page.tsx
        api/
          upload/
            route.ts
          reports/
            route.ts
            [id]/
              route.ts
              verify/
                route.ts
              status/
                route.ts
          dashboard/
            route.ts
          verify-proof/
            [id]/
              route.ts
          health/
            route.ts
          reindex/
            route.ts
      components/
        SafetyModal.tsx
        ReportForm.tsx
        PhotoUpload.tsx
        CategoryPicker.tsx
        WardSelect.tsx
        ApproxLocationPicker.tsx
        ProofPreview.tsx
        SubmitProgress.tsx
        IssueCard.tsx
        IssueMap.tsx
        ProofPanel.tsx
        VerifyButton.tsx
        StatusTimeline.tsx
        DaysIgnoredBadge.tsx
        WardLeaderboard.tsx
        DashboardStats.tsx
        StewardStatusForm.tsx
        WalletButton.tsx
      lib/
        solana/
          connection.ts
          program.ts
          pda.ts
          instructions.ts
          explorer.ts
          idl.ts
        db/
          supabase.ts
          queries.ts
          schema.sql
        proof/
          canonicalize.ts
          hash.ts
          verifyProof.ts
          timelineHash.ts
        geo/
          geohash.ts
          wards.ts
        session/
          civicSession.ts
          walletMode.ts
        storage/
          upload.ts
          sanitizeImage.ts
        constants/
          categories.ts
          statuses.ts
          config.ts
        types.ts
      styles/
        globals.css

  scripts/
    deploy-devnet.sh
    seed-demo-data.ts
    create-stewards.ts
    reindex.ts
    verify-proof-cli.ts
    airdrop-relayer.ts

  docs/
    competitors.md
    why-solana.md
    privacy-and-safety.md
    demo-plan.md
    roadmap.md
    judge-faq.md
```

### 21.1 Key file responsibilities

#### `programs/nagarik_signal/src/lib.rs`

- declare program ID;
- register instructions;
- expose modules.

#### `state.rs`

- Registry;
- Steward;
- Issue;
- Verification;
- StatusUpdate;
- enums/constants.

#### `errors.rs`

- custom program errors.

#### `events.rs`

- IssueCreated;
- IssueVerified;
- StatusUpdated.

#### `create_issue.rs`

- validate hashes/category/date;
- create Issue PDA;
- increment registry;
- initialize timeline hash;
- emit event.

#### `verify_issue.rs`

- prevent self-verification;
- prevent duplicate using PDA;
- increment count;
- optionally status transition;
- emit event.

#### `update_status.rs`

- steward authorization;
- validate status transition;
- create StatusUpdate PDA;
- update timeline hash;
- update resolution fields if resolved.

#### `apps/web/lib/proof/hash.ts`

- stable SHA-256 helpers;
- browser + server compatibility;
- hex/base58 conversion.

#### `canonicalize.ts`

- deterministic JSON canonicalization;
- must be used everywhere to prevent mismatch.

#### `verifyProof.ts`

- fetch chain state;
- recompute DB metadata hash;
- compare;
- return detailed result.

#### `ProofPanel.tsx`

- visually show proof match;
- link to Explorer;
- show chain values.

#### `seed-demo-data.ts`

- create realistic safe issues;
- upload demo images;
- create chain accounts;
- verify some;
- update/resolved some.

---

## 22. Implementation Order

Because coding speed is not the limitation, build depth in the proof core first, then polish.

### Phase 1: Proof core

1. Anchor program accounts and instructions.
2. Program tests.
3. Devnet deploy.
4. TypeScript client.
5. Create issue script.
6. Verify issue script.
7. Update status script.
8. Proof read script.

### Phase 2: Data and API

1. Supabase schema.
2. Upload route.
3. Report creation API.
4. Verification API.
5. Status update API.
6. Dashboard API.
7. Verify-proof API.
8. Health API.

### Phase 3: Frontend

1. Landing.
2. Report flow.
3. Issue page.
4. ProofPanel.
5. Verify button.
6. Timeline.
7. Dashboard.
8. Steward console.
9. Explore page.

### Phase 4: Demo quality

1. Seed data.
2. Dashboard polish.
3. ProofPanel polish.
4. Duplicate verification demo.
5. Resolution demo.
6. README.
7. Landing copy.
8. Demo video.
9. Public posts.

---

## 23. Seven-Day Roadmap

### Day 1 — Foundation and Solana core

Goals:

- repo setup;
- product copy locked;
- Anchor program skeleton;
- account model implemented;
- tests start passing.

Tasks:

- create monorepo;
- write README skeleton;
- create Anchor program;
- implement Registry, Steward, Issue, Verification, StatusUpdate structs;
- implement initialize_registry;
- implement create_issue;
- implement verify_issue;
- write tests for create and verify;
- deploy to devnet if tests pass.

Deliverable:

- first Issue PDA created on devnet.

Public post:

> Building Nagarik Signal for Superteam Nepal. Not another complaint app. A public proof layer for ignored civic issues: report, verify, status timeline, days ignored, proof anchored on Solana.

### Day 2 — Status timeline, hashing, DB

Goals:

- status update logic;
- timeline hash;
- hashing system;
- Supabase schema.

Tasks:

- implement add_steward/revoke_steward;
- implement update_status;
- implement timeline hash logic;
- write full lifecycle tests;
- create Supabase tables;
- implement canonical metadata hashing;
- implement proof verification utility;
- create basic API routes.

Deliverable:

- create issue → verify → update status lifecycle works from script.

Public post:

> Each civic issue now has an Issue PDA, evidence hash, metadata hash, location commitment, verification count, and status updates. Solana is not decoration. It is the public timestamp and tamper-evident timeline.

### Day 3 — Report flow and issue page

Goals:

- user can create issue from web;
- issue page displays proof.

Tasks:

- build landing shell;
- build report form;
- build photo upload;
- build safety modal;
- build API report create route;
- connect create_report transaction;
- build issue page;
- build IssueCard;
- show tx link;
- show Days Observed/Ignored.

Deliverable:

- complete report → issue page flow.

Public post:

> First on-chain civic proof created from the web app. Photo → metadata hash → Anchor Issue PDA → public issue page with Explorer link.

### Day 4 — Verification, ProofPanel, dashboard

Goals:

- verification works;
- duplicate rejection demo works;
- ProofPanel works;
- dashboard starts showing stats.

Tasks:

- build verify button;
- build `/api/reports/[id]/verify`;
- show duplicate verification error;
- build ProofPanel;
- build verify-proof API;
- implement dashboard KPI cards;
- implement ward leaderboard;
- implement category breakdown.

Deliverable:

- judge can verify a proof live.

Public post:

> Shipped the most important technical moment: Verify on-chain. The app fetches the Solana account, recomputes the metadata hash, and proves the civic record matches the chain.

### Day 5 — Steward console and resolution proof

Goals:

- steward workflow works;
- resolution proof works;
- timeline is polished.

Tasks:

- build steward auth;
- build steward console;
- build status update form;
- build resolution upload;
- create StatusUpdate accounts;
- display timeline;
- show timeline tx links;
- freeze ignored counter when resolved;
- refine safety copy.

Deliverable:

- submitted → verified → in progress → resolved demo complete.

Public post:

> Civic proof should not stop at reporting. Today Nagarik Signal added resolution proof: before photo, after photo, status update, and public transaction trail.

### Day 6 — Demo data, polish, competitor README

Goals:

- app looks alive;
- README is serious;
- no empty dashboard.

Tasks:

- seed 30 safe reports;
- seed 10+ verifications;
- seed at least 2 resolved reports;
- seed 5 wards/localities;
- polish dashboard;
- write competitor comparison;
- write Why Blockchain Honestly table;
- write privacy/safety docs;
- test full demo route.

Deliverable:

- public demo feels real.

Public post:

> The most important UI in Nagarik Signal is not the form. It is this: “Ignored for 18 days.” The dashboard now shows which wards/localities have unresolved civic issues and how long they have been ignored.

### Day 7 — Submission package

Goals:

- final demo video;
- final README;
- final deployment;
- final public launch.

Tasks:

- run full test suite;
- run health endpoint;
- record demo video;
- edit under 3 minutes;
- deploy Vercel;
- verify all links;
- add screenshots;
- update README with program ID;
- publish launch thread;
- submit bounty.

Deliverable:

- live link, GitHub, demo video, program ID, public build posts.

Public post:

> Submitted Nagarik Signal to Superteam Nepal. Competitors collect complaints. Nagarik Signal creates public civic proof and an accountability timeline. Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

---

## 24. Hour-by-Hour Build Schedule

This assumes Codex can accelerate coding. The schedule prioritizes architecture dependencies, not human typing speed.

### Day 1

| Time | Task |
|---|---|
| 09:00–10:00 | Create repo, pnpm workspace, Anchor app, Next.js app, env files. |
| 10:00–11:00 | Finalize constants: categories, statuses, wards, safety copy. |
| 11:00–13:00 | Implement Anchor state structs and Registry/Issue accounts. |
| 13:00–14:00 | Implement create_issue instruction. |
| 14:00–15:00 | Implement verify_issue instruction and Verification PDA seeds. |
| 15:00–16:00 | Write Anchor tests for create + verify + duplicate failure. |
| 16:00–17:00 | Implement basic TypeScript client script. |
| 17:00–18:00 | Deploy to devnet and create first issue. |
| 18:00–19:00 | Write build log post and update README skeleton. |

### Day 2

| Time | Task |
|---|---|
| 09:00–10:00 | Implement Steward account and steward auth. |
| 10:00–12:00 | Implement update_status and StatusUpdate PDA. |
| 12:00–13:00 | Implement timeline hash logic. |
| 13:00–14:00 | Write full lifecycle tests. |
| 14:00–15:00 | Create Supabase schema. |
| 15:00–16:00 | Implement canonical JSON + SHA-256 helpers. |
| 16:00–17:00 | Implement proof verification helper. |
| 17:00–18:00 | Create API skeleton and DB client. |
| 18:00–19:00 | Re-run tests, update docs, public post. |

### Day 3

| Time | Task |
|---|---|
| 09:00–10:00 | Build layout, landing skeleton, design tokens. |
| 10:00–12:00 | Build ReportForm and SafetyModal. |
| 12:00–13:00 | Build upload route and image hash flow. |
| 13:00–14:00 | Build report creation API. |
| 14:00–15:00 | Connect frontend report flow to API/chain. |
| 15:00–16:00 | Build issue page and IssueCard. |
| 16:00–17:00 | Add Explorer links and DaysIgnoredBadge. |
| 17:00–18:00 | Run end-to-end report flow. |
| 18:00–19:00 | Polish copy, screenshots, public post. |

### Day 4

| Time | Task |
|---|---|
| 09:00–10:00 | Build VerifyButton UI and states. |
| 10:00–11:00 | Build verification API and transaction path. |
| 11:00–12:00 | Implement duplicate rejection UI. |
| 12:00–14:00 | Build ProofPanel and verify-proof route. |
| 14:00–15:00 | Build dashboard API. |
| 15:00–16:00 | Build dashboard KPI cards. |
| 16:00–17:00 | Build ward leaderboard. |
| 17:00–18:00 | Test judge flow: issue → verify → duplicate reject → ProofPanel. |
| 18:00–19:00 | Public post with ProofPanel screenshot. |

### Day 5

| Time | Task |
|---|---|
| 09:00–10:00 | Steward auth and steward route. |
| 10:00–12:00 | Steward console list/filters. |
| 12:00–13:00 | Status update API. |
| 13:00–14:00 | Resolution upload and hash flow. |
| 14:00–15:00 | StatusTimeline UI. |
| 15:00–16:00 | Freeze resolved ignored counter. |
| 16:00–17:00 | Test full status lifecycle. |
| 17:00–18:00 | Safety review pass. |
| 18:00–19:00 | Public post with before/after proof. |

### Day 6

| Time | Task |
|---|---|
| 09:00–10:00 | Prepare safe demo dataset. |
| 10:00–12:00 | Run seed script for 30 reports. |
| 12:00–13:00 | Seed verifications and status updates. |
| 13:00–14:00 | Polish dashboard and leaderboard. |
| 14:00–15:00 | Write competitor comparison. |
| 15:00–16:00 | Write Why Solana Honestly section. |
| 16:00–17:00 | Write privacy/safety docs. |
| 17:00–18:00 | Test all demo paths. |
| 18:00–19:00 | Public post with dashboard screenshot. |

### Day 7

| Time | Task |
|---|---|
| 09:00–10:00 | Final deployment and health check. |
| 10:00–11:00 | README final pass. |
| 11:00–12:00 | Record demo clips. |
| 12:00–13:00 | Edit 3-minute demo. |
| 13:00–14:00 | Add video and screenshots to README. |
| 14:00–15:00 | Test live links, Explorer links, ProofPanel. |
| 15:00–16:00 | Prepare submission text. |
| 16:00–17:00 | Publish launch post. |
| 17:00–18:00 | Submit bounty. |
| 18:00–19:00 | Backup video/repo/live link checklist. |

---

## 25. Demo Data Plan

### 25.1 Required numbers

Minimum:

- 30 issues;
- 5 wards/localities;
- 7–10 real/safe photos or carefully staged/synthetic infrastructure examples;
- 10+ verified issues;
- 2 resolved issues;
- 5 in progress;
- 10 unresolved;
- at least one issue with 3+ verifications;
- at least one duplicate verification rejection demo.

### 25.2 Safe categories only

- road;
- waste;
- water/drainage;
- electricity/streetlight;
- public facility;
- public safety hazard;
- other public infrastructure.

### 25.3 Forbidden demo data

Do not include:

- faces;
- license plates;
- private homes;
- personal disputes;
- political accusations;
- named officials;
- emergency situations;
- dangerous recording setups;
- sensitive locations.

### 25.4 Data labeling

Be honest:

- “Demo dataset” if synthetic.
- “Seeded public infrastructure examples” if staged.
- “Proof anchored on devnet” for chain data.

Do not claim official complaint status or real government response.

---

## 26. 3-Minute Demo Video Script

### 0:00–0:15 — Hook

Visual: dashboard first, not form.

Narration:

> Nepal does not lack complaint channels. The problem is public memory. If a broken drain, pothole, or waste issue is ignored for weeks, citizens need proof that it was reported, verified, and still unresolved.

### 0:15–0:25 — Positioning

Visual: landing page.

Narration:

> This is Nagarik Signal. Public proof for public problems. Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

### 0:25–0:55 — Create Signal

Visual: report flow.

Narration:

> I submit a public infrastructure issue. The app asks for a safe photo, category, ward, approximate location, and first observed date. It strips private metadata, builds a canonical record, hashes the evidence, and anchors the proof on Solana devnet.

Show:

- upload photo;
- privacy modal;
- category;
- ward;
- submit;
- transaction progress.

### 0:55–1:20 — Public issue page

Visual: issue page.

Narration:

> Every issue gets a public page. Photo, category, ward, observed days, verification count, evidence hash, metadata hash, and Solana transaction link. This is not just a database card. It is a public proof object.

Click Explorer link.

### 1:20–1:50 — Verification and duplicate rejection

Visual: second session verifies.

Narration:

> Another citizen can say: I saw this too. That creates a Verification PDA. The same citizen cannot verify twice because the Solana program rejects duplicate verification by design, not by database logic.

Show duplicate rejection.

### 1:50–2:15 — ProofPanel

Visual: click Verify On-chain.

Narration:

> The judge does not need to trust our database. ProofPanel fetches the on-chain Issue account, recomputes the metadata hash from the displayed record, and confirms that the civic record matches Solana proof.

Show green match.

### 2:15–2:40 — Steward update and dashboard

Visual: steward marks resolved or in progress, then dashboard.

Narration:

> A steward can update status with a resolution proof. Every update has its own transaction and timeline hash. The dashboard turns individual proof objects into public accountability data: unresolved issues, average days ignored, and ward/locality leaderboard.

### 2:40–3:00 — Close

Visual: logo + dashboard.

Narration:

> Competitors collect complaints. Nagarik Signal creates public civic proof. No tokens, no payments, no rewards. Solana is used only for timestamped public memory. Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

---

## 27. README Structure

```markdown
# Nagarik Signal — Public Proof for Public Problems

> Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

[Live Demo] · [Demo Video] · [Devnet Program] · [Explorer]

## Problem
Nepal already has complaint channels. The missing piece is public proof.

## What Nagarik Signal Does
Report → Hash → Anchor → Verify → Track → Resolve.

## What It Is / Is Not
Table.

## Why This Is Different
Competitor comparison: Hello Sarkar, FixMyStreet, SeeClickFix, Ushahidi, Janamat, Nagarik Signal.

## Why Solana, Honestly
Table: normal database vs Solana proof.

## Demo Flow
3-minute script and screenshots.

## Architecture
Diagram, stack, on-chain/off-chain split.

## Solana Program
Accounts, instructions, PDA seeds, events.

## How to Verify a Proof Yourself
CLI/browser instructions.

## Privacy and Safety
Rules and limitations.

## Local Setup
Commands.

## Deployment
Vercel, Supabase, devnet program.

## Roadmap
v0.1, v0.2, v1, v2.

## Known Limitations
Honest MVP limitations.

## Build Log
X/LinkedIn links.

## License
MIT.
```

### 27.1 Why Solana Honestly table

| Need | Normal database | Solana proof |
|---|---|---|
| Issue creation timestamp | Operator-controlled | Public transaction timestamp |
| Evidence commitment | Can be replaced silently | Hash committed on-chain |
| Duplicate verification | Database logic can be rewritten | Verification PDA prevents duplicates |
| Status timeline | Admin can edit history | StatusUpdate PDAs create audit trail |
| Days ignored | Trust the platform | Computable from committed timestamps |
| Public accountability | Platform-controlled | Publicly verifiable by anyone |

---

## 28. Competitor Comparison

| Competitor | What it does | Why it does not kill Nagarik Signal |
|---|---|---|
| Hello Sarkar | Government grievance intake and tracking | Nagarik Signal is not a replacement; it is a public proof layer civic groups can use. |
| FixMyStreet | Public issue reporting/routing | It proves the category, but Nagarik Signal adds Solana proof and tamper-evident accountability. |
| SeeClickFix | Municipal service request platform | Usually depends on municipal adoption; Nagarik Signal works for civic groups first. |
| Ushahidi | Crowdsourced mapping/crisis reports | Great mapping, less focused on on-chain proof/timeline verification. |
| Janamat | Verified civic opinion, polls, petitions | Complementary: Janamat shows opinion; Nagarik Signal shows evidence. |
| Facebook/Viber groups | Fast informal local reporting | Posts disappear and lack structured proof/timeline/dashboard. |

One-sentence wedge:

> Competitors collect and route complaints. Nagarik Signal creates public civic proof and an accountability timeline.

---

## 29. Landing Page Copy

### Hero

**Public proof for public problems.**

Subhead:

> Nagarik Signal turns ignored civic issues into tamper-evident public records on Solana.

Secondary line:

> Janamat shows what citizens think. Nagarik Signal shows what citizens proved.

Buttons:

- Report an issue
- View dashboard

### Problem section

**Complaints disappear. Proofs don’t.**

Copy:

> A broken drain, pothole, or waste issue can sit ignored for weeks. Someone may have reported it. But nobody knows when, where, who verified it, or whether the status changed. Nagarik Signal creates a public record that citizens can verify.

### How it works

1. Report public issue.
2. Evidence and metadata are hashed.
3. Proof is anchored on Solana.
4. Citizens verify.
5. Status timeline stays public.

### Proof, not payments

> No tokens. No rewards. No payments. Solana is used only for public proof.

### Safety

> Public infrastructure only. Approximate location. No private people. No personal accusations. Steward moderation.

---

## 30. Public Build-in-Public Posts

### Post 1 — Start

```text
Building Nagarik Signal for Superteam Nepal.

Not another complaint app.

A public proof layer for ignored civic issues:
- report civic issue
- citizens verify
- status timeline
- days ignored
- proof anchored on Solana

Public proof for public problems.
#Solana #SuperteamNepal
```

### Post 2 — Problem

```text
Nepal does not lack complaint channels.

The problem is public memory.

If a pothole, broken tap, or waste issue is ignored for 30 days, citizens need proof that:
1. it was reported
2. evidence existed
3. people verified it
4. status history did not disappear

That is Nagarik Signal.
```

### Post 3 — Solana proof

```text
Today I shipped the Solana proof layer for Nagarik Signal.

Each civic issue gets:
- Issue PDA
- metadata hash
- evidence hash
- location commitment
- verification count
- status updates

Solana is not decoration here. It is the public timestamp and tamper-evident timeline.
```

### Post 4 — Days Ignored

```text
The most important UI in Nagarik Signal is not the form.

It is this:

“Ignored for 18 days.”

A public dashboard showing which wards/localities have unresolved civic issues and how long they have been ignored.
```

### Post 5 — Safety

```text
Civic tech can create harm if designed badly.

Nagarik Signal MVP only supports public infrastructure categories:
- road
- waste
- water
- electricity/streetlights
- public facilities
- safety hazards

No personal accusations. No private homes. Approximate locations only.
```

### Post 6 — Demo

```text
Demo flow ready:

1. Create a civic Signal
2. Upload evidence
3. Hash metadata
4. Anchor proof on Solana devnet
5. Neighbor verifies
6. Duplicate verification fails on-chain
7. Steward updates status
8. Dashboard shows Days Ignored

Public proof for public problems.
```

### Post 7 — Submission

```text
Submitted Nagarik Signal to Superteam Nepal.

Competitors collect complaints.
Nagarik Signal creates public civic proof and an accountability timeline.

Janamat shows what citizens think.
Nagarik Signal shows what citizens proved.
```

---

## 31. Testing Plan

### 31.1 Anchor tests

Test cases:

- initialize registry;
- add steward;
- create issue success;
- invalid category fails;
- zero hash fails;
- future first_observed_at fails;
- too-old first_observed_at fails;
- verify issue success;
- reporter self-verification fails;
- duplicate verification fails;
- resolved issue verification fails;
- steward update success;
- non-steward update fails;
- invalid status fails;
- status sequence mismatch fails;
- resolved status sets resolved_at;
- timeline hash changes.

### 31.2 Backend tests

- image upload validation;
- EXIF stripping;
- canonicalization deterministic;
- hash parity browser/server;
- create report API;
- verification API;
- status API;
- proof verification API;
- dashboard query.

### 31.3 Frontend tests

Critical e2e paths:

- browse dashboard;
- create report;
- view issue;
- verify issue;
- duplicate verify rejection;
- steward update;
- resolution proof;
- ProofPanel green match.

### 31.4 Demo preflight

Before recording:

- health endpoint green;
- RPC working;
- relayer has devnet SOL;
- program ID correct;
- seeded data visible;
- all Explorer links open;
- ProofPanel works;
- duplicate verification path works;
- video route under 3 minutes.

---

## 32. Security, Privacy, and Safety

### 32.1 Safety rules in app

Before every report:

- Report only public infrastructure.
- Do not photograph people.
- Do not include license plates.
- Do not report private homes.
- Do not accuse named people.
- Do not use this for emergencies.
- Reports may become public proof.

### 32.2 EXIF stripping

All image metadata should be stripped before storage.

### 32.3 Location privacy

- Use approximate map pin.
- Do not publish exact GPS on-chain.
- Store location hash and rounded coordinates.
- Display ward/locality as primary location.

### 32.4 Moderation

MVP uses steward moderation:

- visible;
- hidden media;
- disputed;
- rejected;
- resolved.

On-chain proof remains, but media display can be hidden if unsafe. This is important:

> The proof record is immutable, but harmful media display is moderated.

### 32.5 Defamation prevention

No categories involving people/officers/politicians. No comments. No accusations flow.

---

## 33. Risk Table

| Risk | Severity | Mitigation |
|---|---:|---|
| Looks like form + blockchain hash | High | Make ProofPanel, timeline, verification, duplicate rejection central. |
| Empty dashboard | High | Seed 30 safe issues before submission. |
| Wallet friction | High | Use civic session + optional wallet mode. |
| Solana hidden in demo | High | Explorer links and Verify On-chain in first 90 seconds. |
| DB/Solana mismatch | Medium | ProofPanel detects mismatch. |
| False reports | Medium | Steward moderation, disputed/rejected status, safe categories. |
| Sybil verification | Medium | Do not call it voting; duplicate per session/wallet only; zkID roadmap. |
| Privacy harm | High | EXIF strip, approximate location, no faces, no comments. |
| Regulatory confusion | High | No tokens/payments/rewards, devnet only, proof-only framing. |
| Devnet RPC down | Medium | Helius + fallback + prerecorded video. |
| Scope creep | High | Compression/SAS/Blinks only after MVP checklist. |
| Judge asks why not database | High | Use Why Solana table and live hash verification. |

---

## 34. Roadmap

### v0.1 — Bounty MVP

- Report issue;
- hash evidence/metadata;
- Issue PDA;
- Verification PDA;
- StatusUpdate PDA;
- ProofPanel;
- dashboard;
- Days Observed/Ignored;
- safety rules;
- seeded data;
- devnet only.

### v0.2 — Public pilot

- Better civic session identity;
- more reports;
- field pilot with campus/civic club;
- improved moderation;
- CSV export;
- reporter/verifier public profiles;
- issue duplicate detection.

### v0.5 — Janamat-adjacent civic stack

- Janamat-style issue escalation;
- issue-to-poll/petition export;
- verified civic groups;
- public API;
- share cards;
- Solana Actions/Blinks for “Verify this Signal.”

### v1.0 — NGO/journalist dashboard

- organization workspaces;
- campaign dashboards;
- issue collections;
- data export;
- newsroom embedding;
- monthly ward accountability report.

### v1.5 — Solana scale features

- ZK Compression / compressed PDAs for large-scale records;
- compressed civic attestations;
- cheaper high-volume verification;
- performance benchmarking.

### v2.0 — Identity and reputation

- issuer-based civic credentials;
- optional Janamat/zkID integration;
- non-transferable civic reputation credential;
- verified steward roles;
- improved Sybil resistance.

### v3.0 — Institutional pilots

- NGO pilots;
- campus pilots;
- municipality dashboards;
- public media partnerships;
- mobile PWA install;
- SMS/low-bandwidth intake exploration.

---

## 35. Hard Judge Questions and Answers

### Why blockchain?

Because the product is about public memory. A normal database can show a complaint, but the operator can edit, delete, or rewrite history. Solana gives a public timestamp, committed evidence hashes, duplicate verification prevention through PDAs, and a status timeline anyone can verify.

### Why not Hello Sarkar?

Hello Sarkar is a government grievance channel. Nagarik Signal is not replacing it. Nagarik Signal creates a public proof layer civic groups, journalists, NGOs, and later government systems can reference.

### Why not FixMyStreet or SeeClickFix?

Those are reporting/routing platforms. Nagarik Signal is focused on tamper-evident public proof, community verification, and an accountability dashboard that can work before official adoption.

### If users do not use wallets, what is proven?

The proof does not depend on users holding crypto. The evidence hash, metadata hash, timestamp, status updates, and verification records are public and tamper-evident. Wallet mode exists for users/judges who want self-custody. Civic session mode exists so normal users do not need SOL or seed phrases.

### Are verifications Sybil-proof?

Not fully in MVP. They are duplicate-resistant per session/wallet, not proof-of-personhood. The roadmap adds issuer credentials, Janamat/zkID-style verification, and stronger reputation.

### Can fake reports be submitted?

Yes, as in every civic reporting system. The MVP reduces harm with safe categories, steward moderation, verification counts, disputed/rejected statuses, no comments, and privacy rules. Future versions add better identity/reputation and duplicate detection.

### Why devnet?

The MVP is a bounty prototype and does not involve crypto value. Devnet avoids unnecessary regulatory and operational risk while proving the architecture. Mainnet requires moderation/legal review and pilot partners.

---

## 36. Final Must-Execute Checklist

### Product

- [ ] Hero says “Public proof for public problems.”
- [ ] Every issue card shows observed/ignored days.
- [ ] Issue page is the strongest screen.
- [ ] Dashboard has ward/locality leaderboard.
- [ ] App never feels like generic complaint portal.

### Solana

- [ ] Anchor program deployed on devnet.
- [ ] Registry PDA works.
- [ ] Steward PDA works.
- [ ] Issue PDA works.
- [ ] Verification PDA prevents duplicates.
- [ ] Reporter/session cannot verify own issue.
- [ ] StatusUpdate PDA created for each update.
- [ ] Timeline hash updates.
- [ ] Explorer links work.
- [ ] ProofPanel compares DB data to on-chain hashes.

### UX

- [ ] Browsing requires no wallet.
- [ ] Civic session mode works.
- [ ] Optional wallet mode works.
- [ ] Report flow under 60 seconds.
- [ ] Status timeline is understandable.
- [ ] Hashes visible but not overwhelming.

### Safety

- [ ] EXIF stripped.
- [ ] Approximate location only.
- [ ] No people-focused categories.
- [ ] No open comments.
- [ ] No political accusation flow.
- [ ] Demo data is safe.

### Demo

- [ ] Demo starts with dashboard.
- [ ] Create issue works live.
- [ ] Verify issue works live.
- [ ] Duplicate verify rejection works live.
- [ ] ProofPanel green match works live.
- [ ] Steward update works live.
- [ ] At least one resolved issue.
- [ ] Demo video under 3 minutes.
- [ ] Final line included.

### Submission

- [ ] Public GitHub repo.
- [ ] Live Vercel link.
- [ ] Devnet program ID in README.
- [ ] Demo video link.
- [ ] Build-in-public posts.
- [ ] No token/payment/reward language.

---

## 37. Final Build Doctrine

Codex speed should be used to build deeper proof quality, not random features.

Spend extra engineering power on:

- ProofPanel;
- hash verification;
- duplicate verification rejection;
- timeline hash;
- polished dashboard;
- seeded data;
- safety guardrails;
- README clarity;
- demo reliability.

Do not spend it on:

- payments;
- tokens;
- zk;
- compression;
- cNFT badges;
- DAO voting;
- comments;
- native mobile;
- Janamat integration before MVP.

The winning experience is:

1. Judge sees a civic issue.
2. Issue has public proof.
3. Another citizen verifies it.
4. Duplicate verification fails on-chain.
5. Status timeline is public.
6. Dashboard ranks ignored issues.
7. Judge verifies hash live.
8. No tokens, no payments, no legal weirdness.
9. It feels like civic tech, not crypto.

Final sentence:

> Nagarik Signal wins if it makes one thing unforgettable: ignored civic issues now have receipts.

---

## 38. References and Implementation Notes

These are useful references for implementation and README sourcing:

- Solana Actions/Blinks docs: https://solana.com/docs/advanced/actions
- Solana Token Extensions docs: https://solana.com/docs/tokens/extensions
- ZK Compression docs: https://www.zkcompression.com/home
- Anchor docs: https://www.anchor-lang.com/docs
- Janamat: https://janamat.app/
- Hello Sarkar grievance portal: https://gunaso.opmcm.gov.np/
- FixMyStreet: https://www.fixmystreet.com/
- SeeClickFix: https://seeclickfix.com/
- Ushahidi: https://www.ushahidi.com/

Use roadmap references carefully. Do not pretend the MVP uses ZK Compression, SAS, Token Extensions, or Blinks unless they are actually implemented. The MVP should be honest: custom Anchor program + PDAs + proof verification.

