# d3-treemap — nested rectangles by industry × account

**Attribution:** shape adapted from Skip Sauls' `treemap` in
`aftest/force-app/main/default/lwc/treemap/`. Skip's version pulls
static CSV — this reference reads from the workshop's Sales Cloud
SDM and uses `d3.hierarchy`/`d3.treemap` for a two-level nested view.

**What this teaches:** how to render a treemap — nested rectangles
whose area is proportional to a measure, grouped by a parent
dimension. Great for "where's my revenue concentrated" — one large
rectangle per industry, tiled with smaller rectangles per account.

**Sales Cloud SDM fit:** grouped by `Primary_Industry` (parent) and
`Account_Name` (child), sized by `Total_Amount_clc`. All three exist
in the workshop template SDM. Attendee prompt shape: *"treemap of
revenue by industry and account."*

**Do NOT copy this file verbatim.** SDM apiNames come from discovery.

## Rules

- **Every rule from `references/d3-in-lwc.md` applies** —
  `lwc:dom="manual"`, `_pendingRows` buffer, D3 via `loadScript`,
  ResizeObserver from render function.
- **`registerFieldsForQuery`** — two dimensions (industry then
  account, both `rowGrouping: true`), one calc measure
  (`Total_Amount_clc`, `rowGrouping: false`, NO `aggregationType`).
  Three specs total. Dimensions first (Gate #8).
- **Group the flat rows into a hierarchy on the client.** The SDM
  returns a flat list of `[industry, account, amount]` rows;
  `d3.treemap()` needs a `d3.hierarchy` tree. Build it in JS with a
  synthetic root, one node per industry, and account leaves.
- **`node.sum(value)` before `treemap()`.** Without `sum`, every
  parent's value is 0 and the layout collapses.
- **Use `paddingInner` for gaps between children,** not stroke on
  the rect. Stroke inflates the bounding box and shifts labels.
- **Skip labels that don't fit.** Render account name only when the
  rect is wider than ~60px; otherwise the label overflows into
  neighboring cells. Same for the amount underneath (~40px min).
- **Color palette by parent (industry),** using
  `d3.scaleOrdinal(d3.schemeCategory10)` keyed on `industry`. All
  accounts within one industry get the same color — that's the
  visual grouping.
- **Cap depth at 2.** Deeper hierarchies (industry → account →
  opportunity) render as unreadable slivers at workshop cell sizes.

## Annotated snippet — hierarchy build + layout

```javascript
_renderChart() {
    const container = this.template.querySelector('.chart-container');
    const { width, height } = container.getBoundingClientRect();

    // rows[i] = { industry, account, amount }
    // Group into a tree: root → industry → account.
    const byIndustry = d3.group(this.rows, (d) => d.industry);
    const treeData = {
        name: 'root',
        children: [...byIndustry].map(([industry, accounts]) => ({
            name: industry,
            children: accounts.map((a) => ({
                name: a.account, value: a.amount, industry
            }))
        }))
    };

    const root = d3.hierarchy(treeData)
        .sum((d) => d.value)
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .size([width, height])
        .paddingInner(2)
        .paddingTop((d) => (d.depth === 1 ? 18 : 0))  // room for industry label
        (root);

    const color = d3.scaleOrdinal(d3.schemeCategory10)
        .domain([...byIndustry.keys()]);

    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);

    // Industry banners (depth 1).
    const industries = svg.selectAll('g.industry')
        .data(root.descendants().filter((d) => d.depth === 1))
        .enter().append('g').attr('class', 'industry');
    industries.append('text')
        .attr('x', (d) => d.x0 + 4).attr('y', (d) => d.y0 + 13)
        .attr('font-size', 12).attr('font-weight', 600).attr('fill', '#333')
        .text((d) => d.data.name);

    // Account rectangles (leaves).
    const leaves = svg.selectAll('g.leaf')
        .data(root.leaves()).enter().append('g').attr('class', 'leaf');

    leaves.append('rect')
        .attr('x', (d) => d.x0).attr('y', (d) => d.y0)
        .attr('width',  (d) => d.x1 - d.x0)
        .attr('height', (d) => d.y1 - d.y0)
        .attr('fill', (d) => color(d.data.industry));

    // Labels — only if the rect is big enough.
    leaves.append('text')
        .attr('x', (d) => d.x0 + 4).attr('y', (d) => d.y0 + 14)
        .attr('font-size', 11).attr('fill', '#fff')
        .attr('pointer-events', 'none')
        .text((d) => ((d.x1 - d.x0) > 60 ? d.data.name : ''));
}
```

## Wiring into the pipeline

```javascript
const specs = [
    { model: `${OBJ_ACCOUNT}.<industry-dim>`, rowGrouping: true  },
    { model: `${OBJ_ACCOUNT}.<account-name-dim>`, rowGrouping: true },
    { model: '<amount-calc-apiName>_clc',       rowGrouping: false }
];
// Row shape: [industry, account, amount].
```

## Common surprises

- **Every rectangle is 0×0.** Missed the `.sum()` call before
  `treemap()`. Values never propagate up the tree.
- **Rectangles overlap the industry label.** Missing
  `paddingTop` on depth-1 nodes — no room for the banner.
- **All rectangles have the same color.** `scaleOrdinal.domain([])`
  was empty (or `industry` was `undefined`) at build time.
- **Text labels overflow into neighbors.** Missing the width guard
  (`d.x1 - d.x0 > 60`) — always skip labels that don't fit.

## See also

- SKILL.md gates: **#7** (registerFieldsForQuery), **#8** (spec order).
- `references/d3-in-lwc.md` — every rule there applies.
- `references/sdm-table.md` — same pipeline, different render.
