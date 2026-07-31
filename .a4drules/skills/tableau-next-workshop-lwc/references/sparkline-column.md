# sparkline-column — per-row inline D3 sparkline in a table cell

**Attribution:** shape based on Skip Sauls' `simpleBarChart`
(`aftest/gettingStartedWithExtensions/docs/04-d3-chart.md`), adapted
here for per-row rendering inside a `<td>`. Every rule from
`references/d3-in-lwc.md` still applies — this reference is a
composition, not a replacement.

**What this teaches:** how to render a small (~120×24) inline D3 bar
chart in a table cell — a per-row "sparkline" that visualizes a short
numeric trend alongside the row's other fields. Composes the SDM
query pipeline from `references/sdm-table.md` with the D3-in-LWC
survival rules from `references/d3-in-lwc.md`.

**Do NOT copy this file verbatim.** The `trend` field name is a
placeholder — the actual trend source depends on the SDM (a repeated
numeric measure, a JSON string field, or an array of period-over-
period rollups).

## Rules

- **Every rule from `references/d3-in-lwc.md` applies per row.**
  `lwc:dom="manual"` on each cell's chart container, `_pendingRows`
  buffer for the parent, `ResizeObserver` if the cells resize.
- **Render sparklines from `renderedCallback`,** not from
  `_handleDataUpdate`. `renderedCallback` fires *after* the
  `for:each` has laid down the DOM, so `template.querySelectorAll`
  can find each row's container.
- **Idempotency guard.** A cell's sparkline should render once per
  row-key change; store which `rowKey` each container was drawn
  for and skip if unchanged. Otherwise every LWC re-render redraws
  every cell, and hovering a button flashes them all.
- **`data-row-key` on the cell container** to look up the row
  data during draw.
- **Fixed pixel size.** Sparklines are meant to be dense — 120×24 or
  100×20 pixel dimensions are fine here. This is one of the few
  cases in `references/d3-in-lwc.md` where responsive sizing is
  *not* required (the cell width is controlled by the parent
  table's column sizing).
- **No axes, no labels, no tooltip.** Sparklines are one visual
  glance. If you find yourself adding a tooltip or a y-axis, you
  want a full chart, not a sparkline — see
  `references/d3-in-lwc.md`.

## Annotated snippet — per-row draw from renderedCallback

```javascript
renderedCallback() {
    this._tryStartPipeline();
    if (!this._d3Ready || !this.rows.length) return;
    this._drawSparklines();
}

_drawSparklines() {
    const cells = this.template.querySelectorAll('.spark-cell');
    cells.forEach((cell) => {
        const rowKey = cell.dataset.rowKey;
        if (cell.dataset.drawn === rowKey) return;   // Idempotent guard.
        const row = this.rows.find((r) => r.rowKey === rowKey);
        if (!row || !Array.isArray(row.trend) || !row.trend.length) return;
        this._drawSparkline(cell, row.trend);
        cell.dataset.drawn = rowKey;
    });
}

_drawSparkline(container, values) {
    // Clear any prior draw (guard makes this a no-op most of the time).
    container.innerHTML = '';

    const W = 120, H = 24, PAD = 2;
    const max = Math.max(1, ...values);
    const bw  = (W - PAD * 2) / values.length;

    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);
    svg.selectAll('rect')
       .data(values).enter().append('rect')
       .attr('x', (_, i) => PAD + i * bw)
       .attr('y', (v)    => H - (v / max) * (H - PAD * 2) - PAD)
       .attr('width',  Math.max(1, bw - 1))
       .attr('height', (v) => (v / max) * (H - PAD * 2))
       .attr('fill', '#0070d2');
}
```

## Template — chart container per row

```html
<template for:each={rows} for:item="row">
  <tr key={row.rowKey}>
    <!-- ...other cells from references/sdm-table.md... -->
    <td>
      <div class="spark-cell" data-row-key={row.rowKey} lwc:dom="manual"></div>
    </td>
  </tr>
</template>
```

Note the two required attributes on the container:

- `lwc:dom="manual"` — without it, LWC strips the SVG on the next
  reactive update. Silent failure. See `references/d3-in-lwc.md`.
- `data-row-key={row.rowKey}` — how `_drawSparklines` finds the
  matching row data.

## Wiring into the pipeline

Two additions to the `references/sdm-table.md` base:

1. **Query the trend source** — add whichever spec produces the
   numeric series (e.g. a repeated period measure, or a serialized
   array field). Whatever shape the SDM returns, normalize it into
   `row.trend` as a plain JS array in `_handleDataUpdate`.
2. **Import D3** — see `references/d3-in-lwc.md` for `loadScript`
   from the `d3` static resource. Sparklines require D3 to be ready
   before `_drawSparklines` runs — the standard `_pendingRows`
   buffer handles the race.

## Cleanup

Nothing per-row to clean up in `disconnectedCallback` — the sparkline
DOM is inside `lwc:dom="manual"` containers that vanish with the
component. If you added a `ResizeObserver` (rare for sparklines),
disconnect it there.

## See also

- SKILL.md gates: **#3** (SLDS-first styling — sparklines don't need
  extra CSS beyond a fixed width on the `<td>`).
- `references/d3-in-lwc.md` — the full survival guide; every rule
  there applies here per row.
- `references/sdm-table.md` — the underlying query pipeline the
  sparkline attaches to.
