# Native SDM data binding

Use this pattern for every data-backed workshop extension unless the attendee
explicitly selects hard-coded recovery mode. Native binding lets a dashboard
author map prompt-derived semantic roles without editing the generated LWC.

## Contents

- [Runtime values](#runtime-values)
- [Role contract](#role-contract)
- [Compile the contract](#compile-the-contract)
- [Query and row contract](#query-and-row-contract)
- [Binding-aware controller](#binding-aware-controller)
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

The picker may expose aggregations that the registered-query API cannot map.
Support `Sum`, `Average`, `Min`, `Max`, `Median`, `Count`, `CountDistinct`,
`StdDev`, `Var`, `VarP`, and `UserAgg`. Reject another selected value as a
configuration error instead of silently changing it.

## Role contract

Derive the contract from the attendee's prompt before writing metadata or JS.
Use it to generate code; do not expose it as a runtime JSON property.

```javascript
const COMPONENT_CONTRACT = {
    entity: { singularLabel: 'Case', pluralLabel: 'Cases' },
    roles: [
        {
            key: 'caseNumber',
            propertyName: 'caseNumberField',
            bindingType: 'SemanticDimension',
            pickerLabel: 'Case Number',
            purpose: 'Case number displayed in each row.',
            required: true,
            visible: true,
            valueKind: 'text',
            behaviors: ['rowIdentity', 'primaryLabel', 'insightContext']
        },
        {
            key: 'customerName',
            propertyName: 'customerNameField',
            bindingType: 'SemanticDimension',
            pickerLabel: 'Customer',
            purpose: 'Customer name displayed in each row.',
            required: true,
            visible: true,
            valueKind: 'text',
            behaviors: ['insightContext']
        },
        {
            key: 'ageDays',
            propertyName: 'ageDaysField',
            bindingType: 'SemanticMeasure',
            pickerLabel: 'Case Age',
            purpose: 'Case age used for display and sorting.',
            required: true,
            visible: true,
            valueKind: 'number',
            behaviors: ['primarySort', 'insightContext']
        }
    ],
    displayOrder: ['caseNumber', 'customerName', 'ageDays'],
    sort: { roleKey: 'ageDays', direction: 'desc', scope: 'returnedRows' },
    limit: 25
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
setter schedules one synchronization microtask because the runtime can assign
values after `connectedCallback` and can replace equivalent object instances.

```javascript
@api
get caseNumberField() { return this._caseNumberField; }
set caseNumberField(value) {
    this._caseNumberField = value;
    this._scheduleBindingSync();
}

@api
get sdk() { return this._sdk; }
set sdk(value) {
    if (value !== this._sdk) {
        this._runGeneration += 1;
        this._activeBindingSignature = '';
        this._desiredBindingSignature = '';
        this._registrationInFlight = false;
        this._isQueryRegistered = false;
        this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
        this._unsubscribes = [];
        this._subscribedSdk = null;
        this._sdk = value;
    }
    this._scheduleBindingSync();
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
function normalizeAggregation(value) {
    const key = String(value || '').replace(/[\s_-]/g, '').toLowerCase();
    const values = {
        sum: 'Sum', average: 'Average', avg: 'Average', min: 'Min', max: 'Max',
        median: 'Median', count: 'Count', countdistinct: 'CountDistinct',
        stddev: 'StdDev', var: 'Var', varp: 'VarP', useragg: 'UserAgg'
    };
    return values[key] || null;
}

function measureSpecFromBinding(binding) {
    const spec = { model: binding.name, rowGrouping: false };
    if (!binding.name.includes('.')) return spec;

    const aggregationType = normalizeAggregation(binding.aggregation);
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

Generate a compact role descriptor alongside the static accessors:

```javascript
const ROLE_DEFINITIONS = [
    { key: 'caseNumber', propertyName: 'caseNumberField', pickerLabel: 'Case Number', kind: 'dimension', required: true, visible: true },
    { key: 'customerName', propertyName: 'customerNameField', pickerLabel: 'Customer', kind: 'dimension', required: true, visible: true },
    { key: 'ageDays', propertyName: 'ageDaysField', pickerLabel: 'Case Age', kind: 'measure', required: true, visible: true }
];
```

Compile the active configuration from bound values. Always build dimensions
before measures, regardless of display order:

```javascript
_bindingConfiguration() {
    const activeRoles = ROLE_DEFINITIONS.map((role) => ({
        ...role,
        binding: this[role.propertyName]
    }));
    const missing = [
        !this.sdmName?.apiName && 'Semantic Model',
        ...activeRoles.map((role) =>
            role.required && !role.binding?.name && role.pickerLabel
        )
    ].filter(Boolean);
    if (missing.length) return { missing };

    const mappedRoles = activeRoles.filter((role) => role.binding?.name);
    const dimensions = mappedRoles.filter((role) => role.kind === 'dimension');
    const measures = mappedRoles.filter((role) => role.kind === 'measure');
    const orderedRoles = [...dimensions, ...measures];
    const specs = orderedRoles.map((role) =>
        role.kind === 'dimension'
            ? { model: role.binding.name, rowGrouping: true }
            : measureSpecFromBinding(role.binding)
    );

    return {
        sourceName: this.sdmName.apiName,
        orderedRoles,
        specs,
        labelsByRole: Object.fromEntries(
            mappedRoles.map((role) => [role.key, role.binding.label])
        ),
        indexByRole: Object.fromEntries(
            orderedRoles.map((role, index) => [role.key, index])
        )
    };
}
```

Keep the exact final `orderedRoles` and `specs` order as the row-index contract.
The SDK returns array-like Proxy rows and groups all dimensions before all
measures.

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
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    }
    return new Date(value).toLocaleDateString();
}
```

## Binding-aware controller

Use a synchronization controller instead of a one-shot pipeline. Bindings can
arrive after construction, and equivalent assignments must not duplicate a
registration.

```javascript
connectedCallback() {
    this._connected = true;
    this._scheduleBindingSync();
}

renderedCallback() {
    this._scheduleBindingSync();
}

disconnectedCallback() {
    this._connected = false;
    this._runGeneration += 1;
    this._activeBindingSignature = '';
    this._desiredBindingSignature = '';
    this._registrationInFlight = false;
    this._isQueryRegistered = false;
    this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    this._unsubscribes = [];
    this._subscribedSdk = null;
    clearTimeout(this._loadingTimer);
    this._invalidateFeatureState();
}

_scheduleBindingSync() {
    if (this._syncScheduled) return;
    this._syncScheduled = true;
    Promise.resolve().then(() => {
        this._syncScheduled = false;
        this._syncBindings();
    });
}

_isCurrentRun(generation) {
    return this._connected && generation === this._runGeneration;
}
```

In `_syncBindings`:

1. Return when disconnected or `sdk` is absent.
2. Emit `init` once when the SDK first becomes usable.
3. Install subscriptions once for the current SDK instance.
4. Compile and validate every required binding.
5. If incomplete, issue no query, clear stale rows and feature state, show a
   configuration message, and emit terminal `error`.
6. Build a signature from source, specs, and limit.
7. Return if the signature already matches the active registration.
8. Invalidate stale insight/action state.
9. Save the role order, indexes, and labels.
10. Start loading before `registerFieldsForQuery`.

```javascript
_bindingSignature(config) {
    return JSON.stringify({
        sourceName: config.sourceName,
        specs: config.specs,
        limit: QUERY_LIMIT
    });
}

_syncBindings() {
    if (!this._connected || !this.sdk) return;
    this._notifyInitOnce();
    this._ensureSubscriptions();

    let config;
    try {
        config = this._bindingConfiguration();
    } catch (error) {
        this._showError(String(error?.message || error));
        return;
    }
    if (config.missing) {
        this._runGeneration += 1;
        this._activeBindingSignature = '';
        this._desiredBindingSignature = '';
        this._registrationInFlight = false;
        this._isQueryRegistered = false;
        this._queryKeys = [];
        clearTimeout(this._loadingTimer);
        this.rows = [];
        this._invalidateFeatureState();
        this._showConfigurationMessage(config.missing);
        return;
    }

    const signature = this._bindingSignature(config);
    if (signature === this._activeBindingSignature) return;
    this._desiredBindingSignature = signature;
    if (this._registrationInFlight) return;

    this._registrationInFlight = true;
    this._activeBindingSignature = signature;
    const generation = ++this._runGeneration;
    this._queryKeys = config.specs.map((spec) => spec.model);
    this._orderedRoles = config.orderedRoles;
    this._indexByRole = config.indexByRole;
    this._labelsByRole = config.labelsByRole;
    this._invalidateFeatureState();
    this._setLoadingState({ preserveRows: false });
    this._isQueryRegistered = true;

    try {
        this.sdk.registerFieldsForQuery(config.specs, config.sourceName, {
            limit: QUERY_LIMIT
        });
        if (generation !== this._runGeneration) return;
    } catch (error) {
        if (generation !== this._runGeneration) return;
        this._registrationInFlight = false;
        this._isQueryRegistered = false;
        this._activeBindingSignature = '';
        this._showError(String(error?.message || error));
    }
}
```

`registerFieldsForQuery` fetches internally and emits `dataUpdate`. Subscribe
before the first registration. Never call `fetchData()` immediately after it.

If bindings change while registration is in flight, retain only the newest
desired signature. An event has no query token, so ignore rows when desired and
active signatures differ, clear the active registration, and schedule the
newest configuration:

```javascript
_handleDataUpdate(rows) {
    if (!this._isQueryRegistered) return;
    this._registrationInFlight = false;
    if (rows === undefined) {
        this._isQueryRegistered = false;
        this._activeBindingSignature = '';
        clearTimeout(this._loadingTimer);
        this._showError('Unable to load data. Please retry.');
        return;
    }
    if (this._desiredBindingSignature !== this._activeBindingSignature) {
        this._activeBindingSignature = '';
        this._scheduleBindingSync();
        return;
    }
    this._processRows(rows);
}
```

This queue is best-effort only. `dataUpdate` cannot identify its query, so an
old filter refresh can still overlap a new registration. Until a live gate
proves cancellation or attribution, require the dashboard runtime to remount
for retargeting. Do not advertise in-place rebinding.

## Events and interactions

Install subscriptions once per SDK instance:

```javascript
_ensureSubscriptions() {
    if (this._subscribedSdk === this.sdk || typeof this.sdk.on !== 'function') return;
    this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    this._unsubscribes = [
        this.sdk.on('dataUpdate', (rows) => this._handleDataUpdate(rows)),
        this.sdk.on('filterChange', (payload) => {
            if (this._isQueryRegistered && this._isFilterRelevant(payload)) {
                this._invalidateFeatureState();
                this._setLoadingState({ preserveRows: true });
            }
        }),
        this.sdk.on('parameterChange', () => {
            if (this._isQueryRegistered) {
                this._invalidateFeatureState();
                this._setLoadingState({ preserveRows: true });
            }
        })
    ];
    this._subscribedSdk = this.sdk;
}
```

- `filterChange` and `parameterChange` are UI-only. Never call `fetchData()`.
- Derive filter relevance from exact active field names or exact object names.
- Emit `init` once per connection, then reach `loaded`, `nodata`, or `error`.
- A filter timeout may restore prior valid rows. A binding-change timeout must
  never restore rows from another model.

Publish a filter only when the prompt requests the interaction. Resolve the
field from the configured role instead of assuming a stage-like role:

```javascript
const filterRole = this._orderedRoles.find(
    (role) => role.key === PUBLISH_FILTER_ROLE
);
this.sdk.actions.applyFilter({
    fieldOrFields: filterRole.binding.name,
    values: [selectedRawValue],
    operator: 'In',
    dataSourceName: this.sdmName.apiName
});
```

Interactive marks must be keyboard operable, visibly focusable, and expose a
programmatic name and selection state. Hover-only tooltips are insufficient.

## Compatibility and release gate

Dashboard mappings persist property names and types. Never rename, remove,
repurpose, change the type of, or change the requiredness of a shipped binding.
Create a new component bundle when the business contract changes.

Before switching workshop materials, verify in a live dashboard:

1. Semantic pickers return the documented object shapes.
2. Every complete role mapping registers and renders the expected columns.
3. Dimension/measure ordering matches the positional role indexes.
4. External filters change rows without explicit fetching.
5. Clearing a binding returns to configuration state without stale rows.
6. Retargeting remounts the component, or cancellation/attribution is proved.
7. A requested bound filter updates compatible native visualizations.
8. Visible and accessible labels use prompt or bound-field language.

If metadata validation fails while replacing an old target shape, use the
two-step target-detachment deploy described in `SKILL.md`. That workaround does
not make an incompatible persisted property change safe.
