# Tableau Next Workshop LWC Skill Improvements

## Purpose

This memo records historical findings from implementing and deploying all three
core builds plus the seven extension-menu examples against `26213playground`.
It is a decision record, not implementation authority. The August 31, 2026 live
gate superseded the hydration, rendered-start, signature, and in-place rebinding
recommendations below. Follow `SKILL.md`, `references/sdm-data-binding.md`, and
the contract-equivalent `references/sdk-query-lifecycle.md` instead.

The authoritative default uses native prompt-derived semantic bindings, API
67.0, setter-scheduled one-shot startup from every `@api` accessor plus
`connectedCallback`, no query initiation or synchronization from
`renderedCallback`, no `getDataSource/getJson` hydration, and remounts for
material mapping changes. Historical snippets remain only to explain prior
failures and must not be copied into generated components.

## Highest-Priority Corrections

### 1. Historical proposal: bound optional source hydration

**Superseded by the August 31 live gate.** Do not hydrate in the native-binding
startup path. The validated lifecycle has no `getDataSource/getJson` call.

**Historical context**

`SKILL.md` and `references/sdm-table.md` make `getDataSource()` blocking. The
canonical snippets invoke `getJson()` after it, but do not consistently await
or return its promise:

```javascript
registerDataSource(sourceName);
const src = await sdk.getDataSource?.(sourceName);
src?.getJson?.();
notifyLifecycleChange('init');
subscribe();
registerFieldsForQuery(...);
```

**Observed failure**

If `getDataSource()` never settles, the extension never subscribes, registers
its fields, or starts its loading timeout. An unobserved `getJson()` rejection
can also become an unhandled promise failure. The dashboard tile remains on its
initial spinner indefinitely in the first case.

**Historical recommendation (superseded; do not implement)**

Keep the semantic ordering, but make hydration a short best-effort warmup.
Use a timeout race and continue after timeout or rejection:

```javascript
const HYDRATION_TIMEOUT_MS = 250;

async _hydrateSource(sourceName, generation) {
    try {
        await Promise.race([
            Promise.resolve(this.sdk.getDataSource?.(sourceName)).then((src) =>
                src?.getJson?.()
            ),
            new Promise((resolve) => {
                setTimeout(resolve, HYDRATION_TIMEOUT_MS);
            })
        ]);
    } catch (error) {
        console.warn('[vibeTable] source hydration warning:', error);
    }

    return this._isCurrentPipeline(generation);
}
```

At the time, the proposed pipeline was:

```text
1. registerDataSource(sourceName)
2. bounded, warning-only getDataSource/getJson warmup
3. notifyLifecycleChange('init')
4. subscribe
5. set loading state and timeout
6. registerFieldsForQuery
```

This still honors the HAR-verified registration and subscription ordering while
ensuring the query path remains live.

### 2. Start loading before field registration

**Observed failure**

`registerFieldsForQuery()` may synchronously emit `dataUpdate`. If code starts
the loading state after registration, it can erase a just-received result,
restore the spinner, and later report a false timeout. If it never starts a
timer for the initial request, a missing initial `dataUpdate` leaves an
indefinite spinner.

**Correction**

Call `_setLoadingState()` immediately before `registerFieldsForQuery()`. The
data handler must clear the timer and become the final state if the SDK emits
synchronously. A timer expiry must render a visible error and emit a terminal
`error` lifecycle event.

```javascript
this._subscribeEvents();
this._setLoadingState();
this.sdk.registerFieldsForQuery(specs, SOURCE_NAME, { limit: QUERY_LIMIT });
this._isQueryRegistered = true;
```

The canonical timeout should not silently turn off loading. It should report a
user-safe timeout:

```javascript
_setLoadingState() {
    this.rows = [];
    this._isLoading = true;
    this._hasError = false;
    clearTimeout(this._loadingTimer);
    this._loadingTimer = setTimeout(() => {
        if (!this._isLoading) return;
        this._isLoading = false;
        this._hasError = true;
        this._errorMessage = 'Data refresh timed out';
        this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.ERROR, {
            message: this._errorMessage
        });
    }, LOADING_SAFETY_MS);
}
```

