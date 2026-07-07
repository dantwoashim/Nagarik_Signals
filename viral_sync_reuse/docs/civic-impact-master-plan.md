# Civic Impact Markets by Viral Sync - Unified Master Plan

## 0. Final Decision

The project should move forward as:

**Civic Impact Markets by Viral Sync**

Core line:

> Prediction markets show what people expect. Viral Sync proves what people did.

Product definition:

> A non-wager civic forecasting and action-settlement system where communities signal expected civic outcomes with non-transferable conviction credits, sponsors fund action reward pools, and rewards settle on Solana only after a participant and verifier station co-attest a civic action into a replay-protected receipt.

The winning demo is one narrow scenario:

> Will Ward 12 repair the water line before September 30?

This is the only story the submission should tell.

## 1. Hard Strategy

### What We Preserve

- Existing Anchor program and all POC-1 settlement instructions.
- Existing devnet proof artifacts.
- Existing SDK verifier.
- Existing fraud gauntlet and protocol tests.
- Existing `frontier:assert-final` proof gate.
- Existing honest limitations posture.

### What We Reframe

| Existing | Civic Product |
|---|---|
| merchant | organizer / sponsor |
| campaign | civic impact market / action pool |
| visitor | participant |
| terminal | verifier station |
| claim pass | participation pass |
| causal receipt | civic action receipt |
| reward escrow | impact reward pool |
| nullifier | one-person-one-action guard |
| proof center | public civic ledger |

### What We Do Not Do First

- Do not edit `programs/viral_sync/**` in Sprint 0.
- Do not rewrite Anchor account names, seeds, or instruction names.
- Do not regenerate devnet proof only to replace merchant wording.
- Do not hand-edit signed proof JSON.
- Do not claim live Janamat, zkPassport, zkID, government, or citizen adoption.
- Do not connect forecast correctness to rewards.
- Do not create gambling, betting, odds, liquidity, or trading mechanics.

## 2. Winning Product Shape

The product has three layers:

1. **Signal Layer**
   - Participants allocate non-transferable conviction credits.
   - Credits have no cash value.
   - Credits never determine payouts.
   - Sprint 0-MVP implementation is app-layer artifact/Merkle/signed JSON.

2. **Action Layer**
   - Sponsor funds action pool.
   - Participant claims participation pass.
   - Verifier station co-attests civic action.
   - Existing POC-1 receipt path records proof.

3. **Settlement Layer**
   - Reward settles only after valid receipt path exists.
   - Nullifier prevents replay.
   - Public ledger and SDK verifier let judges verify without trusting UI.

## 3. Master Roadmap

### Phase 1 - Sprint 0 Civic Reframe, 48 Hours

Goal:

Make the visible project civic, claim-safe, and route-complete without touching the Anchor program.

Must land:

- Civic domain model.
- Ward 12 fixture.
- Civic route scaffold.
- Civic claim-safety scanner.
- Civic README skeleton.
- Civic design tokens.
- Legacy redirects.
- No primary merchant-language leakage.
- All existing validation green.

Do not touch:

- `programs/viral_sync/**`
- `Anchor.toml`
- original devnet proof artifacts
- existing protocol tests

Exit gate:

```bash
node scripts/claim-safety-scan.mjs
node scripts/assert-civic-routes.mjs
node scripts/assert-civic-artifacts.mjs
npm run lint --workspace app
npm run build --workspace app
npm run build --workspace viral-sync-sdk
cargo check --manifest-path programs/viral_sync/Cargo.toml
npm run test:protocol
npm run frontier:assert-final
```

### Phase 2 - Civic MVP, Days 3-10

Goal:

Make the Ward 12 demo flow work end to end in the app.

Build:

- `/` product-first civic homepage.
- `/market/ward12-water-repair`.
- `/participate/ward12-water-repair`.
- `/verify/ward12-water-repair`.
- `/receipt/[id]` civic receipt copy.
- `/ledger` public civic ledger.
- `/for-sponsors`.
- `/demo` guided judge flow.
- Replay rejection panel.

Critical technical fix:

- Replace hosted demo dependence on in-memory pass state with stateless signed participation pass packets.

Exit gate:

- Judge can complete the path from landing page to receipt to replay proof to ledger.
- Hosted pass claim and verifier flow works across serverless instances.
- No forecast-to-payout coupling exists in UI, artifacts, or code.

