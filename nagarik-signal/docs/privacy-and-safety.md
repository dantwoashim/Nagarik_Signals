# Privacy and Safety Notes

- The server issues a random signed session cookie. It is HttpOnly, Secure in production, SameSite Lax, and expires after 30 days.
- Session IDs are not public. Stored session and rate-limit identifiers are one-way hashes.
- Forwarded IP addresses are hashed with a server secret before request events are stored.
- Community evidence is re-encoded without EXIF metadata and stored under its full sanitized-byte hash.
- Public location is rounded and presented as ward/locality first. Exact camera GPS is not retained from image metadata or written on-chain.
- Public-source dossiers contain publisher information, not personal submitter information.
- Hidden and rejected media is blocked by the delivery route while its on-chain hash remains.
- No comments, private messaging, people-focused accusation categories, or emergency dispatch exist.

The current system does not claim automatic detection of faces, plates, or sensitive scenes. Reporters and stewards remain responsible for safety review. See [`SAFETY.md`](../SAFETY.md) for the enforceable product boundary.
