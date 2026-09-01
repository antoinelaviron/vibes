# D3 treemap: two-level hierarchy sized by a measure

Use a treemap when the prompt asks to show how a nonnegative quantity is
distributed across a parent and child category.

## Semantic roles

| Property | Type | Purpose |
|---|---|---|
| `parentField` | `SemanticDimension` | Top-level grouping and color |
| `childField` | `SemanticDimension` | Leaf label |
| `sizeField` | `SemanticMeasure` | Rectangle area |

Map rows to `{ parent, child, size }`. Derive value formatting, labels,
interaction, and result limit from the prompt.

## Layout rules

- Apply every rule in `d3-in-lwc.md`.
- Query parent and child dimensions before the size measure.
- Accept only finite nonnegative sizes. Exclude invalid rows with a visible
  result note; negative areas have no valid treemap meaning.
- Group flat rows into `root -> parent -> child` and aggregate duplicate child
  rows within the same parent.
- Keep child identity scoped to its parent; identical child labels under two
  parents are distinct leaves.
- Call `.sum()` before `d3.treemap()` or the layout collapses.
- Sort descending by size for stable packing; this is a layout rule, not a
  claim about global server ordering.
- Use `paddingInner` for gaps and `paddingTop` for parent labels.
- Draw a child label and formatted size only when each fits visually, but keep
  every leaf in the textual accessibility summary.
- Color by parent and provide a visible legend. Do not use color as the only
  parent indicator.
- Keep hierarchy depth at two for workshop readability.

## Core hierarchy

```javascript
const grouped = d3.group(this.rows, (row) => row.parent);
const treeData = {
    name: 'root',
    children: [...grouped].map(([parent, rows]) => ({
        name: parent,
        children: [...d3.rollup(
            rows,
            (children) => d3.sum(children, (row) => row.size),
            (row) => row.child
        )].map(([child, size]) => ({ name: child, size, parent }))
    }))
};

const root = d3.hierarchy(treeData)
    .sum((node) => node.size)
    .sort((left, right) => right.value - left.value);

d3.treemap()
    .size([width, height])
    .paddingInner(2)
    .paddingTop((node) => node.depth === 1 ? 18 : 0)(root);
```

Add SVG title/description plus a textual parent/child/value summary. If the
prompt requests filtering, provide focusable keyboard-operable controls; do not
make imperative rectangles pointer-only controls.

## Query shape

```javascript
const specs = [
    { model: this.parentField.name, rowGrouping: true },
    { model: this.childField.name, rowGrouping: true },
    measureSpecFromBinding(this.sizeField, SIZE_ALLOWED_AGGREGATIONS)
];
// Row contract: [parent, child, size].
```

Generate `SIZE_ALLOWED_AGGREGATIONS` from the confirmed size semantics and
formatter; reject aggregations that would make area encoding misleading.

## Verification

- `.sum()` runs before layout.
- Negative and non-finite sizes are excluded and disclosed.
- Duplicate child labels under different parents remain distinct.
- Parent legend, labels, and assistive summary use bound role labels.
- Visually omitted small-cell labels remain available in equivalent text.

## DF26 worked example

For "revenue by industry and account," map parent to industry, child to
account, and size to amount. These are example mappings only.
