# d3-bump — rank-over-time by account (who moved up, who slipped)

**Attribution:** shape adapted from an internal reference `bumpChart`
implementation. That version is production-scale (~900 lines, full date
parsing, palettes, top-N filtering) — this reference keeps the D3 layout mechanic and simplifies
everything else for workshop scope. Loads D3 the LWC-native way (per
`references/d3-in-lwc.md`) and reads from the Sales Cloud SDM.

**What this teaches:** how to render a bump chart — one polyline per
entity across time buckets, where Y is *rank* (1 = top) rather than
value. Lines that dip and cross tell the "who overtook whom" story
that a stacked-bar or line chart can't. Not a stock Tableau Next viz.

**Sales Cloud SDM fit:** rows grouped by `Close_Date` (quarter or
month) × `Account_Name`, ranked by `Total_Amount_clc`. All three
exist in the workshop template SDM. Attendee prompt shape: *"bump
chart showing how our top 10 accounts have ranked each quarter."*

**Do NOT copy this file verbatim.** SDM apiNames come from discovery.

## Rules

- **Every rule from `references/d3-in-lwc.md` applies** —
  `lwc:dom="manual"`, `_pendingRows` buffer, D3 via `loadScript`,
  ResizeObserver from the render function.
- **`registerFieldsForQuery`** — two dimensions (date, account,
  both `rowGrouping: true`), one calc measure (amount,
  `rowGrouping: false`, NO `aggregationType`). Three specs, dims
  first (Gate #8).
- **Bucket dates client-side.** The SDM returns full timestamps; a
  bump chart needs discrete time buckets (quarter / month). Group by
  a `bucketDate(row.closeDate, 'Quarter')` function in `_handleDataUpdate`.
  See the annotated snippet below for a reference implementation.
- **Rank per bucket, not overall.** For each time bucket, sort
  accounts by amount descending and assign `rank = 1..N`. That per-
  bucket rank is Y, not the amount itself. Key insight: value
  scales are misleading in a bump chart — rank is what makes the
  crossings readable.
- **Filter to top N BEFORE ranking.** With 100 accounts, a bump chart
  is spaghetti. `MAX_TOP_N = 10` is the default. Compute total
  amount per account across all buckets → keep top 10 → then rank
  within each bucket.
- **Handle missing buckets.** If an account has no rows in Q2, its
  rank there is `null` — break the polyline at that point, don't
  interpolate. `d3.line().defined((d) => d.rank != null)`.
- **Curve, don't segment.** `d3.curveMonotoneX` gives the smooth
  "flowing" look that makes bump charts readable. Sharp corners
  (`curveLinear`) turn crossings into visual chaos.
- **Y axis inverted.** Rank 1 is at the top of the chart, rank 10
  at the bottom — `scaleLinear.range([topY, bottomY])`, not the
  other way around.

## Annotated snippet — the rank + line render

```javascript
_renderChart() {
    const container = this.template.querySelector('.chart-container');
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 20, right: 100, bottom: 30, left: 40 };

    // rows[i] = { bucket: '2026 Q1', account: 'Acme', amount: 42000 }
    const buckets = [...new Set(this.rows.map((d) => d.bucket))].sort();

    // Top N accounts by total amount across all buckets.
    const totals = d3.rollup(this.rows, (v) => d3.sum(v, (d) => d.amount), (d) => d.account);
    const topAccounts = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a]) => a);

    // Per-bucket rank map.
    const rankByBucket = new Map();
    buckets.forEach((b) => {
        const inBucket = this.rows
            .filter((d) => d.bucket === b && topAccounts.includes(d.account))
            .sort((a, c) => c.amount - a.amount);
        const m = new Map();
        inBucket.forEach((d, i) => m.set(d.account, i + 1));
        rankByBucket.set(b, m);
    });

    // Build a series per account.
    const series = topAccounts.map((account) => ({
        account,
        points: buckets.map((b) => ({ bucket: b, rank: rankByBucket.get(b).get(account) ?? null }))
    }));

    const xScale = d3.scalePoint()
        .domain(buckets).range([margin.left, width - margin.right]);
    const yScale = d3.scaleLinear()
        .domain([1, topAccounts.length])
        .range([margin.top, height - margin.bottom]);   // 1 at top, N at bottom

    const line = d3.line()
        .defined((d) => d.rank != null)
        .x((d) => xScale(d.bucket))
        .y((d) => yScale(d.rank))
        .curve(d3.curveMonotoneX);

    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(topAccounts);
    const svg = d3.select(container).append('svg')
        .attr('width', width).attr('height', height);

    // X axis (buckets).
    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale));

    // One polyline per account.
    svg.selectAll('.series').data(series).enter()
        .append('path').attr('class', 'series')
        .attr('d', (s) => line(s.points))
        .attr('fill', 'none')
        .attr('stroke', (s) => color(s.account))
        .attr('stroke-width', 2.5);

    // Labels at the last bucket.
    svg.selectAll('.label').data(series).enter()
        .append('text').attr('class', 'label')
        .attr('x', width - margin.right + 6)
        .attr('y', (s) => {
            const last = s.points.slice().reverse().find((p) => p.rank != null);
            return last ? yScale(last.rank) + 4 : null;
        })
        .attr('font-size', 11).attr('fill', (s) => color(s.account))
        .text((s) => s.account);
}
```

## Wiring into the pipeline

```javascript
const specs = [
    { model: `${OBJ_OPPORTUNITY}.<close-date-dim>`, rowGrouping: true  },
    { model: `${OBJ_ACCOUNT}.<account-name-dim>`,    rowGrouping: true  },
    { model: '<amount-calc-apiName>_clc',            rowGrouping: false }
];
// Row shape: [closeDate, account, amount].
// In _handleDataUpdate, bucket closeDate into 'YYYY Q#' and stash on row.bucket.
```

## Common surprises

- **Lines all sit at the top / are horizontal.** Y scale not
  inverted, or rank is `undefined` for most points. Log
  `rankByBucket` to confirm.
- **Spaghetti — 50 lines everywhere.** No top-N filter. Enforce
  `topAccounts.slice(0, 10)`.
- **Line jumps to Y=0 at a gap.** Missing `.defined()` on
  `d3.line()` — the line interpolates across null.
- **Crossings look linear and jagged.** Missing `curveMonotoneX`.

## See also

- SKILL.md gates: **#7** (registerFieldsForQuery), **#8** (spec order).
- `references/d3-in-lwc.md` — every rule there applies.
- `references/sdm-table.md` — same pipeline, different render.
