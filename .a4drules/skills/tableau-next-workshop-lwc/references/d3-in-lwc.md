# D3 in LWC: lifecycle and accessibility

Read this shared reference with every D3 chart pattern. It owns external-script
loading, early-data buffering, resize behavior, cleanup, and the minimum
accessible graphic contract. Chart references own only semantic roles and
layout algorithms.

The native binding controller in `sdm-data-binding.md` remains authoritative for
the SDK query. Its setters schedule one one-shot startup after all required
bindings exist. D3 adds a separate generation only for asynchronous library
loading, rendering, resize work, and reconnect safety; it adds no query startup
or synchronization mechanism.

## Contents

- [Rules](#rules)
- [Generation-guarded load](#generation-guarded-load)
- [Data and render races](#data-and-render-races)
- [Render and resize](#render-and-resize)
- [Accessible graphic contract](#accessible-graphic-contract)
- [Cleanup](#cleanup)
- [Category-heavy charts](#category-heavy-charts)
- [Common failures](#common-failures)

## Rules

- Load D3 from the `d3` static resource with `loadScript(this, D3_RESOURCE)`.
  Do not use a CDN or append a file suffix to the static-resource URL.
- Begin `loadScript` only after LWC has rendered. `renderedCallback` may start
  the generation-guarded D3 load or draw into DOM that now exists, but it must
  never call `_scheduleStart`, `_tryStart`, `registerFieldsForQuery`, or otherwise
  start or synchronize the SDK query.
- Preserve the native setter-scheduled one-shot query lifecycle. D3 readiness
  never causes a second query; the newest early `dataUpdate` waits in a buffer.
- Guard script resolution, rejection, deferred render, resize work, and
  reconnect with a D3 connection generation. Stale work must not mutate a
  disconnected or newer component instance.
- Validate `window.d3` and every D3 API used by the selected chart after
  `loadScript` resolves. A resolved script without the expected global or APIs
  is a terminal D3 error.
- Preserve a terminal D3 load/render error. Data and feature callbacks return
  while `_d3Failed` so a later SDK callback cannot replace the error.
- Put `lwc:dom="manual"` on every imperatively populated chart container.
- Schedule chart rendering after reactive data state commits.
- Attach `ResizeObserver` only after the chart container exists. Make setup
  idempotent and generation-guard delayed resize rendering.
- Read responsive dimensions from `getBoundingClientRect()`.
- Scoped CSS does not style imperatively created external nodes. Prefer SVG
  attributes; style detached tooltips through `.style.*` when needed.
- Avoid `url(#id)` fragment references for gradients, masks, and clips across
  the synthetic shadow boundary. Prefer flat fills or drawn shapes.
- Clear the prior chart tree at the start of every full render, or use an
  idempotent data join. Redraws must not duplicate SVGs or title/description IDs.

## Generation-guarded load

Use a D3-specific generation rather than changing how native bindings schedule
the query:

```javascript
import { loadScript } from 'lightning/platformResourceLoader';
import D3_RESOURCE from '@salesforce/resourceUrl/d3';

// Emit the exact exports used by the selected chart.
const CHART_REQUIRED_D3_APIS = ['scaleLinear', 'axisBottom'];

_d3Generation = 0;
_d3LoadStarted = false;
_d3Ready = false;
_d3Failed = false;
_pendingRows = null;

connectedCallback() {
    this._connected = true;
    this._d3Generation += 1;
    this._scheduleStart();
}

renderedCallback() {
    // Native _tryStart sets _started only after every required binding exists.
    if (!this._started || this._d3Failed) return;
    const generation = this._d3Generation;
    this._ensureD3(generation);
    this._renderIfPending(generation);
}

_isCurrentD3Generation(generation) {
    return this._connected && generation === this._d3Generation;
}

_ensureD3(generation) {
    if (
        !this._isCurrentD3Generation(generation) ||
        this._d3Ready ||
        this._d3LoadStarted ||
        this._d3Failed
    ) {
        return;
    }
    this._d3LoadStarted = true;
    loadScript(this, D3_RESOURCE)
        .then(() => {
            if (!this._isCurrentD3Generation(generation) || this._d3Failed) return;
            const candidate = window.d3;
            const required = ['select', ...CHART_REQUIRED_D3_APIS];
            const missing = required.filter(
                (apiName) => candidate?.[apiName] === undefined
            );
            if (missing.length) {
                throw new Error(`D3 is missing required APIs: ${missing.join(', ')}`);
            }
            this._d3 = candidate;
            this._d3Ready = true;
            if (this._pendingRows !== null) {
                const rows = this._pendingRows;
                this._pendingRows = null;
                this._processRowsForChart(rows, generation);
            }
        })
        .catch((error) => {
            if (!this._isCurrentD3Generation(generation) || this._d3Failed) return;
            this._d3LoadStarted = false;
            this._d3Failed = true;
            this._showError(`Unable to load chart library: ${error.message}`);
        });
}
```

`connectedCallback` above extends the native callback; it does not replace the
setter calls to `_scheduleStart`. Do not also call `_scheduleStart` from
`renderedCallback`. Wait for the native `_started` guard before loading D3 so an
unmapped component remains in configuration state and a D3 failure cannot be
overwritten by later binding assignments. `loadScript` begins in
`renderedCallback` only because it requires a rendered component.

## Data and render races

Keep `eventRows` at the native event boundary. Unwrap direct payloads and
`{ rows: [...] }` or `{ data: [...] }` wrappers before checking D3 readiness or
putting anything in `_pendingRows`:

```javascript
// Capture this value in the native dataUpdate subscription created by _tryStart:
// const generation = this._d3Generation;
// this.sdk.on('dataUpdate', (payload) =>
//     this._handleDataUpdate(payload, generation)
// );
_handleDataUpdate(payload, generation) {
    if (!this._isCurrentD3Generation(generation) || this._d3Failed) return;

    const rows = eventRows(payload);
    if (!this._d3Ready) {
        this._pendingRows = rows == null ? [] : rows;
        return;
    }
    this._processRowsForChart(rows == null ? [] : rows, generation);
}
```

The D3 buffer therefore contains base rows, never an SDK event wrapper. Do not
move wrapper handling into chart-specific row mapping.

Capture the generation when the native `_tryStart` creates its one existing
`dataUpdate` subscription. This guards stale reconnect callbacks but does not
add a subscription, query trigger, or synchronization path. Loading, filter,
and parameter state helpers also return immediately while `_d3Failed` so they
cannot overwrite a terminal D3 error.

`_processRowsForChart` maps and validates rows. For an empty result, it clears
the timer, leaves loading, enters no-data state, and publishes `nodata`. For
positive rows, it keeps `_isLoading = true`, enters data state, and schedules a
render. It does not publish `loaded`; a usable visual render owns that terminal
outcome.
Keep the eight-second watchdog active while positive rows wait for D3 or a
measurable chart container. Clear it immediately for `nodata`, or after a
successful visual render. On timeout, set `_d3Failed = true` before calling
`_showError` so a late script or resize callback cannot replace the terminal
error.

```javascript
// Use this body in the native controller's eight-second timeout callback.
if (this._isLoading) {
    this._d3Failed = true;
    this._showError('Visualization did not become ready within 8 seconds.');
}
```
Client-side sorting, ranking, limiting, and category selection operate only on
the returned rows. Copy must not claim a global top-N unless supported server
ordering is proved.

If reactive state temporarily removes the manual container, set a render-pending
flag. `_renderIfPending` may draw from `renderedCallback` after the container is
present, but it must not synchronize or restart the SDK query.

## Render and resize

```javascript
_scheduleChartRender(generation = this._d3Generation) {
    this._renderPending = true;
    Promise.resolve().then(() => this._renderIfPending(generation));
}

_renderIfPending(generation) {
    if (
        !this._renderPending ||
        !this._isCurrentD3Generation(generation) ||
        !this._d3Ready ||
        this._d3Failed ||
        !this.rows.length
    ) {
        return;
    }

    const container = this.template.querySelector('.chart-container');
    if (!container) return;
    this._setupResizeObserver(container, generation);

    const { width, height } = container.getBoundingClientRect();
    if (width <= 0 || height <= 0) {
        this._chartDiagnostic =
            'Chart container has no measurable size; check its height and flex min-height.';
        return;
    }

    try {
        this._chartDiagnostic = '';
        this._renderChart(container, width, height);
        this._renderPending = false;
        clearTimeout(this._loadingTimer);
        this._loadingTimer = null;
        this._isLoading = false;
        this._hasError = false;
        this._hasData = true;
        this._hasNoData = false;
        this.sdk.actions?.notifyLifecycleChange?.('loaded');
    } catch (error) {
        this._renderPending = false;
        this._d3Failed = true;
        this._showError(`Unable to render chart: ${error.message}`);
    }
}

_setupResizeObserver(element, generation) {
    if (this._resizeObservedElement === element) return;
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
            if (
                this._isCurrentD3Generation(generation) &&
                this._d3Ready &&
                !this._d3Failed &&
                this.rows.length
            ) {
                this._scheduleChartRender(generation);
            }
        }, 150);
    });
    this._resizeObserver.observe(element);
    this._resizeObservedElement = element;
}
```

Give responsive chart regions a concrete height or `min-height`. In a flex
layout, a zero-size measurement often means an ancestor needs `min-height: 0`
or the chart region itself needs a minimum height; it does not imply that the D3
scales are wrong. Keep the visible diagnostic while waiting for the observer to
report usable dimensions. Do not emit `loaded` for a zero-size render.

Inside `_renderChart`, start with
`const d3 = this._d3; container.replaceChildren();`. This makes chart-specific
snippets that use `d3.*` explicit and makes a full redraw idempotent.

## Accessible graphic contract

For each chart, choose one of these strategies:

1. Give the SVG `role="img"`, a prompt-derived `<title>` and `<desc>`, and
   provide an adjacent textual summary or table containing the meaningful
   values.
2. Mark the SVG `aria-hidden="true"` when adjacent visible or assistive content
   is the complete equivalent.

For an interactive chart, keep the SVG presentational and provide adjacent
native controls keyed to the same marks. Do not put interactive descendants
inside an SVG exposed as `role="img"`. The controls provide:

- Native keyboard focus and Enter/Space activation.
- Visible focus styling.
- A row/mark-specific accessible name.
- Focus/blur parity for hover content.
- Programmatic selected state when selection persists.
- Focus restoration by stable mark identity after redraw, or a deterministic
  chart heading/summary fallback when the mark disappears.

Do not rely on color alone. Legends and textual summaries must name each role
or category relationship. Verify 4.5:1 contrast for normal text and 3:1 for
meaningful chart boundaries, states, and focus indicators.

## Cleanup

```javascript
_cleanupD3() {
    this._d3Generation += 1;
    this._d3 = null;
    this._d3Ready = false;
    this._d3LoadStarted = false;
    this._d3Failed = false;
    this._pendingRows = null;
    this._renderPending = false;
    this.rows = [];
    this._chartSummary = '';
    this._chartDiagnostic = '';
    this._focusedMarkKey = null;
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._resizeObservedElement = null;
    clearTimeout(this._resizeTimer);
    this._resizeTimer = null;
    this._tooltip?.remove();
    this._tooltip = null;
    const container = this.template.querySelector('.chart-container');
    if (container) container.replaceChildren();
}
```

Call this from the component's existing `disconnectedCallback` after marking the
component disconnected and performing native query cleanup; do not create a
second lifecycle callback. Resetting the D3 load guards lets reconnect start a
new post-render load, while the native `_started` reset lets setters or
`connectedCallback` schedule one new query startup.

## Category-heavy charts

When categories exceed the available plotting or legend space, change layout
rather than overlapping or truncating every label. For example, use horizontal
bars with a minimum vertical row budget such as 32px and a scrollable chart
region. Let legends and adjacent summaries wrap or scroll, render category and
value text, and keep SVG title/description or a complete textual equivalent.
Color alone is never sufficient, and extending an ordinal palette does not make
an unreadable category-heavy chart usable.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| D3 rejects before rendering | `loadScript` started in `connectedCallback` | Start the D3 load from `renderedCallback` |
| Query starts or registers twice | `renderedCallback` participates in query startup | Keep query startup exclusively setter-scheduled and one-shot |
| Chart is empty after rows arrive | Data beat the library load | Unwrap and buffer the newest base rows until D3 is ready |
| Chart vanishes after state change | Missing `lwc:dom="manual"` | Mark every imperative container |
| Chart remains zero-sized | Chart or flex ancestor has no usable height | Show a diagnostic and set the appropriate height or `min-height` |
| Resize does nothing | Observer attached before the gated container existed | Attach after the rendered container is found |
| Reconnect shows stale chart | Pending data, manual DOM, or load guards survived disconnect | Run complete cleanup and generation checks |
| Loading ends before any SVG exists | Lifecycle emitted after row mapping | Emit `loaded` only after a usable chart render |
| Tooltip works only with a mouse | No focus equivalent | Add focus/blur parity or an adjacent native-control alternative |
