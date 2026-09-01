# D3 bump chart: rank over time

Use a bump chart when the prompt asks how entities move up or down in rank over
ordered periods. Y encodes rank, not the raw measure.

## Semantic roles

| Property | Type | Purpose |
|---|---|---|
| `periodField` | `SemanticDimension` | Time or ordered period |
| `entityField` | `SemanticDimension` | Ranked series |
| `rankingValueField` | `SemanticMeasure` | Value used to rank each period |

Map rows to `{ period, entity, value }`. Derive period grain, period ordering,
rank direction, returned-entity limit, value formatting, and interaction from
the prompt. Clarify them when absent; do not assume quarters, descending value,
or ten entities.

## Layout rules

- Apply every rule in `d3-in-lwc.md`.
- Bucket raw date values only when the prompt requests a time grain. Format
  date-only values without UTC conversion.
- Select a bounded entity set from the returned rows before assigning ranks.
  Describe it as the highest or lowest entities within the returned result, not
  a global top-N unless server ordering is proved.
- Rank independently within each period according to the confirmed direction.
- Use `null` for missing periods and
  `d3.line().defined((point) => point.rank != null)` so gaps remain visible.
- Place rank 1 at the top of the Y scale.
- Use `d3.curveMonotoneX` for a readable flowing path.
- Provide a textual series summary. If series highlighting is interactive,
  support focus and keyboard alongside pointer behavior.

## Core transformation

```javascript
const periods = [...new Set(this.rows.map((row) => row.period))]
    .sort(this._comparePeriods);
const totals = d3.rollup(
    this.rows,
    (rows) => d3.sum(rows, (row) => row.value),
    (row) => row.entity
);
const selectedEntities = [...totals]
    .sort(this._compareEntityTotals)
    .slice(0, MAX_RETURNED_ENTITIES)
    .map(([entity]) => entity);

const rankByPeriod = new Map();
for (const period of periods) {
    const ranked = this.rows
        .filter((row) => period === row.period && selectedEntities.includes(row.entity))
        .sort(this._compareRankingValues);
    rankByPeriod.set(
        period,
        new Map(ranked.map((row, index) => [row.entity, index + 1]))
    );
}

const series = selectedEntities.map((entity) => ({
    entity,
    points: periods.map((period) => ({
        period,
        rank: rankByPeriod.get(period).get(entity) ?? null
    }))
}));
```

Use prompt/binding labels for the period axis, series names, chart title, SVG
title/description, and assistive summaries.

When the prompt requests a parameterized period grain or entity count, verify
with uneven participation rather than a complete rectangle. For example,
`Alpha` can have values in P1 and P3, `Beta` in P1, P2, and P3, and `Gamma`
only in P2. Changing the parameter must recompute the bounded entity set and
period ranks from the returned rows; absent combinations remain `null`.

## Query shape

```javascript
const specs = [
    { model: this.periodField.name, rowGrouping: true },
    { model: this.entityField.name, rowGrouping: true },
    measureSpecFromBinding(
        this.rankingValueField,
        RANKING_VALUE_ALLOWED_AGGREGATIONS
    )
];
// Row contract: [period, entity, rankingValue].
```

Generate `RANKING_VALUE_ALLOWED_AGGREGATIONS` from the confirmed ranking value
and formatter; do not accept count semantics for a role presented as currency.

## Verification

- Unsorted input periods render in the confirmed order.
- Ascending and descending ranking produce the expected rank 1.
- Missing periods break paths instead of dropping to rank zero.
- Ties use a deterministic prompt-confirmed secondary order.
- Labels and summaries use bound field language.
- Bounded result text does not claim a global top-N.
- Parameter changes preserve unequal participation and recompute missing-period
  gaps instead of reusing stale ranks.

## DF26 worked example

For "show how our accounts ranked each quarter by amount," map period to close
date bucketed by quarter, entity to account, and ranking value to amount. These
choices do not apply to other bump-chart prompts.
