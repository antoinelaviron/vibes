# Workshop and maintainer verification

Use the short path during the live workshop and the regression matrix before
shipping skill or pre-baked infrastructure changes.

The current native-binding foundation completed this gate in
a test org: 14 data-binding bundles passed automated verification,
deployment, and live Tableau Next dashboard testing. This live-proven result
establishes setter-scheduled one-shot startup, without source hydration or
binding signatures, as the required regression contract for later changes.

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

For a media-only video tile, verify supported native and YouTube media, blocked
autoplay recovery, pause controls, and captions separately. Report YouTube CSP
Trusted Site configuration as administrator setup rather than component
behavior. A video tile has no discovery, query, Apex, or SDK path.

`RecordInsightGenerator` is workshop head-start infrastructure. Confirm it is
pre-deployed and accessible to attendee users before the session; attendees do
not deploy the class themselves.

## Native lifecycle gate

Every data-backed bundle must have executable tests or equivalent focused
evidence for all of these behaviors:

1. Each private-backed `@api` setter calls `_scheduleStart()`. Delayed `sdk`,
   model, and role assignments schedule microtasks that converge on exactly one
   startup after connection and complete required mappings.
2. `renderedCallback` does not register fields, fetch data, synchronize query
   state, or invoke the startup path. Render-only D3 and focus work is allowed.
3. Startup does not call or wait for `getDataSource()` or `getJson()`. No
   hydration requirement, hydration helper, binding signature, mapping
   signature, registration queue, or in-place rebinding path exists.
4. Every dimension precedes every measure. Qualified raw measures use supported
   uppercase `aggregationType` enums; bare model calculations omit the property.
5. The registration call includes an explicit limit options object, for example
   `registerFieldsForQuery(specs, sourceName, { limit: QUERY_LIMIT })`.
6. Subscription and loading begin before field registration. A synchronous
   `dataUpdate` emitted during registration remains the final UI state.
7. `dataUpdate` normalization accepts a direct row array, `{ rows: [...] }`, and
   `{ data: [...] }`; tests cover all three shapes.
8. No explicit `fetchData()` follows registration or runs from filters,
   parameters, `renderedCallback`, or another refresh handler.
9. A missing initial update reaches a visible terminal error and emits the
   `error` lifecycle event after exactly eight seconds (`8000` ms).
10. Disconnect/reconnect clears stale rows, feature state, promises, timers, and
    chart DOM, then resubscribes and starts one new registration.

Incomplete required mappings show visible configuration guidance and issue no
query or lifecycle `error`. A materially changed mapping requires the dashboard
runtime to remount the component; tests must not require live hydration or
in-place rebinding.

## Maintainer regression matrix

| Area | Required behavior |
| --- | --- |
| Role derivation | Properties, labels, formatting, sorting, insight context, and actions match the prompt; no canonical sales leakage enters unrelated prompts. |
| Row identity | Every row-per-record surface queries a hidden stable record ID and derives `rowKey` from it alone; visible fields are not treated as unique. |
| Role inheritance | Build 2 and Build 3 preserve every inherited property name, type, requiredness, purpose, semantic role, display behavior, and row key. |
| SDK startup | Setter-scheduled delayed assignments converge on one registration; `renderedCallback` is not a query path. |
| Registration | Subscription and loading precede registration; synchronous `dataUpdate` remains final; the options include `{ limit: QUERY_LIMIT }`. |
| Data updates | Direct arrays, `{ rows: [...] }`, and `{ data: [...] }` all reach the same row mapping. |
| Query order | Every dimension precedes every measure; role indexes match final order; raw aggregation enums are uppercase. |
| Missing mapping | No query runs; visible configuration guidance appears without a lifecycle `error`. |
| Rebinding | Startup runs once per connection; no hydration or binding signature exists; materially changed mappings require a runtime remount. |
| Failure | Missing initial data reaches a visible timeout error and `error` lifecycle event after 8 seconds. |
| Reconnect | Disconnect/reconnect resubscribes without stale rows, promises, timers, callbacks, or chart DOM. |
| Filters | Registered-query refresh arrives through `dataUpdate`; no handler calls `fetchData()`. |
| Dates | `YYYY-MM-DD` retains its day under `TZ=America/Los_Angeles`. |
| Result bounds | Query and display limits are distinct; client-sorted data is described as returned rows, not unsupported global top-N. |
| Insight endpoint | New bundles call generic `RecordInsightGenerator`. |
| Insight payload | The generic envelope includes entity, subject, goal, and selected context roles; record strings are treated as data. |
| Insight race | Old responses cannot update a newer, closed, refreshed, remapped, or disconnected panel. |
| Insight focus | Focus moves to Back and returns to the row trigger or deterministic data heading. |
| Action | Target role, kind, API name, object API name, and optional prefix come from the prompt; invalid IDs and origins remain unavailable. |
| Canonical action example | Only a confirmed Account Log a Call action uses Account, prefix `001`, and `Global.LogACall`; those values are never defaults. |
| Action grain | A new hidden grouping ID remains before measures and does not change Build 2 row count or grain. |
| D3 | Early rows, load rejection, missing API, render failure, resize, and reconnect are generation-guarded; `loaded` follows visual render. |
| Beeswarm | Values are finite; categories keep stable colors; pointer-only tooltips are prohibited. |
| Bump | Period order, rank direction, ties, gaps, and returned-entity bounds match the prompt-derived contract. |
| Chord | Fixtures use unequal source and target cardinalities; target offset uses source count; both node groups have geometry; the matrix is symmetric. |
| Funnel | Prompt order wins; unknown steps sort last; no implicit terminal-category exclusion occurs. |
| Radar | Axis properties match the prompt; scales, directions, and formatters are independent. |
| Treemap | Sizes are finite and nonnegative; duplicate child labels stay parent-scoped; hidden visual labels remain in text. |
| Kanban | When requested, inherited insight/action behavior remains intact; IDs are sanitized and unique; select-plus-Move works without drag and announces the result. |
| Video security | Exact supported YouTube hosts and safe native URLs pass; lookalikes, unsafe protocols, credentials, ports, disallowed query strings, and fragments fail before DOM assignment; embeds use the fixed YouTube origin and `strict-origin-when-cross-origin`, while native media uses `no-referrer`. |
| Video playback | Setter changes reapply native DOM properties and call `load()` only on source changes; blocked autoplay exposes visible Play recovery and controls; hidden controls never remove the Pause path. |
| Video captions | A safe `.vtt` `captionUrl` produces an authored WebVTT track for native video, or caption unavailability is stated; YouTube authored captions are verified separately. |

## Apex infrastructure checks

Before pre-deploying the head-start class:

1. Compile `RecordInsightGenerator`.
2. Call the generic endpoint with a Support Case envelope and verify the result
   does not introduce deal, pipeline, opportunity, or sales-rep language.
3. Verify malformed, oversized, connector-failure, and unexpected-failure paths
   return the same bounded user-safe fallback where applicable.
4. Verify an empty generation returns the same bounded user-safe fallback.
5. Confirm the attendee profile or permission set can invoke the Apex class.

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
- Informative SVGs have a title, description, and textual equivalent.
- Color is never the only way to distinguish categories, sides, or state.
- Focus remains visible and predictable throughout panel swaps.
- Kanban movement has a non-drag keyboard path, visible instructions, and a live
  announcement.
- Autoplaying or moving media always has an operable pause control; blocked
  autoplay recovery and caption availability are visible and programmatic.

For pre-baked Apex changes, run the project's available org validation or a
dry-run deploy against the workshop org. The starter has no local connector mock
seam, so do not fabricate an un-runnable Apex exception test.
