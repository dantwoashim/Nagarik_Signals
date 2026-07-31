# Safety Policy

Nagarik Signal is limited to observable public infrastructure. It is not an
emergency service, accusation channel, or people-tracking system.

## Accepted Scope

- roads, footpaths, crossings, drainage, and public accessibility;
- waste, sanitation, and public water infrastructure;
- streetlights and observable public electrical fixtures;
- public facilities and maintenance hazards.

## Rejected Scope

- identifiable faces, plates, private homes, or precise sensitive locations;
- names, accusations, disputes, or allegations about a person;
- political persuasion, targeting, comments, or private messaging;
- health, identity, financial, credential, or other sensitive personal data;
- emergencies or requests for urgent response.

Use the appropriate local emergency service for immediate danger. Nagarik
Signal does not dispatch responders.

## Intake And Media

An intake invitation is narrow and expiring. The service decodes each image,
limits pixels and output bytes, rotates it, strips metadata, resizes it, and
re-encodes it before hashing. The resulting source object remains private.

Automated processing cannot reliably find every face, plate, address, document,
QR code, or harmful scene. A submission remains private until operator review.
Publication uses a separate approved derivative, not the source object.

## Location

Private review can use a bounded point inside the approved pilot area. Public
records use only a coarse rounded cell, ward, and locality. Exact camera GPS is
removed with image metadata and never committed to Solana.

## Publication And Correction

Approval freezes a public-safe immutable version. A correction creates a later
version without rewriting the earlier commitment. A public signal represents
attention only and cannot change lifecycle state.

Operator lifecycle or handoff events are platform records. They are described
as authority-authored only when a verified authority integration supplies that
identity and evidence.

## Removal And Privacy

Removal denies public record and media access immediately and returns a neutral
tombstone. Private rows and objects follow retention, legal-hold, revocation,
and deletion-ledger rules. Existing on-chain hashes cannot be erased, which is
why personal data, exact locations, private notes, and raw media never belong in
a chain commitment.

Security-sensitive privacy concerns must use the private reporting process in
[`SECURITY.md`](SECURITY.md).
