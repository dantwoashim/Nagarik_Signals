# Nagarik Signal v1 Rules

This crate is the deployed historical v1 program.

- Preserve its program ID, account layout, PDA seeds, instructions, events,
  errors, and semantic meaning.
- Do not retrofit production moderation, role, event, or verification semantics
  into v1.
- New product write paths must not invoke v1 verification or status mutations.
- Changes are limited to explicitly approved compatibility or toolchain work
  that cannot alter the binary contract.
- Keep dedicated v1 build, decoding, IDL checksum, and historical proof tests.
- New production state and instructions belong in
  `programs/nagarik_signal_v2`.
