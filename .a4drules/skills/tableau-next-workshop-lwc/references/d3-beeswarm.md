# d3-beeswarm — one-dimensional density scatter (deal-size distribution)

**Attribution:** shape adapted from an internal reference `beeswarmChart`
implementation. That version loads D3 from a CDN and uses static country data — this reference
loads D3 the LWC-native way (per `references/d3-in-lwc.md`) and reads
from the workshop's Sales Cloud SDM instead.

**What this teaches:** how to render a 1D density scatter — one dot per
opportunity, positioned by `Total_Amount_clc` on the X axis, colored
by `Opportunity_Stage`, spread on Y via `d3.forceCollide` so dots
don't overlap. Great "look how many deals are stuck at low amount
but a handful huge ones" story with no bucketing.

**Sales Cloud SDM fit:** one row per opportunity — `Opportunity_Id`
(dim), `Opportunity_Stage` (dim, colors), `Total_Amount_clc` (calc
measure, X position). All three exist in the workshop template SDM.
Attendee prompt shape: *"show every opportunity as a dot on an amount
axis, colored by stage."*

**Do NOT copy this file verbatim.** SDM apiNames come from the
discovery hand-off.

## Rules

- **Every rule from `references/d3-in-lwc.md` applies.**
  `lwc:dom="manual"` on the chart container, `_pendingRows` buffer,
  D3 via `loadScript` from the `d3` static resource (not a CDN — the
  analytics iframe's CSP blocks arbitrary CDNs), `ResizeObserver`
  attached from the render function.
- **`registerFieldsForQuery`** — same 5-step pipeline as
  `references/sdm-table.md`. All dimensions first, calc measure last
  (Gate #8). Query one row per opportunity — a raw
  `Opportunity.Opportunity_Id` dimension, NOT a rollup.
- **`d3.forceCollide` runs on the client** — no server-side layout.
  Tick the simulation ~120 times synchronously before drawing;
  animating each tick chokes on 200+ nodes.
- **Cap the row count.** Beeswarm renders every row as a dot — start
  with `limit: 200` in `registerFieldsForQuery`. Above ~500 nodes the
  force simulation gets sluggish on a workshop laptop.
- **Color scale by stage** — `d3.scaleOrdinal(d3.schemeCategory10)`
  keyed on `Opportunity_Stage`. Cache the palette across redraws so
  Closed Won stays green when a filter changes.
- **Tooltip on hover** — position via inline `.style.left/top` (scoped
  CSS won't reach imperatively-created nodes; see `d3-in-lwc.md`).

## Annotated snippet — the force simulation

```javascript
_renderChart() {
    const container = this.template.querySelector('.chart-container');
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 20, right: 20, bottom: 40, left: 20 };

    const xScale = d3.scaleLinear()
        .domain(d3.extent(this.rows, (d) => d.amount))
        .range([margin.left, width - margin.right]);

    // Cluster dots along Y = middle, collide to spread them.
    const sim = d3.forceSimulation(this.rows)
        .force('x', d3.forceX((d) => xScale(d.amount)).strength(1))
        .force('y', d3.forceY(height / 2))
        .force('collide', d3.forceCollide(6))
        .stop();
    for (let i = 0; i < 120; i++) sim.tick();

    const color = d3.scaleOrdinal(d3.schemeCategory10)
        .domain([...new Set(this.rows.map((d) => d.stage))]);

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);

    // X axis at the bottom.
    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).ticks(6, '~s'));

    svg.selectAll('circle')
        .data(this.rows).enter().append('circle')
        .attr('cx', (d) => d.x)                     // set by simulation
        .attr('cy', (d) => d.y)
        .attr('r', 5)
        .attr('fill', (d) => color(d.stage))
        .on('mouseover', (event, d) => this._showTip(event, d))
        .on('mouseout',  () => this._hideTip());
}
```

## Template — one container, `lwc:dom="manual"`

```html
<template lwc:if={_isLoading}>
  <lightning-spinner alternative-text="Loading opportunities" size="small"></lightning-spinner>
</template>
<template lwc:if={hasRows}>
  <div class="chart-container" lwc:dom="manual"></div>
</template>
```

Companion CSS — the container must have a real height, otherwise
`getBoundingClientRect()` returns 0 and the SVG is blank (see
`d3-in-lwc.md` common surprises):

```css
.chart-container { width: 100%; height: 400px; min-height: 0; }
```

## Wiring into the pipeline

Query shape (three specs — all dimensions first, measure last;
Gate #8):

```javascript
const specs = [
    { model: `${OBJ_OPPORTUNITY}.<opportunity-id-dim>`, rowGrouping: true },
    { model: `${OBJ_OPPORTUNITY}.<stage-dim>`,          rowGrouping: true },
    { model: '<amount-calc-apiName>_clc',               rowGrouping: false }
];
// Row shape: [opportunityId, stage, amount].
```

In `_handleDataUpdate`, map to `{ id, stage, amount }` and stash on
`this.rows`. Buffer via `_pendingRows` if `_d3Ready` is false
(D3 still loading — see `d3-in-lwc.md`).

Redraw on filter change: close any tooltip, clear the SVG, rerun
`_renderChart`. The simulation is fast enough at 200 dots that a
full redraw is simpler than animating enter/exit.

## Common surprises

- **All dots pile at X=0.** Amount arriving as strings — coerce with
  `+d.amount` or `Number(d.amount)` in the row mapper.
- **Simulation freezes the tab.** Row count too high — cap
  `registerFieldsForQuery` at `limit: 200` to start. Raise once
  performance is confirmed.
- **Legend colors flip between renders.** `scaleOrdinal.domain()` was
  rebuilt from the new (filtered) row set. Cache the full stage list
  from the first load and reuse it.

## See also

- SKILL.md gates: **#7** (registerFieldsForQuery), **#8** (spec order).
- `references/d3-in-lwc.md` — every rule there applies here.
- `references/sdm-table.md` — the underlying pipeline this replaces
  visually (no table markup in beeswarm — the SVG is the whole widget).
