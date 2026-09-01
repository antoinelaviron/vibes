# D3 funnel: ordered process steps

Use a funnel when the prompt names an ordered process and a value for each
step. Funnel order is business meaning; never derive it alphabetically or from
returned value size.

## Contents

- [Semantic roles](#semantic-roles)
- [Layout rules](#layout-rules)
- [Core geometry](#core-geometry)
- [Query shape](#query-shape)
- [Verification](#verification)
- [DF26 worked example](#df26-worked-example)

## Semantic roles

| Property | Type | Purpose |
|---|---|---|
| `stepField` | `SemanticDimension` | Ordered process step |
| `valueField` | `SemanticMeasure` | Width and displayed value |

Map rows to `{ step, value }`. Require an explicit ordered list or a confirmed
ordering function in the prompt-derived contract:

```javascript
// Example only. Replace every value with the confirmed prompt order.
const STEP_ORDER = ['<first-step>', '<second-step>', '<third-step>'];
```

Unknown values sort after known steps while retaining deterministic order:

```javascript
function stepIndex(step) {
    const index = STEP_ORDER.indexOf(step);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

const rows = [...this.rows].sort(
    (left, right) => stepIndex(left.step) - stepIndex(right.step)
        || String(left.step).localeCompare(String(right.step))
);
```

Do not exclude a terminal category unless the prompt requests it.

## Layout rules

- Apply every rule in `d3-in-lwc.md`.
- Query the step dimension before the value measure.
- Draw trapezoids whose bottom width approaches the next step's width.
- Display the bound step value and formatted measure value inside each shape.
- Include an SVG title/description and a textual ordered summary so shape and
  color are not the only representations.
- Do not attach click behavior unless the prompt requests filtering or
  selection. If requested, use focusable native controls over or alongside the
  shapes, with keyboard activation and visible focus.

## Core geometry

```javascript
const widthScale = d3.scaleLinear()
    .domain([0, d3.max(rows, (row) => row.value) || 1])
    .range([0, maxWidth]);

rows.forEach((row, index) => {
    const y = index * stepHeight;
    const nextRow = rows[index + 1] || row;
    const topWidth = widthScale(row.value);
    const bottomWidth = widthScale(nextRow.value);
    const topX = (chartWidth - topWidth) / 2;
    const bottomX = (chartWidth - bottomWidth) / 2;
    const polygon = [
        [topX, y],
        [topX + topWidth, y],
        [bottomX + bottomWidth, y + stepHeight],
        [bottomX, y + stepHeight]
    ];

    const centerX = chartWidth / 2;
    const centerY = y + stepHeight / 2;
    group.append('path').attr('d', `${d3.line()(polygon)}Z`);
    group.append('text')
        .attr('x', centerX)
        .attr('y', centerY - 4)
        .attr('text-anchor', 'middle')
        .text(row.step)
        .attr('pointer-events', 'none');
    group.append('text')
        .attr('x', centerX)
        .attr('y', centerY + 14)
        .attr('text-anchor', 'middle')
        .text(this._formatValue(row.value))
        .attr('pointer-events', 'none');
});
```

Choose foreground text per fill so normal-size labels retain at least 4.5:1
contrast. Values must be finite and nonnegative before scaling.

## Query shape

```javascript
const specs = [
    { model: this.stepField.name, rowGrouping: true },
    measureSpecFromBinding(this.valueField, VALUE_ALLOWED_AGGREGATIONS)
];
// Row contract: [step, value].
```

Generate `VALUE_ALLOWED_AGGREGATIONS` from the confirmed funnel value and its
formatter. Do not silently reinterpret a monetary value as a count.

## Verification

- Known steps follow the confirmed order.
- Unknown steps appear last, not first.
- Prompt-specific exclusions are explicit.
- Value formatting and visible/accessibility labels use the binding contract.
- Any filtering interaction has a keyboard-equivalent control.

## DF26 worked example

For an opportunity pipeline funnel, map step to stage and value to opportunity
count, and confirm the exact sales-stage order. `Closed Lost` is excluded or
separated only if the attendee requests that presentation.