### 3. Make lifecycle and reconnect behavior part of the base pattern

**Partially superseded by the August 31 live gate.** Keep disconnect cleanup,
but use setter-scheduled one-shot startup rather than `renderedCallback`,
hydration, binding signatures, or in-place registration generations.

**Observed failure**

The original reference unsubscribed in `disconnectedCallback()` but retained
`_pipelineStarted`. A component instance that disconnected and reconnected
never subscribed or queried again. Pending SDK/D3 promises could also mutate a
detached component.

**Historical recommendation (partially superseded)**

The canonical scaffold should include connected state and a monotonically
increasing pipeline generation. Every asynchronous continuation checks both.

```javascript
_connected = false;
_pipelineGeneration = 0;

connectedCallback() {
    this._connected = true;
    this._tryStartPipeline();
}

disconnectedCallback() {
    this._connected = false;
    this._pipelineGeneration += 1;
    this._pipelineStarted = false;
    this._isQueryRegistered = false;
    this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    this._unsubscribes = [];
    clearTimeout(this._loadingTimer);
}

_isCurrentPipeline(generation) {
    return this._connected && generation === this._pipelineGeneration;
}
```

Pass the current generation into `_runPipeline`, SDK callbacks, timeout
callbacks, D3 `loadScript` completions, and deferred renders. Disconnect must
also clear data buffered for the prior connection generation.

### 4. Make filter relevance explicit

**Superseded by the August 31 live gate.** Registered-query refresh arrives
through `dataUpdate`. Do not add this filter-relevance loading path to the base
lifecycle.

**Historical context**

The current canonical handler sets loading for every `filterChange`.

**Observed failure**

Filters for unrelated dashboard data can clear the extension, show a spinner,
and eventually report a false timeout even though its registered SDM query was
unaffected.

**Correction**

If the event identifies one or more filtered models, refresh only for fields
in the extension query. Continue treating payloads with no identifiable field
as a safe refresh because their scope is unknown.

```javascript
_isRelevantFilterChange(payload) {
    const models = this._collectFilterModels(payload);
    if (!models.length) return true;
    return models.some(
        (model) =>
            model.startsWith(`${OBJ_OPPORTUNITY}.`) ||
            model.startsWith(`${OBJ_ACCOUNT}.`) ||
            model === 'Total_Amount_clc'
    );
}

this.sdk.on(SDK_EVENTS.FILTER_CHANGE, (payload) => {
    if (this._isQueryRegistered && this._isRelevantFilterChange(payload)) {
        this._setLoadingState();
    }
});
```

Document that a chart using `Number_of_Opportunities_clc` must include that
measure in its relevance set instead.

## Core Build Corrections

### 5. Do not claim globally ranked top-N results without server-side sort

`registerFieldsForQuery(..., { limit: 25 })` limits the server result before
the component can client-sort it by amount. It does not prove that the 25 rows
are the global highest-value opportunities.

**Correction options**

- Prefer a query API that supports descending order on the amount measure
  before applying a limit, if the Tableau Next SDK exposes one for the runtime.
- Otherwise, use accurate language such as:
  `Up to 25 returned opportunities, sorted by displayed amount.`

Do not use `Top 25 opportunities by amount` in captions, headings, or ARIA
labels until query-order evidence exists.

### 6. Format Salesforce date-only values without timezone conversion

`new Date('2026-08-31').toLocaleDateString()` can render August 30 for users
west of UTC.

Use a date-only branch:

```javascript
_formatDate(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    return new Date(value).toLocaleDateString();
}
```

Add a regression test run under a western timezone such as
`TZ=America/Los_Angeles`.

### 7. Add stale-response protection to the Build 2 Insight reference

The original Insight pattern applies every Apex result to shared panel state.
Rapid selection changes or a close during generation allow an older response
to overwrite a newer or closed panel.

Add a request token to `references/apex-insight-panel.md`:

