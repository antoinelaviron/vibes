# D3 beeswarm: one-dimensional distribution

Use a beeswarm when the prompt asks for one mark per item positioned by a
numeric value and optionally grouped by a category. It shows density without
bucket boundaries.

## Contents

- [Semantic roles](#semantic-roles)
- [Layout rules](#layout-rules)
- [Core rendering shape](#core-rendering-shape)
- [Query shape](#query-shape)
- [Verification](#verification)
- [DF26 worked example](#df26-worked-example)

## Semantic roles

| Property | Type | Purpose |
|---|---|---|
| `itemField` | `SemanticDimension` | Stable mark identity |
| `categoryField` | `SemanticDimension` | Optional color grouping |
| `valueField` | `SemanticMeasure` | Horizontal position |

Generate prompt-specific property names when they improve clarity. Keep the
internal role keys `item`, `category`, and `value`. Query both dimensions before
the measure and map rows to `{ item, category, value }`.

Derive the chart title, value formatter, axis label, category legend, and
interaction from the prompt. Do not infer currency from an API name or add a
filter interaction merely because marks are clickable.

## Layout rules

- Apply every lifecycle rule in `d3-in-lwc.md`.
- Use a default result limit of 200; a synchronous force simulation becomes
  sluggish above roughly 500 marks on workshop laptops.
- Coerce finite numeric values before layout and exclude invalid rows with a
  visible result note.
- Position marks with `d3.forceX`, center them with `d3.forceY`, and prevent
  overlap with `d3.forceCollide`.
- Run about 120 ticks synchronously before drawing instead of animating every
  simulation tick.
- Include `forceSimulation`, `forceX`, `forceY`, `forceCollide`, `scaleLinear`,
  `extent`, and `axisBottom` in the required-D3-API check from `d3-in-lwc.md`.
- Give the chart region a concrete or minimum height. If its measured width or
  height is zero, surface the sizing diagnostic from `d3-in-lwc.md` and wait for
  resize rather than running the simulation against a zero-size range.
- Cache the category color domain across filter redraws so a category keeps the
  same color.
- Provide an adjacent item/category/value table or list in addition to the
  visual summary. It preserves every mark's meaning and prevents category from
  being color-only. A visible legend names the category colors.
- For many categories, allow the legend or adjacent list to wrap or scroll;
  never shrink labels into overlap or rely on an expanding color palette alone.

## Core rendering shape

```javascript
const xScale = d3.scaleLinear()
    .domain(d3.extent(this.rows, (row) => row.value))
    .nice()
    .range([margin.left, width - margin.right]);

const nodes = this.rows.map((row) => ({ ...row }));
const simulation = d3.forceSimulation(nodes)
    .force('x', d3.forceX((row) => xScale(row.value)).strength(1))
    .force('y', d3.forceY(height / 2))
    .force('collide', d3.forceCollide(6))
    .stop();
for (let tick = 0; tick < 120; tick += 1) simulation.tick();

const svg = d3.select(container).append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('role', 'img')
    .attr('aria-labelledby', `${this._chartId}-title ${this._chartId}-desc`);

svg.append('title').attr('id', `${this._chartId}-title`).text(this.chartTitle);
svg.append('desc').attr('id', `${this._chartId}-desc`).text(this.chartDescription);

svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat(this._formatValue));

svg.selectAll('circle')
    .data(nodes, (row) => row.item)
    .enter()
    .append('circle')
    .attr('cx', (row) => row.x)
    .attr('cy', (row) => row.y)
    .attr('r', 5)
    .attr('fill', (row) => this._categoryColor(row.category));
```

Start `_renderChart` with `container.innerHTML = ''` for a full redraw. If the
prompt requests interaction, keep the graphic descriptive and render adjacent
native controls for each item. The controls use stable item keys, row-specific
labels, visible focus, and the same filter or selection behavior as pointer
marks.

## Query shape

```javascript
const specs = [
    { model: this.itemField.name, rowGrouping: true },
    { model: this.categoryField.name, rowGrouping: true },
    measureSpecFromBinding(this.valueField, VALUE_ALLOWED_AGGREGATIONS)
];
// Row contract: [item, category, value].
```

If the prompt does not need category color, omit the category role rather than
inventing one. The specs then become item followed by value. Generate
`VALUE_ALLOWED_AGGREGATIONS` from the confirmed value semantics and formatter.

## Verification

- Filter redraw preserves category colors.
- Invalid values cannot reach the simulation.
- Axis and assistive text use the bound value label and selected formatter.
- Hover-only information has a keyboard/focus equivalent.
- Result copy says "up to 200 returned items" rather than claiming a global
  ranking.

## DF26 worked example

For the canonical prompt "show every opportunity as a dot on an amount axis,
colored by stage," map item to opportunity ID, category to stage, and value to
amount. These are example mappings, not defaults.
