# Privacy And Safety Notes

- Intake, tracking, media, and signal capabilities are separate, expiring, and
  purpose-bound. The database stores keyed verifiers rather than raw tokens.
- Operator access requires managed identity, AAL2, active organization
  membership, and an allowed role for the target resource.
- Precise review coordinates remain private. Public records use a rounded cell,
  ward, and locality, and only that coarse location is committed on-chain.
- Uploaded images are decoded, rotated, bounded, resized, metadata-stripped,
  re-encoded, and hashed before durable storage.
- Source media remains private. Public delivery uses a separately reviewed
  derivative through a same-origin media route.
- Public projections have no columns for private narrative, exact location,
  tracking material, moderation notes, operator details, or outbox payloads.
- Removal denies public media and record access immediately while a neutral
  tombstone and minimum integrity history can remain.
- Logs and abuse identifiers use bounded, redacted data and keyed correlation
  values. Raw forwarded addresses are not application identifiers.
- The product has no comments, private messaging, people-focused accusation
  categories, or emergency dispatch.

Automated image processing cannot reliably identify every face, plate, address,
document, or harmful scene. Reporter declarations and operator review remain
required. See [`SAFETY.md`](../SAFETY.md) and the
[`data-classification contract`](production/data-classification.md).
