# Native SDM data binding

Use this pattern for every data-backed workshop extension unless the attendee
explicitly selects hard-coded recovery mode. Native binding lets a dashboard
author map prompt-derived semantic roles without editing the generated LWC.

This pattern is release-gated. Fourteen workshop data-binding bundles passed
automated verification, deployment, and live Tableau Next dashboard testing in
`26213playground`, with live sign-off on August 31, 2026. The results establish
setter-scheduled one-shot startup as the canonical workshop pattern.

## Contents

- [Runtime values](#runtime-values)
- [Role contract](#role-contract)
- [Compile the contract](#compile-the-contract)
- [Query and row contract](#query-and-row-contract)
- [Live-proven controller](#live-proven-controller)
- [Events and interactions](#events-and-interactions)
- [Compatibility and release gate](#compatibility-and-release-gate)

## Runtime values

The dashboard runtime supplies these objects:

```javascript
// SemanticModel
{ apiName: 'Model_Api_Name', id: '2SM...', label: 'Model label' }

// SemanticDimension
{ name: 'Object.Field', label: 'Field label' }

// SemanticMeasure
{ name: 'Object.Field', aggregation: 'Sum', label: 'Field label' }
```

A model-level calculated field can have a bare `name`, such as
`Total_Value_clc`. Read these shapes directly. Do not accept string fallbacks,
derive labels from `name`, or substitute a hard-coded API name when a binding
is missing.

The binding supplies display-form aggregation names, but
`registerFieldsForQuery` requires uppercase SDK enums. Normalize supported
values to `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, or `COUNT_DISTINCT`. Restrict the
allowed subset further when presentation semantics require it: a value rendered
as currency must reject count aggregations rather than format a count as money.
Reject unsupported values as configuration guidance instead of silently
changing them.

## Role contract

Derive the contract from the attendee's prompt before writing metadata or JS.
Use it to generate code; do not expose it as a runtime JSON property.

```javascript
const COMPONENT_CONTRACT = {
  entity: { singularLabel: "Case", pluralLabel: "Cases" },
  roles: [
    {
      key: "caseNumber",
      propertyName: "caseNumberField",
      bindingType: "SemanticDimension",
      pickerLabel: "Case Number",
      purpose: "Case number displayed in each row.",
      required: true,
      visible: true,
      valueKind: "text",
      behaviors: ["rowIdentity", "primaryLabel", "insightContext"],
    },
    {
      key: "customerName",
      propertyName: "customerNameField",
      bindingType: "SemanticDimension",
      pickerLabel: "Customer",
      purpose: "Customer name displayed in each row.",
      required: true,
      visible: true,
      valueKind: "text",
      behaviors: ["insightContext"],
    },
    {
      key: "ageDays",
      propertyName: "ageDaysField",
      bindingType: "SemanticMeasure",
      pickerLabel: "Case Age",
      purpose: "Case age used for display and sorting.",
      required: true,
      visible: true,
      valueKind: "number",
      behaviors: ["primarySort", "insightContext"],
    },
  ],
  displayOrder: ["caseNumber", "customerName", "ageDays"],
  sort: { roleKey: "ageDays", direction: "desc", scope: "returnedRows" },
  queryLimit: 5000,
  displayLimit: null,
};
```

This is a worked shape, not a fixed Case schema. Replace every business role
from the attendee's prompt. Preserve these invariants:

- One `sdmName: SemanticModel` property.
- One static semantic property per confirmed role.
- A stable row identity role or confirmed deterministic composite.
- Explicit visible/hidden status and display order.
- Explicit formatting for currency, percentage, duration, and date roles.
- Explicit sorting semantics, including whether sorting applies only to the
  returned rows.
- Separate query and display limits. Use `null` when every returned row should
  render.
- No fabricated measure, action ID, filter role, or insight context.

## Compile the contract

### Metadata

Generate one property per role under the dashboard target. Property labels and
descriptions explain business purpose; they must not expose implementation
terms such as `role1` or `fieldA`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>67.0</apiVersion>
    <isExposed>true</isExposed>
    <masterLabel>Vibe Table</masterLabel>
    <description>Case table with dashboard-configured semantic roles.</description>
    <targets>
        <target>analytics__Dashboard</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="analytics__Dashboard">
            <property name="sdmName" type="SemanticModel"
                label="Semantic Model" description="Model to query." required="true" />
            <property name="caseNumberField" type="SemanticDimension"
                label="Case Number" description="Case number displayed in each row." required="true" />
            <property name="customerNameField" type="SemanticDimension"
                label="Customer" description="Customer name displayed in each row." required="true" />
            <property name="ageDaysField" type="SemanticMeasure"
                label="Case Age" description="Case age used for display and sorting." required="true" />
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```

The example above is the compiled result of the example contract. Generate a
different property list for a different prompt. `sdk` is runtime-injected and
must never appear as a metadata property.

### JavaScript accessors

Generate a private-backed accessor for `sdk`, `sdmName`, and every role. Each
setter schedules the same one-shot startup microtask because the runtime can
assign values after `connectedCallback`. The startup guard prevents duplicate
registration.

```javascript
@api
get caseNumberField() { return this._caseNumberField; }
set caseNumberField(value) {
    this._caseNumberField = value;
    this._scheduleStart();
}

@api
get sdk() { return this._sdk; }
set sdk(value) {
    this._sdk = value;
    this._scheduleStart();
}
```

Do not attempt to create `@api` properties dynamically. LWC metadata and class
accessors are static; the generator emits the confirmed list.

## Query and row contract

Data binding supplies query inputs, not a different transport. Use
`registerFieldsForQuery` so the dashboard runtime owns fetching and applies its
current filters and parameters. Do not switch to
`fetchDataUsingQueryAndSource` merely because the fields are bound.

```javascript
function normalizeAggregation(value, allowed) {
  const key = String(value || "")
    .replace(/[\s_-]/g, "")
    .toLowerCase();
  const values = {
    sum: "SUM",
    average: "AVG",
    avg: "AVG",
    min: "MIN",
    max: "MAX",
    count: "COUNT",
    countdistinct: "COUNT_DISTINCT",
  };
  const normalized = values[key];
  return allowed.includes(normalized) ? normalized : null;
}

function measureSpecFromBinding(binding, allowedAggregations) {
  const spec = { model: binding.name, rowGrouping: false };
  if (!binding.name.includes(".")) return spec;

  const aggregationType = normalizeAggregation(
    binding.aggregation,
    allowedAggregations,
  );
  if (!aggregationType) {
    throw new Error(`Unsupported measure aggregation: ${binding.aggregation}`);
  }
  return { ...spec, aggregationType };
}
```

For a qualified raw measure, include the normalized selected aggregation. For
a bare model-level calculated measure, omit `aggregationType`; the semantic
model owns it. Native `SemanticMeasure` bindings do not expose semantic metrics,
so keep metrics in a verified hard-coded/manual-query path.

Do not use one global aggregation allowlist blindly. Currency roles normally
allow only `SUM`, `AVG`, `MIN`, and `MAX`; relationship weights may also allow
`COUNT` and `COUNT_DISTINCT`; other generic measures use only the enums their
formatting and visualization can represent honestly.

Generate a compact role descriptor alongside the static accessors:

```javascript
const ROLE_DEFINITIONS = [
  {
    key: "caseNumber",
    propertyName: "caseNumberField",
    pickerLabel: "Case Number",
    kind: "dimension",
    required: true,
    visible: true,
  },
  {
    key: "customerName",
    propertyName: "customerNameField",
    pickerLabel: "Customer",
    kind: "dimension",
    required: true,
    visible: true,
  },
  {
    key: "ageDays",
    propertyName: "ageDaysField",
    pickerLabel: "Case Age",
    kind: "measure",
    required: true,
    visible: true,
    allowedAggregations: ["SUM", "AVG", "MIN", "MAX"],
  },
];
```

Compile the query only after all required bindings exist. Always build
dimensions before measures, regardless of display order:

```javascript
const activeRoles = ROLE_DEFINITIONS.map((role) => ({
  ...role,
  binding: this[role.propertyName],
}));
const missing = [
  !this.sdmName?.apiName && "Semantic Model",
  ...activeRoles.map(
    (role) => role.required && !role.binding?.name && role.pickerLabel,
  ),
].filter(Boolean);
if (missing.length) {
  this._showConfigurationMessage(missing);
  return;
}

const mappedRoles = activeRoles.filter((role) => role.binding?.name);
const orderedRoles = [
  ...mappedRoles.filter((role) => role.kind === "dimension"),
  ...mappedRoles.filter((role) => role.kind === "measure"),
];
const specs = orderedRoles.map((role) =>
  role.kind === "dimension"
    ? { model: role.binding.name, rowGrouping: true }
    : measureSpecFromBinding(role.binding, role.allowedAggregations),
);
```

After building `orderedRoles`, save it and derive `indexByRole` before
registering. These exact objects are the row-mapping contract:

```javascript
this._orderedRoles = orderedRoles;
this._indexByRole = Object.fromEntries(
  orderedRoles.map((role, index) => [role.key, index]),
);
this._labelsByRole = Object.fromEntries(
  mappedRoles.map((role) => [role.key, role.binding.label]),
);
```

Keep the exact final `orderedRoles` and `specs` order as the row-index contract.
The SDK returns array-like Proxy rows and groups all dimensions before all
measures.

`QUERY_LIMIT` controls how many grouped rows the SDK can return. A separate
`DISPLAY_LIMIT`, when requested, controls how many locally sorted rows render:

```javascript
const sortedRows = mapped.sort(compareRows);
this.rows =
  DISPLAY_LIMIT === null ? sortedRows : sortedRows.slice(0, DISPLAY_LIMIT);
```

Do not add `slice()` when the attendee asks to show every returned row. The
validated table-derived workshop examples use `QUERY_LIMIT = 5000`, no display
limit, and render the complete returned set after client-side amount sorting.
The convenience API does not expose measure sort configuration: it sorts by its
first grouping field before applying the query limit. Client-side sorting is
therefore exact only within the returned set, not a global top-N guarantee when
more grouped rows match than the query limit.

The eight-second loading timeout is independent of both limits. It guards the
wait for data or a feature's usable visual render; it does not cap processing or
DOM rendering time.

Map row values by role rather than by business-specific properties:

```javascript
_mapRow(rawRow, index) {
    const values = {};
    for (const role of this._orderedRoles) {
        values[role.key] = rawRow[this._indexByRole[role.key]] ?? null;
    }
    const identity = values[ROW_IDENTITY_ROLE];
    return {
        rowKey: `row-${index}-${String(identity ?? '')}`,
        values,
        displayValues: this._formatRoleValues(values)
    };
}
```

If one role is not a stable identity, use a prompt-confirmed deterministic
composite. Never use `Math.random()` or an index alone.

Render visible fields through generated cells in the prompt-derived display
order. Use bound labels for headers. Use a date-only branch for Salesforce date
values:

```javascript
function formatDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return new Date(value).toLocaleDateString();
}
```

## Live-proven controller

Use setter-scheduled, one-shot startup. This is the smallest pattern validated
in a live Tableau Next dashboard: bindings may arrive in any order, startup is
attempted in a microtask, and registration happens once after every required
value exists. Do not use `renderedCallback` for query synchronization, source
hydration, signatures, or registration queues.

```javascript
connectedCallback() {
    this._connected = true;
    this._scheduleStart();
}

disconnectedCallback() {
    this._connected = false;
    this._started = false;
    this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    this._unsubscribes = [];
    clearTimeout(this._loadingTimer);
    this._invalidateFeatureState();
}

_scheduleStart() {
    if (this._startScheduled) return;
    this._startScheduled = true;
    Promise.resolve().then(() => {
        this._startScheduled = false;
        this._tryStart();
    });
}
```

In `_tryStart`:

1. Return when already started, disconnected, or `sdk` is absent.
2. Validate the semantic model and every required binding.
3. If incomplete, issue no query and show configuration guidance. This is an
   authoring state, not a runtime lifecycle failure.
4. Build the static query, with every dimension before every measure.
5. Set `_started = true` before invoking SDK methods.
6. Register the data source.
7. Subscribe to `dataUpdate` before field registration.
8. Emit `init`, start the visible eight-second timeout, then call
   `registerFieldsForQuery`.

```javascript
_tryStart() {
    if (this._started || !this._connected || !this.sdk) return;

    const sourceName = this.sdmName?.apiName;
    const bindings = ROLE_DEFINITIONS.map(
        (role) => this[role.propertyName]
    );
    if (!sourceName || bindings.some((binding) => !binding?.name)) {
        this._showConfigurationMessage();
        return;
    }

    this._started = true;
    this._setLoadingState();
    try {
        const specs = this._buildQuerySpecs();
        this.sdk.registerDataSource(sourceName);
        this._unsubscribes = [
            this.sdk.on('dataUpdate', (payload) =>
                this._handleDataUpdate(payload)
            )
        ];
        this.sdk.actions?.notifyLifecycleChange?.('init');
        this._loadingTimer = setTimeout(() => {
            this._showError(
                'No data update was received within 8 seconds.'
            );
        }, 8000);
        this.sdk.registerFieldsForQuery(specs, sourceName, {
            limit: QUERY_LIMIT
        });
    } catch (error) {
        this._showError(String(error?.message || error));
    }
}
```

`registerFieldsForQuery` fetches internally and emits `dataUpdate`. Subscribe
before the first registration. Never call `fetchData()` immediately after it.
Accept direct row payloads plus wrappers such as `{ rows: [...] }` and
`{ data: [...] }`. A mapping change after startup is not applied in place;
require a remount because `dataUpdate` has no query identity.

## Events and interactions

The base one-shot contract needs only the `dataUpdate` subscription:

```javascript
function eventRows(payload) {
  if (payload && typeof payload === "object") {
    if (payload.rows !== undefined) return payload.rows;
    if (payload.data !== undefined) return payload.data;
  }
  return payload;
}
```

- Registered queries refresh through `dataUpdate`; do not add explicit fetches.
- Add filter or parameter subscriptions only for feature-state invalidation that
  the requested interaction actually needs.
- Emit `init` once per connection, then reach `loaded`, `nodata`, or `error`.
- Treat incomplete required mappings as visible configuration guidance rather
  than emitting `error` before a query starts.

Publish a filter only when the prompt requests the interaction. Resolve the
field from the configured role instead of assuming a stage-like role:

```javascript
const filterRole = this._orderedRoles.find(
  (role) => role.key === PUBLISH_FILTER_ROLE,
);
this.sdk.actions.applyFilter({
  fieldOrFields: filterRole.binding.name,
  values: [selectedRawValue],
  operator: "In",
  dataSourceName: this.sdmName.apiName,
});
```

Interactive marks must be keyboard operable, visibly focusable, and expose a
programmatic name and selection state. Hover-only tooltips are insufficient.

## Compatibility and release gate

Dashboard mappings persist property names and types. Never rename, remove,
repurpose, change the type of, or change the requiredness of a shipped binding.
Create a new component bundle when the business contract changes.

The initial release gate is complete for the workshop bundle set. Repeat the
checks below for newly generated role contracts, new visualization behavior, or
changes to the shared lifecycle.

Before switching workshop materials, verify in a live dashboard:

1. Semantic pickers return the documented object shapes.
2. Every complete role mapping registers and renders the expected columns.
3. Dimension/measure ordering matches the positional role indexes.
4. External filters change rows without explicit fetching.
5. Incomplete mappings show configuration guidance without querying.
6. Retargeting remounts the component; in-place rebinding is not advertised.
7. A requested bound filter updates compatible native visualizations.
8. Visible and accessible labels use prompt or bound-field language.

If metadata validation fails while replacing an old target shape, use the
two-step target-detachment deploy described in `SKILL.md`. That workaround does
not make an incompatible persisted property change safe.
