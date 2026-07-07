# Demo Script

Target duration: under 3 minutes.

## 1. Open The Civic Market

Show `/demo`, then open `/market/ward12-water-repair`.

Say:

```text
This is not a pure forecast app. It is a civic signal plus action reward system. The forecast organizes attention; the sponsor pool pays for verified participation.
```

## 2. Issue The Participation Pass

Open `/participate/ward12-water-repair`.

Say:

```text
The pass is a signed packet. It can be verified by another hosted instance without relying on in-memory state.
```

## 3. Verify The Receipt Path

Use the verifier link from the issued pass.

Say:

```text
The receipt evidence is the Solana part. Authority, verifier station, participant, nullifier, and settlement records are public.
```

## 4. Open The Civic Receipt

Open `/receipt/[id]`.

Say:

```text
This is the receipt evidence. It proves the devnet receipt path and keeps the physical-world claim boundary visible.
```

## 5. Show Replay Rejection

Open the replay proof link or `/proofs/civic-fraud-gauntlet.json`.

Say:

```text
The same action cannot settle twice. The nullifier and negative-path artifact are public.
```

## 6. Open The Ledger

Open `/ledger`.

Say:

```text
The ledger maps product claims to public artifacts. A reviewer can inspect JSON or run the independent verifier instead of trusting the UI.
```

## 7. Verify The Sidecar

Open `/proofs/civic-proof-sidecar.json`, then mention:

```bash
npm run civic:verify-receipt
```

Say:

```text
This sidecar binds the civic story back to the original devnet proof hashes. It does not rewrite the original proof artifacts.
```

## 8. Open Technical Artifacts

Open one original `/proofs/*.json` file.

Say:

```text
This is the underlying devnet proof. The civic product is new, but the receipt primitive is real and already has negative-path evidence.
```
