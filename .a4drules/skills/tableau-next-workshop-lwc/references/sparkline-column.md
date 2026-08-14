# sparkline-column - Inline trend visual in a table row

Read `sdk-query-lifecycle.md`, `sdm-table.md`, and `d3-in-lwc.md` first. This
pattern preserves the `vibeAction` table and renders an inline SVG per row.

## Rendering

Render after the table DOM exists, usually from `renderedCallback`. Mark each
manual-DOM cell with `data-row-key` and only redraw when its row key or trend
values changed. Fixed compact dimensions are appropriate for a table sparkline.

```html
<td>
  <span class="slds-assistive-text">{row.trendDescription}</span>
  <div class="spark-cell" data-row-key={row.rowKey} lwc:dom="manual" aria-hidden="true"></div>
</td>
```

The assistive text is required because the SVG is decorative. Clear imperative
cell content when its data changes and follow `d3-in-lwc.md` for D3 loading and
disconnect cleanup.

## Real Trend Data

When the semantic model supplies a repeated measure, JSON field, or rollups,
normalize that source into `row.trend`. Describe the actual series in
`trendDescription`; do not label it synthetic.

## Synthetic Workshop Demo Mode

The workshop menu can demonstrate a 12-point trend without a historical series.
In that mode, disclose that it is simulated, generate it deterministically from
the stable Opportunity ID plus current amount, and end the series at the current
amount. Never seed from row index or `Math.random()`, because sorting and refresh
would redraw a different history.

```javascript
_seededTrend(opportunityId, amount) {
    const seedText = `${opportunityId || 'missing'}:${amount || 0}`;
    let seed = [...seedText].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
    const next = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const endpoint = Number(amount) || 0;
    return Array.from({ length: 12 }, (_, index) => {
        if (index === 11) return endpoint;
        return Math.max(0, Math.round(endpoint * (0.55 + next() * 0.4)));
    });
}
```

Use visible copy such as `Simulated 12-point demo trend` and per-row assistive
text such as `Simulated trend ending at $5,000; values are not historical data.`
