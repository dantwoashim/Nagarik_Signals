# Safety Policy

Nagarik Signal is limited to observable public infrastructure. It is not an emergency service, accusation channel, or people-tracking system.

## Allowed

- roads, footpaths, potholes, and public crossings;
- waste and public sanitation;
- water supply, leakage, and drainage;
- streetlights and exposed public electrical fixtures;
- public facilities and accessibility barriers;
- observable hazards on public infrastructure.

## Rejected

- identifiable faces or license plates;
- private homes or private disputes;
- names, accusations, or allegations about a person;
- political persuasion or targeting;
- health, identity, financial, or other sensitive personal data;
- emergency scenes or requests for urgent response;
- exact coordinates for a sensitive place;
- open comments.

Use local emergency services for immediate danger. Nagarik Signal does not dispatch responders.

## Upload Controls

Community images are decoded rather than trusted by filename, limited by pixel count and output size, auto-rotated, resized, metadata-stripped, and re-encoded. The stored filename is the SHA-256 hash of the sanitized bytes. A short-lived signed upload receipt is required before those bytes can be attached to a report.

Uploaded evidence is delivered through a private, no-store proxy. This prevents shared or browser caching from bypassing a later `hidden_media` or `rejected` moderation decision.

Automated processing does not reliably detect every face, plate, address, or harmful scene. The reporter safety declaration and steward moderation remain necessary.

## Moderation States

- `visible`: record and media are publicly available.
- `hidden_media`: the record and on-chain commitment remain, but the media proxy refuses delivery.
- `disputed`: the record remains visible with a review warning.
- `rejected`: the record leaves public lists, maps, and totals; media delivery is blocked.
- `resolved`: safety review is complete after the chain status is resolved.

Moderation does not erase the on-chain commitment. This is deliberate, but it also means a committed hash cannot be removed from Solana devnet.

## Location Policy

The UI uses ward/locality as the primary location. Coordinates are rounded to three decimals before public storage, and only a coarse location hash is committed on-chain. Exact camera GPS is removed with the original metadata.

The optional "current area" control requests one browser location fix, rounds it immediately, and does not retain or transmit the exact fix. The rounded viewport loads OpenStreetMap-derived tiles through OpenFreeMap; no address search, reverse geocoding, or continuous location tracking is performed.

## Source Dossiers

Public-source records must include the original URL, publisher, publication time, check time, review expiry, confidence, and status at check. A dossier proves what was cited and committed, not that the underlying issue remains unchanged. Expired records visibly require rechecking.

Social posts may identify a research question, but they do not become public civic records without a checkable primary, official, or reputable published source.

## Status and Resolution

A platform steward status update proves that the configured steward signer committed a new state and proof hash. A resolution image is an after-state artifact submitted by that steward. Neither is described as an official government action unless an official integration and authenticated author exist.

## Authority Handoff Receipts

The handoff ledger is platform-recorded and separate from the on-chain status timeline. A route marked `prepared` cannot include a case reference or receipt. Delivery requires an external reference or redacted receipt, and acknowledgement requires a newly uploaded receipt plus an explicit privacy-review declaration.

Before upload, remove names, phone numbers, addresses, signatures, account details, QR codes, login links, and national identifiers. The normal image sanitation pipeline strips metadata but cannot reliably detect visible personal information. Stewards remain responsible for visual redaction. Moderation can later block receipt delivery while retaining its hash and audit event.
