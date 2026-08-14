# d3-in-lwc - D3 lifecycle overlay for dashboard extensions

Read this with `sdk-query-lifecycle.md` and a chart-specific reference. The SDK
lifecycle remains authoritative; this reference adds D3 static-resource loading,
imperative SVG rendering, and resize-safe cleanup.

## Contents

- [D3 setup](#d3-setup)
- [Load and data races](#load-and-data-races)
- [Rendering and resize](#rendering-and-resize)
- [Disconnect cleanup](#disconnect-cleanup)
- [Category-heavy charts](#category-heavy-charts)

## D3 Setup

- Load D3 with `loadScript` from the deployed `d3` static resource, never a CDN.
- Put imperatively populated containers behind `lwc:dom="manual"`; LWC otherwise
  removes SVG children on a reactive render.
- Validate `window.d3` and every D3 API required by the selected chart after
  `loadScript` resolves. A resolved script without the expected global is a
  terminal D3 error, not an empty chart.
- Scoped CSS does not reach imperatively created tooltip nodes. Style those nodes
  inline and remove them during disconnect.
- Avoid SVG `url(#id)` gradients, masks, and clip paths across the shadow
  boundary. Use flat fills or drawn shapes instead.

## Load And Data Races

The SDK can return rows before D3 is ready. Buffer the most recent rows and
drain them after the library is ready. Treat D3 load, deferred render, and resize
work as a second asynchronous lifecycle: each continuation must verify that the
component generation is still current.

```javascript
_d3LoadStarted = false;
_d3Ready = false;
_d3TerminalError = false;
_pendingRows = null;

_loadD3(generation) {
    if (this._d3LoadStarted) return;
    this._d3LoadStarted = true;
    loadScript(this, D3)
        .then(() => {
            if (!this._isCurrentPipeline(generation)) return;
            const d3 = window.d3;
            if (!d3 || typeof d3.select !== 'function' || typeof d3.scaleBand !== 'function') {
                this._setD3TerminalError(new Error('D3 did not load the required chart APIs.'));
                return;
            }
            this._d3Ready = true;
            if (this._pendingRows !== null) {
                this._pendingRows = null;
                if (this.rows.length) this._scheduleChartRender(generation);
            }
        })
        .catch((error) => {
            if (this._isCurrentPipeline(generation)) this._setD3TerminalError(error);
        });
}

_handleDataUpdate(raw, generation) {
    if (!this._isCurrentPipeline(generation) || this._d3TerminalError) return;
    this._clearLoadingTimer();
    const mapped = this._mapRows(raw == null ? [] : raw);
    this.rows = mapped;
    this._isLoading = false;
    this._hasError = false;
    if (!mapped.length) {
        this._pendingRows = null;
        this._clearChart();
        this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.NO_DATA);
        return;
    }
    if (!this._d3Ready) {
        this._pendingRows = mapped;
        return;
    }
    this._scheduleChartRender(generation);
}

_scheduleChartRender(generation) {
    // Let LWC commit rows before querying its manual-DOM container.
    Promise.resolve().then(() => {
        if (!this._isCurrentPipeline(generation) || this._hasError || !this.rows.length) return;
        try {
            this._renderChart(generation);
            this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.LOADED);
        } catch (error) {
            this._setD3TerminalError(error);
        }
    });
}

_setD3TerminalError(error) {
    this._d3TerminalError = true;
    this._setTerminalError(error, 'Visualization failed to load. Please retry.');
}

_clearChart() {
    this._chartSummary = null;
    const container = this.template.querySelector('.chart-container');
    if (container) container.replaceChildren();
}
```

In the component's `_setLoadingState(generation)`, add this first line before
clearing an existing error. It prevents later filter or parameter callbacks from
replacing the terminal D3 error with a spinner:

```javascript
if (this._d3TerminalError) return;
```

Start `_loadD3(generation)` from `renderedCallback`, not `connectedCallback` or
`_runPipeline`: `loadScript` needs a rendered component. Capture the same
pipeline generation that owns the SDK query and start D3 once per generation:

```javascript
_d3Generation = null;

renderedCallback() {
    this._tryStartPipeline();
    const generation = this._pipelineGeneration;
    if (this._pipelineStarted && generation && this._d3Generation !== generation) {
        this._d3Generation = generation;
        this._loadD3(generation);
    }
}
```

If an old unresolved load becomes stale on disconnect, reset `_d3Generation` and
the load guard so reconnect can retry.

## Rendering And Resize

Set up `ResizeObserver` after the chart container exists, normally inside
`_renderChart`. Make observer setup idempotent and generation-guard the delayed
resize render.

```javascript
_setupResizeObserver(generation) {
    const element = this.template.querySelector('.chart-container');
    if (!element || this._resizeObservedEl === element) return;
    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
            if (
                this._isCurrentPipeline(generation) &&
                this._d3Ready &&
                !this._hasError &&
                this.rows.length
            ) {
                this._scheduleChartRender(generation);
            }
        }, 150);
    });
    this._resizeObserver.observe(element);
    this._resizeObservedEl = element;
}
```

Read `getBoundingClientRect()` at render time. A zero-size container often means
a flex parent needs `min-height: 0`, not that the D3 scales are wrong. Before
each redraw, remove prior SVG children from the manual container; do not append
a second chart on top of the first.

## Disconnect Cleanup

Alongside SDK cleanup, disconnect observers, clear timers, remove tooltips,
clear `_pendingRows` and chart-derived summaries, reset `_d3Ready`,
`_d3LoadStarted`, `_d3Generation`, and `_d3TerminalError`, and empty imperative
SVG containers. This prevents stale data and scripts from appearing after reconnect. Guarding
`_handleDataUpdate` with `_d3TerminalError` prevents SDK callbacks in the same
generation from replacing a terminal D3 failure.

## Category-Heavy Charts

For a bar chart with many categories, use horizontal bars, a minimum vertical
row budget such as 32px, and a scrollable chart region rather than overlapping
x-axis labels. Render category and value text plus an SVG title and description
so color is not the only channel and the graphic has a textual equivalent.
