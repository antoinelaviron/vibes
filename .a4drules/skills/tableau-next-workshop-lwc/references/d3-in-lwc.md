# D3 in LWC: lifecycle and accessibility

Read this shared reference with every D3 chart pattern. It owns external-script
loading, early-data buffering, resize behavior, cleanup, and the minimum
accessible graphic contract. Chart references own only semantic roles and
layout algorithms.

This reference composes with the native controller's `_runGeneration` and
`_isCurrentRun` names. In hard-coded recovery mode, use its
`_pipelineGeneration`/`_isCurrentPipeline` equivalents consistently; do not mix
the two naming schemes in one component.

## Contents

- [Rules](#rules)
- [Generation-guarded load](#generation-guarded-load)
- [Render and resize](#render-and-resize)
- [Accessible graphic contract](#accessible-graphic-contract)
- [Cleanup](#cleanup)
- [Common failures](#common-failures)

## Rules

- Load D3 from the `d3` static resource with `loadScript(this, D3)`. Do not use
  a CDN or append a file suffix to the static-resource URL.
- Start D3 loading from the same delayed-sdk/binding synchronization path used
  by `sdm-data-binding.md`. `sdk` can be undefined in `connectedCallback`, so a
  D3-only one-shot there is incorrect.
- Guard the load promise with the component connection generation. A stale
  resolution or rejection must not mutate a disconnected/reconnected instance.
- After load, require `window.d3` and every API used by the selected chart.
- Buffer the newest early `dataUpdate` while D3 is unavailable, then process it
  after successful load.
- Preserve a terminal D3 load/render error; all filter, parameter, and data
  handlers return while `_d3Failed` so later SDK callbacks cannot replace it.
- Put `lwc:dom="manual"` on every imperative chart container.
- Schedule chart rendering after reactive `hasData` state commits.
- Attach `ResizeObserver` only after the gated chart container exists. Make its
  setup idempotent and generation-guarded.
- Read responsive dimensions from `getBoundingClientRect()`. Compact
  sparklines are the deliberate fixed-size exception.
- Scoped CSS does not style imperatively-created external nodes. Prefer SVG
  attributes and classes created inside the manual container; style a detached
  tooltip through `.style.*` when needed.
- Avoid `url(#id)` fragment references for gradients, masks, and clips across
  the synthetic shadow boundary.
- On disconnect, clear pending rows, mapped rows, state flags, summaries,
  queued focus/render keys, manual SVG, tooltip, resize observer, and timers.
  Reset load guards so reconnect can retry.
- Clear the prior chart tree at the start of every full render, or use an
  idempotent data join. Resize and filter redraws must not append duplicate
  SVGs or duplicate title/description IDs.

## Generation-guarded load

```javascript
import { loadScript } from 'lightning/platformResourceLoader';
import D3_RESOURCE from '@salesforce/resourceUrl/d3';

// Emit the exact D3 exports used by the selected chart.
const CHART_REQUIRED_D3_APIS = ['scaleLinear', 'axisBottom'];

_ensureD3(generation) {
    if (this._d3Ready || this._d3LoadStarted) return;
    this._d3LoadStarted = true;
    loadScript(this, D3_RESOURCE)
        .then(() => {
            if (!this._isCurrentRun(generation)) return;
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
                this._processRowsForChart(rows);
            }
        })
        .catch((error) => {
            if (!this._isCurrentRun(generation)) return;
            this._d3LoadStarted = false;
            this._d3Failed = true;
            this._showError(`Unable to load chart library: ${error.message}`);
        });
}

_isCurrentRun(generation) {
    return this._connected && generation === this._runGeneration;
}
```

Do not call a second query after D3 loads. The registered query starts through
the binding controller; buffering handles whichever asynchronous operation
finishes first.

Do not replace the native `_handleDataUpdate` from `sdm-data-binding.md`. Add
the D3 buffer after its registration/signature/error checks and immediately
before `_processRows`:

```javascript
if (this._d3Failed) return;
if (!this._d3Ready) {
    this._pendingRows = rows;
    return;
}
this._processRowsForChart(rows);
```

`_processRowsForChart` maps rows and handles no-data, but does not emit
`loaded`. The chart renderer owns the successful terminal lifecycle event.
Override the native filter and parameter callbacks with the same `_d3Failed`
guard before they enter loading state.

## Render and resize

```javascript
_scheduleChartRender() {
    const generation = this._runGeneration;
    Promise.resolve().then(() => {
        if (!this._isCurrentRun(generation) || this._d3Failed) return;
        try {
            this._renderChart();
            this._setupResizeObserver(generation);
            this.sdk.actions?.notifyLifecycleChange?.('loaded');
        } catch (error) {
            this._d3Failed = true;
            this._showError(`Unable to render chart: ${error.message}`);
        }
    });
}

_setupResizeObserver(generation) {
    const element = this.template.querySelector('.chart-container');
    if (!element || this._resizeObservedElement === element) return;
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
            if (this._isCurrentRun(generation) && !this._d3Failed) {
                this._rerenderIfReady();
            }
        }, 150);
    });
    this._resizeObserver.observe(element);
    this._resizeObservedElement = element;
}
```

Inside each `_renderChart`, start with
`const d3 = this._d3; container.innerHTML = '';`. This makes chart-specific
snippets that use `d3.*` explicit and makes a full redraw idempotent.

Emit `loaded` only after the chart actually renders. A mapped row set is not a
successful visual render when D3 fails.

## Accessible graphic contract

For each chart, choose one of these strategies:

1. Give the SVG `role="img"`, a prompt-derived `<title>` and `<desc>`, and
   provide an adjacent textual summary or table containing the meaningful
   values.
2. Mark the SVG `aria-hidden="true"` when adjacent visible/assistive content is
   the complete equivalent.

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
    this._runGeneration += 1;
    this._d3Ready = false;
    this._d3LoadStarted = false;
    this._d3Failed = false;
    this._pendingRows = null;
    this.rows = [];
    this._isLoading = false;
    this._hasData = false;
    this._hasNoData = false;
    this._chartSummary = '';
    this._focusedMarkKey = null;
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._resizeObservedElement = null;
    clearTimeout(this._resizeTimer);
    this._tooltip?.remove();
    this._tooltip = null;
    const container = this.template.querySelector('.chart-container');
    if (container) container.innerHTML = '';
}
```

Call this from the component's existing `disconnectedCallback`; do not create a
second lifecycle callback.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| Chart never starts | D3 load was gated only in `connectedCallback` before SDK injection | Start through the delayed binding controller |
| Chart is empty after rows arrive | Data beat the library load | Buffer the newest payload until D3 is ready |
| Chart vanishes after state change | Missing `lwc:dom="manual"` | Mark every imperative container |
| Resize does nothing | Observer attached before the gated container existed | Attach after a successful render |
| Reconnect shows stale chart | Pending data, manual DOM, or load guards survived disconnect | Run complete cleanup and generation checks |
| Loading ends before any SVG exists | Lifecycle emitted after row mapping | Emit `loaded` only after chart render |
| Tooltip works only with a mouse | No focus equivalent | Add focus/blur behavior or a native-control alternative |
