# Data Provenance

Every public Nagarik Signal record identifies how its civic claim entered the
system and which version was approved for publication.

## Public Record Classes

### Community report

An invited resident or civic group submits a description, date, category,
approximate location, and sanitized evidence. The report remains private until
moderation approves a public-safe version.

### Public-source dossier

An operator records a checkable publication with:

- publisher, title, and original URL;
- publication and check dates;
- review deadline;
- source type and confidence;
- a concise, attributed summary;
- the approved evidence and metadata commitments.

The platform records what was checked. It does not copy an article, certify the
publisher's claim, or assume the source remains current after its review date.

## Non-Civic Data

Illustrative samples and engineering fixtures can exist in local compatibility
data, but they are excluded from v2 civic projections, public totals, and
operator claims. Production migrations accept only `community_report` and
`public_source` for native v2 records.

## Version History

Publication freezes one immutable public version. A correction creates another
version under the same public issue ID. Each version retains its provenance,
approved derivative, canonical metadata, coarse location, review decision, and
chain binding. A correction never changes the bytes or fields of an earlier
version.

## Source Recheck

1. Open the recorded source URL and any primary corroborating reference.
2. Check for a dated correction or status update.
3. Record the new check time, reviewer, and result.
4. Create a new immutable public version when public metadata changes.
5. Append lifecycle or handoff history only when the evidence supports that
   specific event.

Social posts can identify a question for review. They are not accepted as a
high-confidence public-source record without a checkable source and review.
