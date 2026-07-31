# Nagarik Signal v2 Rules

This directory owns the production commitment protocol.

- Use a new program ID and generated v2 IDL.
- Store compact hashes, identifiers, roles, lifecycle values, heads, counters,
  authorities, and timestamps only.
- Never store title, narrative, URL, evidence bytes, receipt contents, exact
  location, or personal data.
- Do not implement a global issue counter, browser-session verification,
  citizen funding, or personhood semantics.
- Every instruction checks protocol version, pause state, role, PDA, expected
  prior state/head/count, deterministic event ID, and terminal rules.
- Retries must discover the existing logical event rather than create a second
  one.
- Maintain Rust/TypeScript PDA and canonical vector parity.
- Require format, clippy with warnings denied, unit, Anchor positive/negative,
  replay, stale-state, account-size/rent, and IDL drift tests.