```javascript
_insightRequestToken = 0;

async handleInsightClick(event) {
    const row = this._findRow(event.currentTarget.dataset.rowKey);
    const token = ++this._insightRequestToken;
    this.modalRow = row;
    this.modalOpen = true;
    this.modalLoading = true;

    try {
        const text = await generateInsight({ rowJson: JSON.stringify(payload) });
        if (!this._isCurrentInsightRequest(token, row.rowKey)) return;
        this.modalText = text || '(empty response)';
    } catch (error) {
        if (!this._isCurrentInsightRequest(token, row.rowKey)) return;
        this.modalError = this._toUserMessage(error);
    } finally {
        if (this._isCurrentInsightRequest(token, row.rowKey)) {
            this.modalLoading = false;
        }
    }
}

handleModalClose() {
    this._insightRequestToken += 1;
    // Clear panel state.
}
```

Invalidate the token on filter/parameter refresh and disconnect as well.

### 8. Define keyboard focus for the Insight panel swap

The current panel-swap reference describes visual placement but not focus. The
Insight button is removed when the panel opens, and the Back button is removed
when it closes.

**Correction**

- Save the triggering row key when the panel opens.
- In `renderedCallback`, focus the panel Back control after the panel is in
  the DOM.
- After closing, focus the triggering row's Insight control if still rendered.
- Use data selectors, not fixed DOM order.
- Give the Back icon a non-empty accessible name such as
  `alternative-text="Back to opportunities"`; moving focus to an unnamed
  button does not make the panel understandable to a screen reader.

This makes the panel swap meet ordinary keyboard and screen-reader expectations
without requiring a modal implementation.

### 9. Make the Build 3 action handler validate its target origin and ID

The origin rewrite is correct for analytics iframe hosts, but the reference
silently returns for a missing ID and assumes every origin matches the expected
analytics hostname.

Add guidance to:

- Render the action disabled or omit it when there is no account ID.
- Validate that the rewrite produced a Lightning host before opening.
- Validate the expected Salesforce record-ID shape before opening (for an
  Account action, a 15- or 18-character `001...` ID). Rejecting numeric values
  catches the exact failure where an amount is mapped into `recordId`.
- Use `window.open(url, '_blank', 'noopener')` if platform behavior permits.
- Add a test confirming the ID dimension is before every measure and that the
  generated URL contains an Account ID rather than an amount.

## D3 Reference Corrections

### 10. Treat D3 loading as a second asynchronous lifecycle

`references/d3-in-lwc.md` correctly calls out early data buffering, but it
should also require:

- Validate `window.d3` and the specific APIs needed by the visualization after
  `loadScript` resolves.
- Preserve terminal D3 error state against later SDK/hydration callbacks.
- Guard `loadScript` resolution/rejection, resize callbacks, and queued renders
  with connection generation state.
- Clear `_pendingRows`, mapped rows, summaries, and imperative SVG DOM on
  disconnect so a reconnect cannot display stale data.
- Reset the load-started guard when a pending load becomes stale so reconnect
  can retry.

### 11. Correct the chord matrix reference

`references/d3-chord.md` has two issues.

**Incorrect index offset**

The sample currently uses:

```javascript
const j = stageValues.length + stageValues.indexOf(r.stage);
```

It must use the count of preceding type nodes:

```javascript
const j = typeValues.length + stageValues.indexOf(r.stage);
```

**Zero-size destination arcs**

With `d3.chord()`, populating only `matrix[typeIndex][stageIndex]` can leave
stage arcs with zero geometry. For a relationship diagram where both category
groups must be visible, mirror the count:

```javascript
matrix[typeIndex][stageIndex] += count;
matrix[stageIndex][typeIndex] += count;
```

Update the prose: the matrix is symmetric for readable two-sided geometry,
even though the underlying semantic relationship is Type-to-Stage.

### 12. Require category semantics in chord labels

Color and raw values do not tell an assistive-technology user whether a node
is a Type or Stage. Add a visible legend and kind-prefixed node labels such as
`Opportunity Type: New Business` and `Opportunity Stage: Closed Won`.

### 13. Make D3 bar charts legible at the full result bound

The menu prompt says horizontal bars, which is the safer form for up to 25
categories. State this explicitly in the D3 reference:

