# d3-radar — polar multi-metric comparison (industry profile)

**Attribution:** shape adapted from Skip Sauls' `radarChart` in
`aftest/force-app/main/default/lwc/radarChart/` (itself derived from
Nadieh Bremer's D3 radar-chart gist). Skip's version loads D3 from a
CDN and expects data via `@api` — this reference loads D3 the
LWC-native way (per `references/d3-in-lwc.md`) and pulls from the
workshop's Sales Cloud SDM.

**What this teaches:** how to render a radar (spider) chart on polar
coordinates — one axis per metric, one closed polygon per entity
(industry, rep, product line). Great for "how do these two industries
compare across 5 dimensions" — a shape stock Tableau Next won't draw.

**Sales Cloud SDM fit:** one row per `Primary_Industry` (or `Account_Type`,
or `OwnerUser`), with five measures fanned out as axes:
`Win_Rate_clc`, `Avg_Deal_Size_clc`, `Sales_Cycle_clc`,
`Pipeline_Generation_clc`, `Number_of_Opportunities_clc`. All exist in
the workshop template SDM. Attendee prompt shape: *"radar chart
comparing win rate, avg deal size, sales cycle, pipeline, and
opportunity count across industries."*

**Do NOT copy this file verbatim.** SDM apiNames come from discovery.

## Rules

- **Every rule from `references/d3-in-lwc.md` applies** —
  `lwc:dom="manual"`, `loadScript` from `d3` static resource,
  `_pendingRows` buffer, ResizeObserver from the render function.
- **`registerFieldsForQuery`** — five measures on one row per
  industry: one dimension (`Primary_Industry`, `rowGrouping: true`)
  followed by five `_clc` measures (`rowGrouping: false`, NO
  `aggregationType`). Spec order: dim first, all measures last
  (Gate #8).
- **Normalize each axis independently.** Measures have wildly
  different scales — Sales Cycle is 30-90 days, Win Rate is 0.15-0.60.
  Build a per-axis `scaleLinear` with domain `[0, max]` and range
  `[0, radius]`. Never share one scale across all axes.
- **Close the path.** Use `d3.lineRadial().curve(d3.curveLinearClosed)`
  or `d3.curveCardinalClosed` — an unclosed path leaves a gap between
  the first and last axis.
- **Cap entities at 3–4.** More than 4 overlapping polygons is visual
  noise. Use `limit: 4` in `registerFieldsForQuery`, or add a
  post-filter in `_handleDataUpdate` to keep the top N by pipeline.
- **Fill opacity ≤ 0.35** so overlapping polygons remain readable.
  On hover, boost the hovered polygon to 0.7 and dim the others to
  0.1 (Skip's original pattern).

## Annotated snippet — the polar draw

```javascript
_renderChart() {
    const container = this.template.querySelector('.chart-container');
    const { width, height } = container.getBoundingClientRect();
    const radius = Math.min(width, height) / 2 - 40;

    // rows[i] = { industry, winRate, avgDeal, salesCycle, pipeline, oppCount }
    const axes = [
        { key: 'winRate',    label: 'Win Rate'    },
        { key: 'avgDeal',    label: 'Avg Deal'    },
        { key: 'salesCycle', label: 'Sales Cycle' },
        { key: 'pipeline',   label: 'Pipeline'    },
        { key: 'oppCount',   label: '# Opps'      }
    ];
    const angleSlice = (Math.PI * 2) / axes.length;

    // Per-axis scale — each measure normalized to [0, radius].
    const scales = {};
    axes.forEach(({ key }) => {
        scales[key] = d3.scaleLinear()
            .domain([0, d3.max(this.rows, (d) => d[key]) || 1])
            .range([0, radius]);
    });

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

    // Grid circles.
    const levels = 5;
    for (let l = 1; l <= levels; l++) {
        svg.append('circle')
            .attr('r', (radius / levels) * l)
            .attr('fill', 'none').attr('stroke', '#ddd');
    }

    // Axis spokes + labels.
    axes.forEach((axis, i) => {
        const angle = i * angleSlice - Math.PI / 2;
        svg.append('line')
            .attr('x2', Math.cos(angle) * radius)
            .attr('y2', Math.sin(angle) * radius)
            .attr('stroke', '#bbb');
        svg.append('text')
            .attr('x', Math.cos(angle) * (radius + 14))
            .attr('y', Math.sin(angle) * (radius + 14))
            .attr('text-anchor', 'middle').text(axis.label);
    });

    // One polygon per row.
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    const radarLine = d3.lineRadial()
        .curve(d3.curveLinearClosed)
        .radius((d, i) => scales[axes[i].key](d))
        .angle((d, i) => i * angleSlice);

    svg.selectAll('.polygon').data(this.rows).enter()
        .append('path')
        .attr('d', (row) => radarLine(axes.map((a) => row[a.key])))
        .attr('fill', (_, i) => color(i))
        .attr('fill-opacity', 0.35)
        .attr('stroke', (_, i) => color(i))
        .attr('stroke-width', 2);
}
```

## Wiring into the pipeline

```javascript
const specs = [
    { model: `${OBJ_ACCOUNT}.<industry-dim>`,  rowGrouping: true  },
    { model: '<win-rate-apiName>_clc',         rowGrouping: false },
    { model: '<avg-deal-apiName>_clc',         rowGrouping: false },
    { model: '<sales-cycle-apiName>_clc',      rowGrouping: false },
    { model: '<pipeline-apiName>_clc',         rowGrouping: false },
    { model: '<opp-count-apiName>_clc',        rowGrouping: false }
];
// Row shape: [industry, winRate, avgDeal, salesCycle, pipeline, oppCount].
```

## Common surprises

- **All polygons collapse to a dot at center.** A per-axis scale is
  missing or its domain max is 0 — every value normalizes to 0.
  Log the domains to confirm.
- **One axis dominates and the others look flat.** Shared scale
  across axes. Rebuild per-axis scales.
- **The polygon has a big triangular gap.** Missing
  `curveLinearClosed` (or `curveCardinalClosed`).

## See also

- SKILL.md gates: **#7** (registerFieldsForQuery), **#8** (spec order).
- `references/d3-in-lwc.md` — every rule there applies.
- `references/sdm-table.md` — same pipeline shape, different render.
