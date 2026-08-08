# d3-in-lwc — drawing with D3 inside an LWC (shadow-DOM survival guide)

**Attribution:** distilled from an internal reference project —
specifically its guidance on the
"D3 / SVG inside LWC shadow DOM" pattern and the `_pendingRows`
lifecycle pattern, plus a `simpleBarChart` walkthrough.

**What this teaches:** how to render a D3 chart inside an LWC and
have it survive re-renders, cell resizes, and the race between async
library load and async SDK data. LWC's synthetic shadow DOM breaks
several common D3 patterns silently — this reference documents the
workarounds.

**Do NOT copy this file verbatim.** Static-resource names, chart
dimensions, and SDM field references are placeholders — everything
org-specific comes from the attendee's org and discovery hand-off.

## Rules

- **Load D3 via `loadScript`** from a static resource named `d3`.
  Chain from `connectedCallback`; nothing that depends on D3 runs
  before the `.then` fires.
- **Any container you populate imperatively needs `lwc:dom="manual"`.**
  Without it, LWC's synthetic shadow DOM strips imperatively-added
  children on the next reactive update. **Silent failure** — no
  error, empty container. This is the #1 D3-on-LWC bug.
- **Buffer early `dataUpdate` events into `_pendingRows`.** The SDK
  can fire `dataUpdate` before `loadScript` resolves. Stash the rows
  in a buffer if `_d3Ready` is false; replay from the `loadScript`
  `.then`.
- **Attach `ResizeObserver` from the render function**, not from
  `connectedCallback` — if the chart container is gated by
  `<template lwc:if={hasData}>`, it doesn't exist yet at
  `connectedCallback` time. Make setup idempotent (track which
  element you're observing).
- **Scoped CSS doesn't reach imperatively-created nodes.** Tooltips
  built with `document.createElement` must be styled via inline
  styles (`.style.left`, `.style.top`, etc.), not a `.css` file.
  The container the tooltip appends to also needs `lwc:dom="manual"`.
- **Avoid `url(#id)`** — clipPath, linearGradient, and mask
  references via `url(#…)` fail across the shadow boundary.
  Workarounds: draw clipping rectangles in the background fill
  color, stack thin colored rects for gradient effects.
- **Prefer responsive sizing.** Read the container's
  `getBoundingClientRect()` at render time; never hardcode pixel
  dimensions to the dashboard cell size.
- **Clean up in `disconnectedCallback`** — disconnect the
  `ResizeObserver`, remove the tooltip node, clear timers.

## Annotated snippet — the lifecycle

```javascript
import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import D3 from '@salesforce/resourceUrl/d3';

connectedCallback() {
    if (!this.sdk) return;
    this._subscribeEvents();                    // Wire sdk.on(...) FIRST
    loadScript(this, D3).then(() => {
        this._d3Ready = true;
        if (this._pendingRows !== null) {       // Replay early rows.
            this._handleDataUpdate(this._pendingRows);
            this._pendingRows = null;
        } else {
            this._registerQuery();
        }
    }).catch((e) => this._showError('D3 failed: ' + e.message));
}

_subscribeEvents() {
    this._unsubscribes.push(
        this.sdk.on('dataUpdate', (rows) => {
            if (!this._d3Ready) {               // Race guard: buffer early rows.
                this._pendingRows = rows;
                return;
            }
            this._handleDataUpdate(rows);
        })
    );
}
```

Template — note `lwc:dom="manual"`:

```html
<div class="chart-container" lwc:dom="manual"></div>
```

## ResizeObserver — set up from the render function

```javascript
_setupResizeObserver() {
    const el = this.template.querySelector('.chart-container');
    if (!el) return;
    if (this._resizeObservedEl === el) return;   // idempotent
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this._rerenderIfReady(), 150);
    });
    this._resizeObserver.observe(el);
    this._resizeObservedEl = el;
}

// Called from _renderChart AFTER the container has been populated —
// which means it exists in the DOM.
_renderChart() {
    /* ...D3 draw code... */
    this._setupResizeObserver();
}
```

## Cleanup

```javascript
disconnectedCallback() {
    this._unsubscribes.forEach((u) => typeof u === 'function' && u());
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObservedEl = null;
    if (this._tooltip) this._tooltip.remove();
    if (this._resizeTimer) clearTimeout(this._resizeTimer);
}
```

## Common surprises

- **Chart renders once, then vanishes on resize.** Missing
  `lwc:dom="manual"` on the chart container.
- **Chart renders empty, D3 loaded fine in console.** `dataUpdate`
  fired before D3 was ready; no `_pendingRows` buffer.
- **Resize does nothing.** `ResizeObserver` attached in
  `connectedCallback` when the gated container didn't exist yet.
  Move setup into `_renderChart`.
- **Tooltip in the wrong place / unstyled.** Scoped CSS doesn't
  reach it — use inline `.style.*`.
- **Console CSP error loading D3.** Static resource not deployed or
  named something other than `d3`.
- **SVG is blank.** Container's `getBoundingClientRect()` returns 0
  width/height — CSS parent chain lacks `min-height: 0` on flex
  containers.

## See also

- SKILL.md — the general SDK pipeline lives in `references/sdm-table.md`;
  D3 layers a rendering path on top of it, but everything about the
  query itself (specs, `IDX`, subscribe-before-register) is unchanged.
- `references/sparkline-column.md` — per-row inline sparklines using
  this same shape.
