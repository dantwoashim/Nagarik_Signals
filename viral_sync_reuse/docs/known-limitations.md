# Known Limitations

Phase 3 is a civic product pivot over an existing Solana receipt primitive. The pivot is intentionally narrow.

Current limitations:

- The Ward 12 dataset is a fixture.
- No live municipal source is integrated.
- Janamat compatibility is specified, not connected.
- Private identity adapters are specified, not connected.
- The participation pass is signed and stateless, but it still represents a devnet MVP flow.
- Real-world repair completion is not independently proven.
- The system is not production ready for real-value deployment.

What Phase 3 does prove:

- The primary product surface is civic-first.
- Civic artifacts exist and are machine-readable.
- The public app can point to real devnet receipt evidence.
- Hosted pass verification does not depend on in-memory pass state.
- Unsupported claims are blocked by a claim-safety scan.
- A reviewer can independently verify the civic receipt bundle with `npm run civic:verify-receipt`.
- SDK civic wrappers can fetch and verify the public sidecar bundle.