- Use a horizontal layout for category-heavy charts.
- Allocate a minimum vertical row height (for example 32px).
- Allow vertical scrolling rather than overlapping 25 x-axis labels.
- Include text values and an SVG title/description so color is not the only
  representation.

## Fun-Menu Corrections

### 14. Label synthetic sparklines as demo data

The menu intentionally instructs the attendee to fake a 12-point trend. That
is appropriate for a visual exercise but should not look like historical
opportunity data.

Amend the prompt and sparkline reference to require:

- Header: `Simulated 12-point demo trend`.
- Per-row assistive text stating values are simulated from the current amount,
  not historical data.
- Deterministic pseudo-random generation seeded with stable
  `Opportunity_Id` plus amount, never raw query index or `Math.random()`.

### 15. Make Kanban's non-drag alternative an explicit requirement

The menu says cards are draggable. Native HTML drag-and-drop is not sufficient
for keyboard users.

Require both:

- Drag-and-drop as optional visual interaction.
- A discrete move control such as Stage select + `Move` button, with a live
  announcement and visible instruction.

Also require sanitized, unique DOM IDs for Stage columns. Raw values such as
`Closed Won` cannot safely be used in `id` or `aria-labelledby`.

### 16. Tighten the video-player reference around trust and autoplay

The reference should define native media URL policy:

- Accept only credential-free absolute `https:` media URLs and same-origin
  `/resource/` paths.
- Reject `http:`, `javascript:`, `data:`, `blob:`, credential-bearing URLs,
  and malformed values before assigning `source.src` or `video.poster`.
- If autoplay is blocked while controls are hidden, show controls and an
  accessible `Play video` action/status rather than swallowing the promise
  rejection.

Keep the fixed-origin YouTube reconstruction approach, but tighten detection:
parse the URL, allow only exact supported YouTube hosts (`youtu.be`,
`youtube.com`, and `www.youtube.com`), then validate/extract the video ID
before building the fixed `youtube.com/embed` URL. A generic `?v=` matcher
misclassifies unrelated URLs.

### 17. Keep source examples internally consistent

The workshop materials currently imply both:

- each fun build starts from `vibeAction`; and
- some D3 examples use a smaller independent pipeline.

State the intended choice per prompt. For example:

- `vibeChart`, `vibeSparkline`, `vibeSearch`, `vibeKanban`, and `vibeTheme`
  preserve the action/Insight table behavior.
- `vibeChord` is allowed to be a purpose-built aggregate visualization, but
  should say explicitly that it replaces the table and does not need the
  action-panel surface.
- `vibeVideo` remains an explicit pure-media exception.

## Apex Reference Corrections

### 18. Define one user-safe fallback contract

The insight Apex reference should catch both generated connector exceptions
and ordinary unexpected exceptions around request creation/invocation. It
should log unexpected errors server-side but return a bounded, user-safe message
to the LWC without exception details.

Suggested contract:

```apex
try {
    // Create request, invoke model, parse response.
} catch (ConnectApi.createGenerations_ResponseException error) {
    return 'Unable to generate insight. Please retry.';
} catch (Exception error) {
    System.debug(LoggingLevel.ERROR, 'Insight generation failed: ' + error);
    return 'Unable to generate insight. Please retry.';
}
```

The actual generated exception type should remain the one supplied by the
target org's Models API classes.

## Implemented Test Contract

These regression cases were carried into `references/test-contract.md`; that
reference is authoritative:

