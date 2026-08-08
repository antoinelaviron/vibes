# d3-chord — circular flow between two categories (type × stage)

**Attribution:** no prior implementation existed in the internal
reference project — this pattern is designed fresh for the DF26
workshop, built on `d3.chord()`/`d3.ribbon()` (D3 core, already in the
`d3` static resource) and the shadow-DOM survival rules in
`references/d3-in-lwc.md`.

**What this teaches:** how to render a chord diagram — arcs around a
circle, one per category value, connected by ribbons whose width
encodes a count. Reads as "how do these two categorical dimensions
relate" in one glance — a shape stock Tableau Next won't draw, and
visually the most unexpected thing in the menu.

**Sales Cloud SDM fit:** rows grouped by `Opportunity_Type` ×
`Opportunity_Stage`, counted via `Number_of_Opportunities_clc`. All
three exist in the workshop template SDM. Attendee prompt shape:
*"chord diagram showing how opportunity type relates to stage."*

**Do NOT copy this file verbatim.** SDM apiNames come from discovery.

## Rules

- **Every rule from `references/d3-in-lwc.md` applies** —
  `lwc:dom="manual"` on the chart container, `_pendingRows` buffer,
  D3 via `loadScript` from the `d3` static resource, ResizeObserver
  from the render function.
- **`registerFieldsForQuery`** — two dimensions (`Opportunity_Type`,
  `Opportunity_Stage`, both `rowGrouping: true`), one calc measure
  (`Number_of_Opportunities_clc`, `rowGrouping: false`, NO
  `aggregationType`). Three specs total, dims first (Gate #8).
- **`d3.chord()` needs one square matrix, not two dimensions.** Build
  a single node list by concatenating both categories'
  values — `nodes = [...typeValues, ...stageValues]` — then a
  `nodes.length × nodes.length` matrix. Fill `matrix[typeIndex][stageIndex]
  = count` for every row; leave every other cell `0` (type↔type,
  stage↔stage, and the mirrored stage→type direction). The matrix
  does not need to be symmetric — `d3.chord()` draws a one-directional
  ribbon fine when only one triangle has values.
- **SDM rows are sparse; the matrix must be dense.** Initialize every
  cell to `0` before filling from rows, or `d3.chord()` throws on
  `undefined`.
- **Color by node, not by ribbon.** `d3.scaleOrdinal(d3.schemeCategory10)`
  keyed on node index; type nodes and stage nodes share the same
  palette, so pick a visually distinct arc color for each of the two
  groups if you want type/stage to read as separate rings.
- **No gradients, no `url(#clip)`.** Both break across the LWC shadow
  boundary (see `d3-in-lwc.md`). Ribbons get a flat fill at ~70%
  opacity so overlaps stay readable — do not attempt a gradient ribbon.
- **Label placement follows the arc's midpoint angle**, flipped
  right-side-up past 180°, or half the labels render upside down.

## Annotated snippet — matrix build + chord layout

```javascript
_renderChart() {
    const container = this.template.querySelector('.chart-container');
    const { width, height } = container.getBoundingClientRect();
    const radius = Math.min(width, height) / 2 - 60;

    // rows[i] = { type: 'New Business', stage: 'Closed Won', count: 4 }
    const typeValues  = [...new Set(this.rows.map((d) => d.type))];
    const stageValues = [...new Set(this.rows.map((d) => d.stage))];
    const nodes = [...typeValues, ...stageValues];

    // Dense NxN matrix, all zero, then fill from sparse rows.
    const matrix = nodes.map(() => nodes.map(() => 0));
    this.rows.forEach((r) => {
        const i = typeValues.indexOf(r.type);
        const j = stageValues.length + stageValues.indexOf(r.stage);
        matrix[i][j] = r.count;
    });

    const chord = d3.chord().padAngle(0.04).sortSubgroups(d3.descending);
    const chords = chord(matrix);

    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(d3.range(nodes.length));
    const arcGen = d3.arc().innerRadius(radius).outerRadius(radius + 12);
    const ribbonGen = d3.ribbon().radius(radius);

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svg.append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

    // Arcs — one per node (type or stage value).
    g.selectAll('.arc').data(chords.groups).enter()
        .append('path').attr('class', 'arc')
        .attr('d', arcGen)
        .attr('fill', (d) => color(d.index))
        .attr('stroke', '#fff');

    // Labels — flipped past 180deg so text stays upright.
    g.selectAll('.arc-label').data(chords.groups).enter()
        .append('text').attr('class', 'arc-label')
        .attr('transform', (d) => {
            const angle = (d.startAngle + d.endAngle) / 2;
            const flip = angle > Math.PI ? 180 : 0;
            const r = radius + 24;
            return `rotate(${(angle * 180) / Math.PI - 90})translate(${r},0)rotate(${flip})`;
        })
        .attr('text-anchor', (d) => ((d.startAngle + d.endAngle) / 2 > Math.PI ? 'end' : 'start'))
        .attr('font-size', 11)
        .text((d) => nodes[d.index]);

    // Ribbons — one per nonzero matrix cell.
    g.selectAll('.ribbon').data(chords).enter()
        .append('path').attr('class', 'ribbon')
        .attr('d', ribbonGen)
        .attr('fill', (d) => color(d.source.index))
        .attr('fill-opacity', 0.7)
        .attr('stroke', (d) => d3.rgb(color(d.source.index)).darker());
}
```

## Wiring into the pipeline

```javascript
const specs = [
    { model: `${OBJ_OPPORTUNITY}.<type-dim-apiName>`,  rowGrouping: true  },
    { model: `${OBJ_OPPORTUNITY}.<stage-dim-apiName>`, rowGrouping: true  },
    { model: '<opp-count-apiName>_clc',                rowGrouping: false }
];
// Row shape: [type, stage, count].
```

Row mapping in `_handleDataUpdate`:
`{ type: r[IDX.TYPE], stage: r[IDX.STAGE], count: Number(r[IDX.COUNT]) || 0 }`.

## Common surprises

- **`d3.chord()` throws on `undefined`.** Matrix not fully
  zero-initialized before filling — every `nodes.length × nodes.length`
  cell needs a value, most of them `0`.
- **Ribbons connect the wrong arcs.** `j` index computed without the
  `stageValues.length` offset — type and stage share one node array,
  so stage indices start after all type indices, not at `0`.
- **Half the labels are upside down.** Missing the `angle > Math.PI`
  flip on the label `rotate()`.
- **Diagram is one giant ribbon, no visible arcs.** Too few distinct
  type/stage values in the data — chord diagrams need at least 3-4
  categories per side to read as anything but a blob.

## See also

- SKILL.md gates: **#7** (registerFieldsForQuery), **#8** (spec order).
- `references/d3-in-lwc.md` — every rule there applies.
- `references/d3-funnel.md` — another categorical-count chart, simpler
  layout, useful for comparing shape complexity.
