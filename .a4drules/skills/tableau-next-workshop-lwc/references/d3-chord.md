# d3-chord - Circular relationship between opportunity type and stage

Read `sdk-query-lifecycle.md` and `d3-in-lwc.md` first. This chart is a
purpose-built aggregate visualization; it replaces the action table.

## Query

Query two dimensions and one model-level count calculation, with dimensions
first:

```javascript
const specs = [
    { model: `${OBJ_OPPORTUNITY}.<type-dimension>`, rowGrouping: true },
    { model: `${OBJ_OPPORTUNITY}.<stage-dimension>`, rowGrouping: true },
    { model: '<opportunity-count-clc>', rowGrouping: false }
];
```

## Dense Symmetric Matrix

`d3.chord()` needs a dense square matrix. Type nodes precede stage nodes, so the
stage index starts after **all type nodes**, not after the count of stages.
Mirror each count: the semantic relationship remains Type-to-Stage, but the
symmetric matrix gives both node groups readable nonzero arcs.

```javascript
const typeValues = [...new Set(this.rows.map((row) => row.type))];
const stageValues = [...new Set(this.rows.map((row) => row.stage))];
const nodes = [...typeValues, ...stageValues];
const matrix = nodes.map(() => nodes.map(() => 0));

this.rows.forEach((row) => {
    const typeIndex = typeValues.indexOf(row.type);
    const stageIndex = typeValues.length + stageValues.indexOf(row.stage);
    const count = Number(row.count) || 0;
    matrix[typeIndex][stageIndex] += count;
    matrix[stageIndex][typeIndex] += count;
});
```

Use test data with unequal type and stage cardinalities. Equal counts can hide
the original offset bug.

## Accessible Semantics

The diagram needs a complete textual equivalent and cannot rely on arc color to
distinguish Type from Stage. Give the SVG a title and description, then provide
visible or equivalent text identifying the two categories. A legend and
kind-prefixed labels are one clear implementation:

```javascript
svg.attr('role', 'img').attr('aria-labelledby', 'chord-title chord-description');
svg.append('title').attr('id', 'chord-title').text('Opportunity type and stage relationships');
svg.append('desc').attr('id', 'chord-description').text('Ribbon widths show returned opportunity counts between opportunity types and stages.');
// Label: `Opportunity Type: ${value}` or `Opportunity Stage: ${value}`.
```

Use flat fills and labels flipped at the arc midpoint for legibility. See
`d3-in-lwc.md` for manual DOM, resize, and D3 lifecycle rules.