| Area            | Required test or validation                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------- |
| SDK startup     | Delayed SDK and role assignments converge through setters on exactly one registration.           |
| Hydration       | Native startup contains no `getDataSource/getJson` hydration path.                              |
| Registration    | Synchronous `dataUpdate` during registration remains the final state.                           |
| Initial failure | Missing initial `dataUpdate` reaches user-visible terminal error.                               |
| Reconnect       | Disconnect/reconnect subscribes and queries again without stale rows.                           |
| Filters         | Identifiable unrelated filter is ignored; relevant and unknown payloads refresh.                |
| Date-only       | `YYYY-MM-DD` remains the same calendar day under a west-of-UTC timezone.                        |
| Insight         | Old request cannot update newer or closed panel; focus transfers correctly.                     |
| D3              | Data-before-library, D3 rejection/missing API, resize, and disconnect/reconnect are covered.    |
| Chord           | Type offset uses `typeValues.length`; both node groups have nonzero geometry.                   |
| Sparkline       | Synthetic/demo disclosure is visible and accessible; stable seeded values end at amount.        |
| Kanban          | Sanitized ARIA IDs, keyboard/discrete move, visible instruction, and live announcement.         |
| Action URL      | Hidden ID order, encoded valid record ID, valid rewritten origin, and missing/invalid-ID state. |
| Video           | All YouTube forms, allowed/rejected native URLs, source changes, and blocked autoplay.          |
| Apex            | Expected connector and unexpected invocation failures produce the same user-safe fallback.      |
| Bounded data    | Any limited query visibly states its result-set bound and avoids global top-N claims.           |

## Historical Suggested Reference Organization

This proposed split is superseded. The current shared authorities are
`references/sdm-data-binding.md` and the contract-equivalent
`references/sdk-query-lifecycle.md`; do not create or route to the proposed
hydration-era lifecycle file below.

```text
references/
  sdk-lifecycle-hardened.md
  filter-relevance.md
  date-only-formatting.md
  insight-panel-accessibility.md
  test-contract.md
```

The historical proposal above is not current structure.

## Intentional Workshop Tradeoffs to Preserve

These are not defects if labelled clearly:

- Hard-coded SDM source and fields only in explicitly selected recovery mode
  after live discovery.
- Explicit query and display limits; the validated table-derived examples query
  up to 5,000 rows and render every returned row.
- Client-side sort of the returned set, provided it is not called global top-N.
- A deterministic synthetic sparkline, provided it is visibly described as a
  demo rather than historical data.
- Pure `vibeVideo` media tile with no Tableau SDK query.
- API version 67.0 for workshop dashboard-extension bundles.

## Historical Recommended Editing Order

This sequence is retained only as context for the original remediation. It is
not an open implementation plan.

1. Correct the canonical SDK pipeline and table reference first.
2. Update Build 2 Insight and Build 3 action references for stale async work,
   focus, and action validation.
3. Correct D3 lifecycle and chord matrix references.
4. Update fun-menu prompts for bounded results, synthetic data, keyboard moves,
   and media URL safety.
5. Add the shared test contract and require it before deployment.

## Implementation Disposition

The workshop skill was revised after this memo. The following disposition keeps
the findings useful without creating a competing source of canonical code:

| Recommendations | Disposition                                                                                                   | Canonical destination                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1-3             | Superseded by the August 31 live-proven one-shot lifecycle; no hydration or rendered query startup          | `references/sdm-data-binding.md`, `references/sdk-query-lifecycle.md` |
| 4               | Removed from the canonical path; registered-query refresh arrives through `dataUpdate`                        | `references/sdm-data-binding.md`                                 |
| 5-6             | Applied                                                                                                       | `references/sdm-table.md`, `references/smoke-test-query.md`      |
| 7-8             | Applied                                                                                                       | `references/apex-insight-panel.md`                               |
| 9               | Applied with iframe compatibility note                                                                        | `references/salesforce-action-link.md`                           |
| 10-13           | Applied in shared and chord-specific D3 guidance                                                              | `references/d3-in-lwc.md`, `references/d3-chord.md`              |
| 14              | Applied only for synthetic workshop mode                                                                      | `references/sparkline-column.md`                                 |
| 15              | Routed to the workshop menu and maintainer contract                                                           | `references/test-contract.md`, workshop manual                   |
| 16              | Applied                                                                                                       | `references/video-player.md`                                     |
| 17              | Corrected: chart and chord are aggregate exceptions; other listed table patterns retain `vibeAction` behavior | `SKILL.md`, workshop manual                                      |
| 18              | Applied to the pre-baked Apex asset                                                                           | `force-app/main/default/classes/OpportunityInsightGenerator.cls` |

`SKILL.md` remains the routing and critical-gate layer. This memo is a historical
decision record, not an additional implementation reference. Where any earlier
section conflicts with the implementation disposition or the August 31 live
gate, the live-gated references win.