### Phase 3 - Proof, SDK, Docs, Days 11-16

Goal:

Make the proof layer understandable, machine-verifiable, and submission-safe.

Build:

- `scripts/assert-civic-artifacts.mjs`
- `scripts/verify-civic-receipt.mjs`
- SDK civic wrappers.
- Civic sidecar proof artifacts.
- Janamat compatibility artifact.
- zk identity adapter artifact.
- README rewrite.
- Docs suite.

Important:

All civic artifacts must reference original proof artifact hashes. Do not mutate original signed artifacts.

Exit gate:

- `/ledger` is understandable without reading code.
- A judge can verify a receipt independently.
- Compatibility claims are clearly `specified_not_integrated`.

### Phase 4 - Premium UI/UX Hardening, Days 17-20

Goal:

Make the frontend worthy of the backend.

Focus:

- Remove purple/crypto aesthetic.
- Use civic paper/ink/proof palette.
- Tighten typography.
- Make proof visible in normal UI.
- Build all empty/loading/error/replay states.
- Mobile QA.
- Accessibility.
- Reduced motion.
- Performance sanity.

Exit gate:

- Landing page explains product in under 5 seconds.
- Mobile judge path works.
- No horizontal overflow.
- Keyboard path works.
- Replay rejection and proof expansion feel intentional, not hacked on.

### Phase 5 - Optional On-Chain Conviction Signal, Days 21-24

Only start if Phase 4 is fully green.

Add:

- `commit_conviction_signal`
- `ConvictionSignal` PDA
- duplicate prevention
- credit cap
- no transfer path
- settlement-independence tests

Do not start if:

- app build is red
- tests are red
- claim scanner is red
- less than 6 days remain
- devnet/proof pipeline is unstable

Fallback:

Ship app-layer signed conviction artifact and document on-chain signal as next milestone.

### Phase 6 - Submission Readiness, Days 25-30

Goal:

Freeze, verify, record, submit.

Must produce:

- final command transcript
- fresh clone verification
- hosted app verification
- mobile verification
- accessibility verification
- proof artifact verification
- README verification
- final 3-minute video
- final go/no-go checklist

Submit only from the latest fully green tag.

## 4. Sprint 0 Exact Work Order

### Hours 0-3 - Civic Domain Foundation

Create:

- `app/src/lib/civic/types.ts`
- `app/src/lib/civic/civicMarket.ts`
- `app/src/lib/civic/civicProof.ts`
- `app/src/lib/civic/claims.ts`
- `app/src/lib/civic/fixtures/ward12-water-repair.ts`

Add:

- `CivicImpactMarket`
- `ConvictionCreditAllocation`
- `SponsorActionPool`
- `VerifierStation`
- `CivicActionReceipt`
- `ParticipationPassPacket`
- `getCivicMarket`
- `getDefaultCivicMarket`

### Hours 3-6 - Civic Artifacts

Create:

- `app/public/proofs/civic-market-ward12-water-repair.json`
- `app/public/proofs/civic-ledger.json`
- `app/public/proofs/civic-receipt-latest.json`
- `app/public/proofs/civic-verifier.json`
- `app/public/proofs/civic-fraud-gauntlet.json`
- `app/public/proofs/civic-readiness.json`

Create:

- `scripts/assert-civic-artifacts.mjs`

Artifacts must include:

- `sourceArtifactHash`
- `nonWager: true`
- `forecastCredits.transferable: false`
- `forecastCredits.cashValue: "0"`
- `settlement.dependsOnForecast: false`
- limitations block

### Hours 6-10 - Claim Safety

Create:

- `scripts/claim-safety-scan.mjs`
- `docs/claim-safety-allowlist.json`

Add package script:

```json
"claims:scan": "node scripts/claim-safety-scan.mjs"
```

Scanner must fail on:

- bet
- betting
- wager
- odds
- cash out
- Polymarket
- election betting
- Janamat integration
- zkPassport verified
- zkID verified
- government adopted
- production ready
- mainnet ready
- guaranteed physical proof
- GPS verified
- POS verified

Scanner must allow:

- non-wager
- no cash value
- non-transferable conviction credits
- compatibility only
- not integrated
- devnet POC
- counter-attested receipt

### Hours 10-16 - Civic Routes

