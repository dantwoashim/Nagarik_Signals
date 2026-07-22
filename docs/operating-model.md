# Operating Model

Nagarik Signal keeps public reporting free. Revenue, if the service reaches an operating pilot, comes from workflow used by institutions around the public record rather than charging residents to report or selling influence over issue ranking.

## Public Layer

- report and browse public infrastructure issues;
- inspect evidence origin and proof state;
- add a rate-limited corroboration signal;
- inspect official grievance routes and the platform's handoff chronology;
- see source freshness, evidence basis, follow-up dates, and steward history.

## Official Follow-up

The handoff ledger is an operational record maintained by Nagarik Signal, not a mirror of a government case system.

| State | Minimum evidence | Meaning |
|---|---|---|
| `prepared` | Named authority and channel | The route is ready; no delivery is claimed |
| `submitted` | External reference or redacted receipt | A steward recorded delivery to the channel |
| `acknowledged` | Privacy-reviewed redacted receipt | A steward retained an acknowledgement artifact |
| `follow_up` | Public note and next due date | A further action was recorded |
| `closed` | Public closing note | The handoff trail ended; the issue is not automatically resolved |

Every event commits the previous event hash. Stewards cannot skip an invalid transition, backdate before the prior event, attach reused evidence, or silently reopen a closed trail. Public pages state that the receiving authority did not author or independently verify these records.

## Institutional Workflow

Civic groups, newsrooms, and municipal teams could pay for moderation queues, assignments, watchlists, exports, source recheck scheduling, delivery receipts, and verification APIs. Institutional access must not permit deletion or silent rewriting of public proof.

No customer, partner, municipality, newsroom, NGO, or pilot adoption is currently claimed.

## Responsible First Pilot

Scope one locality, three infrastructure categories, and a 90-day review window. Name a moderation owner and official escalation contacts before accepting reports.

Measure:

- median acknowledgement and resolution time;
- moderation turnaround;
- duplicate and rejected-report rate;
- source freshness at each recheck deadline;
- evidence-delivery availability;
- proof-check success;
- percentage of records with a retained official ticket reference;
- wrong high-confidence source claims.

The pilot should stop or narrow if moderation coverage, relayer funding, evidence retention, or official routing cannot be maintained.
