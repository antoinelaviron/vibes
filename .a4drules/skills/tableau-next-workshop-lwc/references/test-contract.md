# test-contract - Focused workshop and maintainer verification

This reference preserves the regression knowledge behind the workshop patterns.
It distinguishes quick verification during a one-hour session from focused
maintainer checks. Do not require attendees to run the full matrix before every
deploy.

## Workshop-Time Verification

For every changed data-backed component:

1. Confirm the live discovery hand-off and smoke-test a new query.
2. Deploy only the changed LWC bundle.
3. Add the extension to a dashboard and verify loaded rows, no-data, or a
   visible terminal error state.
4. Change one relevant dashboard filter and confirm the tile redraws.
5. Perform the feature-specific interaction: Insight generation, Log a Call,
   selected visual behavior, or video playback.

For `vibeVideo`, verify a supported URL and report YouTube CSP Trusted Site
configuration separately from component behavior.

## Maintainer Regression Contract

Use the playground's executable components as the lifecycle test harness. The
starter repository intentionally contains documentation and pre-baked Apex, not
the LWC bundles or Jest setup needed to copy those tests.

| Area | Required behavior |
| --- | --- |
| SDK startup | Delayed SDK injection starts one pipeline; a never-settling hydration does not prevent registration. |
| Registration | Loading begins before registration; synchronous `dataUpdate` remains the final UI state. |
| Failure | Missing initial data produces visible terminal error and `error` lifecycle event. |
| Reconnect | Disconnect/reconnect resubscribes and re-registers without stale rows or callbacks. |
| Filters | Clearly unrelated filters do not clear the tile; relevant and unknown payloads enter refresh state. |
| Dates | `YYYY-MM-DD` retains its day with `TZ=America/Los_Angeles`. |
| Insight | Old responses cannot update newer, closed, refreshed, or disconnected panels; focus moves to Back then returns to the trigger. |
| Action | Only valid `001` Account IDs and a validated Lightning origin can open Log a Call. |
| D3 | Data before library load, library rejection/missing APIs, render failure, resize, and reconnect have guarded behavior; `loaded` is emitted only after a rendered chart. |
| Chord | Stage offset uses `typeValues.length`; unequal type/stage cardinalities and both node groups have geometry. |
| Sparkline | Synthetic mode is visibly disclosed, deterministic across sorting, and ends at current amount. |
| Kanban | IDs are sanitized and unique; Stage select plus Move works without drag and announces the result. |
| Video | Supported YouTube forms and allowed native URLs work; lookalikes and unsafe URLs fail closed; blocked autoplay exposes a play action. |
| Apex | Connector and unexpected failures return the same bounded fallback without exposing exception details. |
| Result bounds | Limited queries describe returned data without unsupported global top-N claims. |

## Evidence Commands

Run relevant playground suites without changing that repository:

```bash
TZ=America/Los_Angeles npm run test:unit -- -- --runInBand \
  force-app/main/default/lwc/vibeTable/__tests__/vibeTable.test.js \
  force-app/main/default/lwc/vibeInsight/__tests__/vibeInsight.test.js \
  force-app/main/default/lwc/vibeAction/__tests__/vibeAction.test.js \
  force-app/main/default/lwc/vibeChart/__tests__/vibeChart.test.js \
  force-app/main/default/lwc/vibeChord/__tests__/vibeChord.test.js \
  force-app/main/default/lwc/vibeSparkline/__tests__/vibeSparkline.test.js \
  force-app/main/default/lwc/vibeSearch/__tests__/vibeSearch.test.js \
  force-app/main/default/lwc/vibeKanban/__tests__/vibeKanban.test.js \
  force-app/main/default/lwc/vibeTheme/__tests__/vibeTheme.test.js \
  force-app/main/default/lwc/vibeVideo/__tests__/vibeVideo.test.js
```

For the pre-baked Apex update, run the project's available org validation or a
dry-run deploy against the workshop org. The starter has no local connector mock
seam, so do not fabricate an un-runnable Apex exception test.
