# d3-funnel — pipeline funnel by opportunity stage

**Attribution:** shape adapted from Skip Sauls' `funnelChart` in
`aftest/force-app/main/default/lwc/funnelChart/`. Skip's version
already uses `loadScript` — the LWC-native pattern is intact here.
The change is wiring it to the workshop's Sales Cloud SDM instead of
an `@api` data prop.

**What this teaches:** how to render a sales funnel — trapezoids
stacked top-to-bottom, each stage's width proportional to the number
of opportunities in it. Sales-native chart type that isn't a native
Tableau Next viz; makes an obvious "look how many prospects fall out
between Discovery and Proposal" story.

**Sales Cloud SDM fit:** rollup grouped by `Opportunity_Stage`, count
via `Number_of_Opportunities_clc`. Both exist in the workshop
template SDM. Attendee prompt shape: *"funnel chart showing how many
opportunities are in each stage."*

**Do NOT copy this file verbatim.** SDM apiNames come from discovery.

## Rules

- **Every rule from `references/d3-in-lwc.md` applies** —
  `lwc:dom="manual"` on the chart container, `_pendingRows` buffer,
  D3 via `loadScript` from the `d3` static resource, ResizeObserver
  from the render function.
- **`registerFieldsForQuery`** — one dimension (`Opportunity_Stage`,
  `rowGrouping: true`), one calc measure (`Number_of_Opportunities_clc`,
  `rowGrouping: false`, NO `aggregationType`). Two specs total.
- **Sort by canonical stage order,** not by count. The SDM returns
  stages alphabetically; a "funnel" whose rows are in random order
  reads as noise. Keep a `STAGE_ORDER` const in the LWC:
  `['Prospecting', 'Qualification', 'Needs Analysis',
    'Value Proposition', 'Proposal', 'Negotiation', 'Closed Won',
    'Closed Lost']` and sort by index. Unknown stages go last.
- **Trapezoid, not rectangle.** Each row's width tapers to the next
  row's width — the visual "funneling" effect. Skip's shape:
  `topWidth = maxWidth * (1 - i/N * 0.7)`,
  `bottomWidth = maxWidth * (1 - (i+1)/N * 0.7)`. Adjust the `0.7`
  taper factor to taste.
- **Two labels per step** — stage name centered, count on the line
  below at ~13px. Both need `pointer-events: none` so the click
  handler on the trapezoid still fires.
- **Optional: hide Closed Lost from the funnel.** It's not a step in
  the funnel; it's the sideways exit. Filter it out of the rendered
  data before `.forEach`, or render it separately with a distinct
  color if you want to show it.

## Annotated snippet — the trapezoid stack

```javascript
_renderChart() {
    const container = this.template.querySelector('.chart-container');
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 40, right: 20, bottom: 20, left: 20 };
    const chartW = width - margin.left - margin.right;
    const chartH = height - margin.top - margin.bottom;

    // Sort by canonical stage order — see STAGE_ORDER const.
    const rows = [...this.rows].sort(
        (a, b) => (STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
    );

    const stepH   = chartH / rows.length;
    const maxW    = chartW;
    const minW    = chartW * 0.3;
    const color   = d3.scaleLinear()
        .domain([0, rows.length - 1])
        .range(['#1B96FF', '#032D60']);

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    rows.forEach((row, i) => {
        const y = i * stepH;
        const topRatio    = 1 - (i     / rows.length) * 0.7;
        const bottomRatio = 1 - ((i+1) / rows.length) * 0.7;
        const topW    = minW + (maxW - minW) * topRatio;
        const bottomW = minW + (maxW - minW) * bottomRatio;
        const topX    = (chartW - topW) / 2;
        const botX    = (chartW - bottomW) / 2;

        const trap = [
            [topX,             y            ],
            [topX + topW,      y            ],
            [botX + bottomW,   y + stepH    ],
            [botX,             y + stepH    ]
        ];

        g.append('path')
            .attr('d', d3.line()(trap) + 'Z')
            .attr('fill', color(i))
            .attr('stroke', '#fff').attr('stroke-width', 2);

        g.append('text')
            .attr('x', chartW / 2).attr('y', y + stepH / 2 - 4)
            .attr('text-anchor', 'middle').attr('fill', '#fff')
            .attr('font-size', 16).attr('font-weight', 500)
            .attr('pointer-events', 'none')
            .text(row.stage);

        g.append('text')
            .attr('x', chartW / 2).attr('y', y + stepH / 2 + 14)
            .attr('text-anchor', 'middle').attr('fill', '#fff')
            .attr('font-size', 13).attr('opacity', 0.9)
            .attr('pointer-events', 'none')
            .text(row.oppCount);
    });
}
```

## Wiring into the pipeline

```javascript
const specs = [
    { model: `${OBJ_OPPORTUNITY}.<stage-dim>`, rowGrouping: true  },
    { model: '<opp-count-apiName>_clc',         rowGrouping: false }
];
// Row shape: [stage, oppCount].
```

Row mapping in `_handleDataUpdate`:
`{ stage: r[IDX.STAGE], oppCount: Number(r[IDX.COUNT]) || 0 }`.

## Common surprises

- **Trapezoids are horizontal rectangles.** Missing the taper —
  `topWidth` and `bottomWidth` returning the same value. Verify
  `bottomRatio` decreases with `i`.
- **Stages appear in the wrong order.** SDM returned alphabetical.
  Sort by `STAGE_ORDER` index before rendering.
- **Text labels don't respond to hover.** Missing
  `pointer-events: none` — text is intercepting mouse events.

## See also

- SKILL.md gates: **#7** (registerFieldsForQuery), **#8** (spec order).
- `references/d3-in-lwc.md` — every rule there applies.
- `references/sdm-table.md` — same pipeline, different render.