Create:

- `app/src/app/market/[slug]/page.tsx`
- `app/src/app/participate/[slug]/page.tsx`
- `app/src/app/verify/[slug]/page.tsx`
- `app/src/app/ledger/page.tsx`
- `app/src/app/for-sponsors/page.tsx`
- `app/src/app/how-it-works/page.tsx`

Modify route allowlist if needed:

- `app/src/lib/demo-mode.ts`
- `app/src/proxy.ts` if route access is blocked

Add redirects:

- `/campaign/:slug` -> `/market/:slug`
- `/claim/:token` -> `/participate/ward12-water-repair?token=:token`
- `/merchant/scan` -> `/verify/ward12-water-repair`
- `/merchant/today` -> `/verify/ward12-water-repair`
- `/proof` -> `/ledger`
- `/for-merchants` -> `/for-sponsors`

### Hours 16-24 - Civic Components

Create:

- `app/src/components/civic/CivicMarketPreview.tsx`
- `app/src/components/civic/CivicMarketHeader.tsx`
- `app/src/components/civic/ConvictionCreditAllocator.tsx`
- `app/src/components/civic/ActionPoolMiniPanel.tsx`
- `app/src/components/civic/SponsorActionPoolPanel.tsx`
- `app/src/components/civic/ParticipationPassCard.tsx`
- `app/src/components/civic/CivicParticipationFlow.tsx`
- `app/src/components/civic/VerifierStationFlow.tsx`
- `app/src/components/civic/VerifierStationPanel.tsx`
- `app/src/components/civic/CivicLedger.tsx`
- `app/src/components/civic/CivicLedgerRow.tsx`
- `app/src/components/civic/ReplayRejectionPanel.tsx`
- `app/src/components/civic/IndependentVerifierPanel.tsx`
- `app/src/components/civic/ClaimBoundaryNotice.tsx`

Do not over-polish. Make the civic flow visible and coherent.

### Hours 24-30 - Landing Page

Rewrite:

- `app/src/app/page.tsx`

First screen must show:

- Ward 12 question
- non-wager badge
- conviction signal summary
- sponsor action pool
- latest civic receipt/proof strip
- replay protected badge

CTAs:

- `Open Ward 12 market`
- `Claim participation pass`
- `View public ledger`

### Hours 30-36 - Layout And Design Tokens

Modify:

- `app/src/app/layout.tsx`
- global CSS/tokens file used by the app
- `app/src/components/premium/PremiumUi.tsx` only where necessary

Fix:

- remove `userScalable: false`
- avoid `h-[100dvh] overflow-hidden` as global page lock
- correct manifest path if needed
- reduce Playfair/editorial feel
- remove purple/indigo hero from active path

Add civic tokens:

- paper
- ink
- muted slate
- civic green
- proof slate
- caution amber
- replay red
- border clay

### Hours 36-40 - README And Docs Skeleton

Create/update:

- `README.md`
- `docs/why-non-wager.md`
- `docs/civic-threat-model.md`
- `docs/known-limitations.md`
- `docs/independent-verification.md`
- `docs/demo-script.md`
- `docs/submission-checklist.md`

README must include:

- what this is
- what this is not
- demo path
- proof artifacts
- validation commands
- limitations

### Hours 40-44 - API Wrappers

Create:

- `app/src/app/api/civic/markets/[slug]/route.ts`
- `app/src/app/api/civic/participation-pass/route.ts`
- `app/src/app/api/civic/verifier/confirm/route.ts`
- `app/src/app/api/civic/ledger/route.ts`
- `app/src/app/api/civic/replay-proof/route.ts`

These should wrap existing product-loop/proof logic. Do not create unsafe live settlement endpoints.

### Hours 44-48 - Sprint 0 Verification

Run:

```bash
npm run claims:scan
node scripts/assert-civic-artifacts.mjs
npm run lint --workspace app
npm run build --workspace app
npm run build --workspace viral-sync-sdk
cargo check --manifest-path programs/viral_sync/Cargo.toml
npm run test:protocol
npm run frontier:assert-final
```

Exit criteria:

- civic routes exist
- legacy redirects work
- no dangerous claims
- no judge-visible merchant/adtech framing on the new path
- app builds
- protocol tests unchanged
- `frontier:assert-final` remains green
- `git diff --stat -- programs/viral_sync` is empty

