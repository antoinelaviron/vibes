# Per-row D3 sparkline column

Use a sparkline column when each table row needs a compact numeric trend. This
composes the role-derived table with `d3-in-lwc.md`; it does not replace either
contract.

## Contents

- [Choose a data mode](#choose-a-data-mode)
- [Rendering rules](#rendering-rules)
- [Idempotent draw](#idempotent-draw)
- [Template](#template)
- [Verification](#verification)

## Choose a data mode

### Real series

Require these semantic roles:

| Property | Type | Purpose |
|---|---|---|
| `entityField` | `SemanticDimension` | Groups points into one table row |
| `periodField` | `SemanticDimension` | Orders points within each trend |
| `valueField` | `SemanticMeasure` | Sparkline value |

Query both dimensions before the measure, map to `{ entity, period, value }`,
sort periods using the prompt-confirmed order, and group points into
`row.trend`.

### Synthetic workshop demo

Use synthetic mode only when the attendee explicitly asks for a visual demo
without historical data. Derive a deterministic sequence from a stable row
identity plus the current endpoint value. Never use query index or
`Math.random()`.

Require visible column text such as `Simulated 12-point demo trend` and per-row
assistive text stating that values are simulated from the current value, not
historical observations. The point count comes from the prompt; 12 is not a
universal default.

## Rendering rules

- Apply every applicable lifecycle rule in `d3-in-lwc.md` per row.
- Draw after the `for:each` DOM exists in `renderedCallback`.
- Use `lwc:dom="manual"` and `data-row-key` on every spark container.
- Track a trend signature, not only the row key. A filter can change trend
  values while preserving identity.
- Keep the SVG compact and decorative. Put its complete meaning in adjacent
  per-row assistive text. In synthetic mode, also render the required disclosure
  visibly in the column header or caption.
- Place the concise assistive summary immediately before the decorative
  sparkline in the same table cell so reading order matches visual placement.
- Do not add axes or hover-only tooltips. If more detail is needed, use a full
  chart.

## Idempotent draw

```javascript
_drawSparklines() {
    const cells = this.template.querySelectorAll('.spark-cell');
    cells.forEach((cell) => {
        const row = this.rows.find(
            (candidate) => candidate.rowKey === cell.dataset.rowKey
        );
        const values = Array.isArray(row?.trend)
            ? row.trend.filter((value) => Number.isFinite(value))
            : [];
        if (!values.length) {
            cell.innerHTML = '';
            delete cell.dataset.trendSignature;
            return;
        }

        const signature = JSON.stringify(values);
        if (cell.dataset.trendSignature === signature) return;
        this._drawSparkline(cell, values);
        cell.dataset.trendSignature = signature;
    });
}

_drawSparkline(container, values) {
    container.innerHTML = '';
    const d3 = this._d3;
    const width = 120;
    const height = 24;
    const padding = 2;
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const barWidth = (width - padding * 2) / values.length;
    const y = d3.scaleLinear()
        .domain(min === max ? [min - 1, max + 1] : [min, max])
        .range([height - padding, padding]);
    const baseline = y(0);

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('aria-hidden', 'true');
    svg.selectAll('rect')
        .data(values)
        .enter()
        .append('rect')
        .attr('x', (value, index) => padding + index * barWidth)
        .attr('y', (value) => Math.min(y(value), baseline))
        .attr('width', Math.max(1, barWidth - 1))
        .attr('height', (value) => Math.max(1, Math.abs(y(value) - baseline)))
        .attr('fill', 'currentColor');
}
```

## Template

```html
<th scope="col">{trendColumnLabel}</th>
<!-- Per row: -->
<td>
  <span class="slds-assistive-text">{row.trendAccessibleSummary}</span>
  <div
    class="spark-cell"
    data-row-key={row.rowKey}
    lwc:dom="manual"
    aria-hidden="true"
  ></div>
</td>
```

## Verification

- Real points sort by the confirmed period semantics.
- Changed values redraw even when `rowKey` is unchanged.
- Synthetic values are deterministic and end at the current value.
- Synthetic disclosure is visible and included in each row's assistive text.
- Decorative SVGs are hidden from assistive technology; equivalent summaries
  remain available.
