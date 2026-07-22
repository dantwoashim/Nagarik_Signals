# Research Notes

Checked on 2026-07-14 (Nepal time). These notes document product decisions, not claims of partnership or institutional adoption.

## Existing Official Intake

Kathmandu already operates several reporting surfaces:

- [Kathmandu Gunaso](https://gunaso.kathmandu.gov.np/) accepts and tracks grievances. At the time checked, its public dashboard displayed 8,815 total tickets: 8,205 complete, 374 in progress, and 236 to do. The counts are a changing portal snapshot, not Nagarik Signal data.
- [Kathmandu Metropolitan City grievance and suggestions](https://kathmandu.gov.np/contact?lang=en) exposes a ward/department form and public contact details.
- [Connect KMC](https://apps.apple.com/np/app/connect-kmc/id6767496815) describes an official Public Eye flow with message, photo, or voice reporting.
- [Hello Sarkar](https://gunaso.opmcm.gov.np/) is the federal grievance route.
- The [Local Level Mobile App](https://doit.gov.np/pages/69131/) is maintained by Nepal's Department of Information Technology for local-government services.

Product consequence: Nagarik Signal must complement official intake, not claim to replace it. Every eligible record should be easy to hand off to the appropriate official channel while retaining an independent public proof URL.

## Current Civic Records

The first source-backed watchlist uses two official KMC publications and two Kathmandu Post reports:

- [Utility pole relocation delays hobble road widening projects](https://kathmandupost.com/national/2026/06/24/utility-pole-relocation-delays-hobble-road-widening-projects)
- [Municipal response after the Samakhushi river wall collapse](https://metronews.kathmandu.gov.np/news/detail/0507389732)
- [Measures to extend Bancharedanda landfill service life](https://metronews.kathmandu.gov.np/news/detail/0607285852)
- [Groundwater shortages around Dhangadhi and Kailari](https://kathmandupost.com/national/2026/06/27/hand-pumps-are-dry-even-deep-borewells-no-longer-provide-enough-water)

These sources establish that the issue was publicly documented. They do not establish current field status, so each record has a review expiry and a `needs_recheck` state.

## Adjacent Products

- [Local Pulse Nepal](https://localpulsenepal.com/) provides city ratings, issue pins, and "I'm affected" signals.
- [DevTrack](https://www.devtrack.org/) presents Kathmandu projects, officials, and a public accountability forum.
- FixMyStreet, SeeClickFix, and Ushahidi establish mature patterns for issue reporting, service routing, and crowdsourced mapping outside Nepal.

Product consequence: maps, votes, and feeds are not a sufficient distinction. Nagarik Signal centers delivered-byte verification, explicit record origin, source expiry, and an immutable status-proof path.

## Public Discussion

Public threads were used only to identify workflow concerns:

- A [NepalSocial discussion](https://www.reddit.com/r/NepalSocial/comments/1u2ax8n/why_do_complaints_about_roads_garbage_and_local/) described reports disappearing after intake and asked for phone reporting, progress tracking, and nearby corroboration.
- A separate [Hello Sarkar discussion](https://www.reddit.com/r/NepalSocial/comments/1t80e2q/it_has_never_been_this_easy_to_make_complaint_to/) included both successful anecdotal outcomes and skepticism about whether complaints would be taken seriously.

Reddit posts are anecdotal, identity-unverified, and unsuitable as civic evidence. No social-media allegation was imported as a Nagarik Signal public record.

## Decisions Taken

1. Preserve the original evidence fingerprint and delivered bytes.
2. Keep public-source dossiers separate from firsthand community reports.
3. Expire source claims into a visible recheck state.
4. Route users toward official grievance channels instead of duplicating them invisibly.
5. Call session actions signals, not unique citizen votes.
6. Keep samples and QA fixtures out of public metrics.
7. Make harmful media display mutable while the proof commitment remains inspectable.
8. Avoid token incentives, comments, people-focused accusations, and emergency reporting.