## 5. Design Master Direction

### Design Philosophy

Proof is the product. The app should feel like a civic records office designed with Stripe-level craft.

### Visual Rules

Use:

- document-like panels
- ledger rows
- restrained civic palette
- visible hashes and explorer links
- proof chips
- calm status states

Avoid:

- purple crypto gradients
- neon glow
- casino visuals
- odds boards
- token charts
- fake government seals
- fake logos
- fake stats
- confetti

### First Viewport

Within 5 seconds, a judge must understand:

- this is civic, not merchant referrals
- this is non-wager, not betting
- rewards settle only after verified action
- proof is public and verifiable

### Animation Rules

Allowed:

- conviction bar transition
- participation pass stamp
- verifier checklist sequence
- receipt settles into ledger
- replay rejection lock
- ledger row expansion

Avoid:

- confetti
- spinning coins
- looping gradients
- slot-machine motion
- parallax
- excessive hover scale

## 6. Proof Artifact Rules

Create civic sidecar artifacts only.

Do not rewrite original signed proof artifacts.

Required civic files:

- `civic-market-ward12-water-repair.json`
- `civic-ledger.json`
- `civic-receipt-latest.json`
- `civic-verifier.json`
- `civic-fraud-gauntlet.json`
- `janamat-compatibility.json`
- `zk-identity-adapter.json`
- `civic-readiness.json`

Every civic artifact must include:

- `schemaVersion`
- `artifactType`
- `generatedAt`
- `network: "devnet"`
- `proofLevel: "counter_attested"`
- `sourceArtifactHash`
- claim-safety disclosures
- limitations

## 7. Claim Safety Rules

### Allowed

- non-wager civic forecasting
- non-transferable conviction credits
- forecast credits have no cash value
- forecast credits never determine payouts
- rewards settle only for verified civic actions
- devnet proof-of-concept
- counter-attested receipt
- compatibility specified, not integrated

### Banned

- bet
- wager
- odds
- casino
- cash out
- liquidity
- trading
- market price
- election betting
- Polymarket for Nepal
- live Janamat integration
- zkPassport verified users
- zkID verified citizens
- government partner
- production ready
- mainnet ready
- physical-world truth guaranteed
- GPS verified
- POS verified

## 8. Testing Master Plan

Preserve:

```bash
npm run test:protocol
cargo check --manifest-path programs/viral_sync/Cargo.toml
npm run build:program
npm run frontier:assert-final
```

Add:

- civic route tests
- claim-safety scanner tests
- civic artifact schema tests
- pass packet tests
- SDK civic verifier tests
- replay UX tests
- no merchant leakage tests
- mobile screenshot tests
- accessibility checks

## 9. 100% Readiness Checklist

Before submission:

- full command transcript exists
- fresh clone passes
- hosted app works
- mobile path works
- accessibility checked
- performance checked
- proof artifacts validate
- README links work
- video is under 3 minutes
- video contains no banned claim
- explorer links resolve
- legacy routes redirect
- merchant language is gone from judge-visible flow
- replay rejection is demonstrable
- independent verifier works
- limitations visible in app, README, and video

Do not submit if:

- app build fails
- protocol tests regress
- `frontier:assert-final` is red
- claim scanner fails
- hosted pass-to-verify flow fails
- artifact hashes diverge
- a route claims Janamat/zk/government integration
- UI implies forecasts pay rewards
- any primary page still looks like merchant adtech

## 10. Manual Tasks For Founder

The founder must handle:

- final product taste decision
- hosted deployment
- devnet wallet/faucet if refreshing proof
- final claim review
- final video recording
- final screenshots
- optional civic org conversation
- mobile device verification
- explorer link manual verification
- hackathon submission

## 11. Agent Tasks

The coding agent can handle:

- civic domain model
- route scaffolding
- redirects
- civic components
- civic proof artifacts
- claim scanner
- stateless pass implementation
- SDK wrappers
- docs drafts
- README draft
- artifact validation
- route tests
- build/lint/test verification
- final transcript generation

## 12. Final Product Standard

The final project should feel like this:

> A civic action is forecasted, funded, verified, settled, rejected on replay, and independently verifiable.

If a feature does not help that story, it is cut.

The first submission-worthy checkpoint is **Sprint 0 green**.

