# D3 radar: multi-measure entity comparison

Use a radar chart when the prompt asks to compare a small number of entities
across several measures. Generate one static semantic property per requested
axis; do not invent a runtime array-valued binding.

## Semantic roles

| Property | Type | Purpose |
|---|---|---|
| `entityField` | `SemanticDimension` | Polygon identity and legend label |
| Prompt-derived measure properties | `SemanticMeasure` | One radial axis each |

For example, a supplier prompt might generate `qualityField`, `leadTimeField`,
`costField`, `sustainabilityField`, and `reliabilityField`. The example names
must not leak into another prompt.

Generate axis descriptors from the confirmed roles:

```javascript
const RADAR_AXES = [
    { key: 'quality', propertyName: 'qualityField', direction: 'higherIsBetter' },
    { key: 'leadTime', propertyName: 'leadTimeField', direction: 'lowerIsBetter' },
    { key: 'cost', propertyName: 'costField', direction: 'lowerIsBetter' }
];
```

Confirm scale direction and formatting for each axis. A value being numerically
higher does not always mean better.

## Layout rules

- Apply every rule in `d3-in-lwc.md`.
- Query the entity dimension first, followed by all measure roles.
- Use each bound measure label for its axis and assistive summary.
- Normalize each axis independently. Do not share a scale across measures with
  different units.
- Use a confirmed domain strategy: zero-to-max, observed extent, or a supplied
  business domain. Do not silently force zero when that misrepresents the
  metric.
- Reverse normalized direction for an explicitly `lowerIsBetter` comparison
  only when the prompt asks the polygon to encode desirability rather than raw
  magnitude. Explain that transformation in visible copy.
- Close polygons with `d3.curveLinearClosed` or
  `d3.curveCardinalClosed`.
- Limit the returned comparison to three or four entities. Derive which
  selection role/direction to use; do not assume a pipeline measure.
- Keep fill opacity at or below `0.35`.
- If polygons highlight on pointer hover, add equivalent focus behavior and a
  keyboard-accessible legend control.

## Core axis shape

```javascript
const axes = RADAR_AXES.map((axis) => ({
    ...axis,
    label: this[axis.propertyName].label
}));

const scales = Object.fromEntries(axes.map((axis) => [
    axis.key,
    this._scaleForAxis(axis, this.rows, radius)
]));
const line = d3.lineRadial()
    .curve(d3.curveLinearClosed)
    .radius((value, index) => scales[axes[index].key](value))
    .angle((value, index) => index * angleSlice);
```

Add an SVG title/description and a textual table or list of entity values. A
polygon shape alone is not an equivalent representation of multiple measures.

## Query shape

```javascript
const specs = [
    { model: this.entityField.name, rowGrouping: true },
    ...RADAR_AXES.map((axis) =>
        measureSpecFromBinding(
            this[axis.propertyName],
            axis.allowedAggregations
        )
    )
];
// Row contract: [entity, ...axisValues].
```

Compile an `allowedAggregations` list into each generated axis descriptor so
its aggregation remains compatible with that axis's units and formatter.

## Verification

- Axis count and property names match the prompt exactly.
- Labels come from each mapped binding.
- Measures with different units receive independent scales and formatters.
- Zero-only or constant axes have a nonzero safe domain.
- Entity selection uses the confirmed role and returned-result wording.
- Hover highlighting has focus and keyboard parity.

## DF26 worked example

For an industry comparison, axes may map to win rate, average deal size, sales
cycle, pipeline, and opportunity count. Treat their scale directions and units
independently; these five measures are not universal radar defaults.
