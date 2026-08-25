# D3 chord: relationships between two categories

Use a chord chart when a prompt asks how values from one categorical role
relate to values from another, weighted by a measure.

## Semantic roles

| Property | Type | Purpose |
|---|---|---|
| `sourceField` | `SemanticDimension` | Source-side category |
| `targetField` | `SemanticDimension` | Target-side category |
| `weightField` | `SemanticMeasure` | Ribbon weight |

Map rows to `{ source, target, weight }`. Use each binding's label to prefix
visible and assistive node names, for example `Origin Region: West` and
`Destination Region: East`. Raw values alone do not communicate which side a
node belongs to.

## Matrix rules

- Apply every lifecycle rule in `d3-in-lwc.md`.
- Query source and target dimensions before the weight measure.
- Keep source and target node identities distinct even if both contain the
  same raw value. Use kind-prefixed keys rather than deduplicating raw strings.
- Initialize a dense square matrix with zeroes.
- The target index starts after every source node:
  `sourceValues.length + targetValues.indexOf(row.target)`.
- For a relationship diagram where both category groups need visible arcs,
  mirror each weight into both matrix directions. The semantic relationship
  can remain source-to-target even though geometry is symmetric.
- Use finite nonnegative weights. Exclude invalid rows and surface a result
  note.
- Use flat ribbon fills; shadow-DOM fragment references for gradients are
  unreliable.

## Core matrix build

```javascript
const sourceValues = [...new Set(this.rows.map((row) => row.source))];
const targetValues = [...new Set(this.rows.map((row) => row.target))];
const nodes = [
    ...sourceValues.map((value) => ({ kind: 'source', value })),
    ...targetValues.map((value) => ({ kind: 'target', value }))
];
const matrix = nodes.map(() => nodes.map(() => 0));

for (const row of this.rows) {
    const sourceIndex = sourceValues.indexOf(row.source);
    const targetIndex = sourceValues.length + targetValues.indexOf(row.target);
    matrix[sourceIndex][targetIndex] += row.weight;
    matrix[targetIndex][sourceIndex] += row.weight;
}

const chords = d3.chord()
    .padAngle(0.04)
    .sortSubgroups(d3.descending)(matrix);
```

Label nodes with role semantics:

```javascript
const nodeLabel = (node) => {
    const roleLabel = node.kind === 'source'
        ? this._labelsByRole.source
        : this._labelsByRole.target;
    return `${roleLabel}: ${node.value}`;
};
```

Add a visible legend distinguishing source and target roles, an SVG
title/description, and a textual relationship summary. Do not rely on color or
arc position alone.

## Query shape

```javascript
const specs = [
    { model: this.sourceField.name, rowGrouping: true },
    { model: this.targetField.name, rowGrouping: true },
    measureSpecFromBinding(this.weightField)
];
// Row contract: [source, target, weight].
```

## Verification

- Unequal source and target cardinalities use `sourceValues.length` as the
  target offset.
- Both node groups have nonzero geometry for nonzero relationships.
- Identical raw values on opposite sides remain distinct nodes.
- Node labels and textual summaries identify source versus target semantics.
- Invalid or negative weights do not reach `d3.chord()`.

## DF26 worked example

For "show how opportunity type relates to stage," map source to opportunity
type, target to stage, and weight to opportunity count. Those field meanings
are example mappings only.
