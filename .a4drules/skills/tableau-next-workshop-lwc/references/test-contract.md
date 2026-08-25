# Workshop and maintainer verification

Use the short path during the live workshop and the regression matrix before
shipping skill or pre-baked infrastructure changes.

## Workshop-time verification

For each changed data-backed component:

1. Confirm the prompt-derived semantic role contract.
2. In recovery mode, confirm the live discovery handoff and smoke-test it before
   generation. In native mode, smoke-test the concrete mapping after placement.
3. Deploy only the changed LWC bundle.
4. Map every required role and verify loaded rows, no-data, and visible terminal
   error behavior.
5. Change one relevant dashboard filter and confirm the tile redraws without an
   explicit fetch.
6. Exercise the build interaction using pointer and keyboard.

`RecordInsightGenerator` is workshop head-start infrastructure. Confirm it is
pre-deployed and accessible to attendee users before the session; attendees do
not deploy the class themselves.

## Maintainer regression matrix

| Area | Required behavior |
|---|---|
| Role derivation | Properties, labels, formatting, sorting, insight context, and actions match the prompt; no canonical sales leakage into unrelated prompts |
| SDK startup | Delayed SDK and binding assignments converge on one registration |
| Registration | Subscription and loading precede registration; synchronous `dataUpdate` remains final |
| Query order | Every dimension precedes every measure; role indexes match the final order |
| Missing mapping | No query runs; stale rows/features clear; visible configuration error reaches terminal lifecycle state |
| Rebinding | Equivalent assignments do not re-register; unsupported in-place overlap is not advertised |
| Failure | Missing initial data reaches a visible timeout error and `error` lifecycle event |
| Reconnect | Disconnect/reconnect resubscribes without stale rows, promises, timers, or chart DOM |
| Filters | Identified unrelated filters are ignored; relevant and unknown payloads enter refresh state without calling `fetchData()` |
| Dates | `YYYY-MM-DD` retains its day under `TZ=America/Los_Angeles` |
| Result bounds | Client-sorted limited data is described as returned rows, not unsupported global top-N |
| Insight endpoint | New bundles call `RecordInsightGenerator`; old `OpportunityInsightGenerator` imports delegate successfully |
| Insight payload | Generic envelope includes entity, subject, goal, and selected context roles; record strings are treated as data |
| Insight race | Old responses cannot update a newer, closed, refreshed, remapped, or disconnected panel |
| Insight focus | Focus moves to Back and returns to the row trigger or deterministic data heading |
| Action | Target role, kind, API name, and optional prefix come from the prompt; invalid IDs and origins remain unavailable |
| Action grain | A new hidden grouping ID does not change Build 2 row count or grain |
| D3 | Early rows, load rejection, missing API, render failure, resize, and reconnect are generation-guarded; `loaded` follows visual render |
| Beeswarm | Values are finite; categories keep stable colors; pointer-only tooltips are prohibited |
| Bump | Period order, rank direction, ties, gaps, and returned-entity bounds match the contract |
| Chord | Target offset uses source count; both node groups have geometry and role-prefixed text |
| Funnel | Prompt order wins; unknown steps sort last; no implicit terminal-category exclusion |
| Radar | Axis properties match the prompt; scales, directions, and formatters are independent |
| Treemap | Sizes are finite/nonnegative; duplicate child labels stay parent-scoped; hidden visual labels remain in text |
| Sparkline | Real periods sort correctly; synthetic mode is deterministic and visibly disclosed |

## Apex infrastructure checks

Before pre-deploying the head-start classes:

1. Compile `RecordInsightGenerator` and `OpportunityInsightGenerator` together.
2. Call the generic endpoint with a Support Case envelope and verify the result
   does not introduce deal, pipeline, opportunity, or sales-rep language.
3. Call the compatibility endpoint with a legacy flat Opportunity payload.
4. Verify malformed, oversized, connector-failure, and unexpected-failure paths
   return the same bounded user-safe fallback where applicable.
5. Verify an empty generation returns the same bounded user-safe fallback.
6. Confirm the attendee profile or permission set can invoke both Apex classes.

The starter repository has no local Models API mock seam. Do not fabricate a
unit test that cannot run; use the workshop org's normal validation process for
the pre-baked class before the session.

## Accessibility checks

- Data tables use native table, header, and cell semantics.
- Every visible label and programmatic name uses prompt or bound-field language.
- Icon buttons have non-empty, row-specific names with visible wording included
  in the accessible name.
- Insight loading/completion uses status semantics and failures use alert
  semantics.
- Interactive D3 marks have keyboard, focus, and selected-state behavior, or a
  native-control alternative.
- Informative SVGs have a title, description, and textual equivalent; decorative
  sparklines are hidden and accompanied by row summaries.
- Color is never the only way to distinguish categories, sides, or state.
- Focus remains visible and predictable throughout panel swaps.
