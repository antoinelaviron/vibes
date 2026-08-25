# Native SDM data binding - default Build 1 pattern

Use this pattern for every SDM-backed workshop extension unless the attendee
explicitly asks for the hard-coded recovery build. Native data binding lets the
dashboard author select a semantic model and map role-oriented fields without
editing or redeploying the LWC.

## Binding contract

The dashboard runtime supplies these guaranteed objects:

```javascript
// SemanticModel
{ apiName: 'Model_Api_Name', id: '2SM...', label: 'Model label' }

// SemanticDimension
{ name: 'Object.Field', label: 'Field label' }

// SemanticMeasure
{ name: 'Object.Field', aggregation: 'Sum', label: 'Field label' }
```

A model-level calculated field can have a bare `name`, such as
`Total_Amount_clc`. Read these objects directly. Do not accept string
fallbacks, derive labels from `name`, or substitute hard-coded API names when a
property is undefined.

Build 1 uses these required roles:

| Property | Type | Role |
|---|---|---|
| `sdmName` | `SemanticModel` | Model to query |
| `opportunityIdField` | `SemanticDimension` | Stable row identifier |
| `accountNameField` | `SemanticDimension` | Account display value |
| `stageField` | `SemanticDimension` | Opportunity stage |
| `closeDateField` | `SemanticDimension` | Close date |
| `typeField` | `SemanticDimension` | Opportunity type |
| `amountField` | `SemanticMeasure` | Amount and aggregation |

The picker may expose aggregations that the current SDK does not map correctly.
Generate components only for `Sum`, `Average`, `Min`, `Max`, `Median`,
`Count`, `CountDistinct`, `StdDev`, `Var`, `VarP`, and `UserAgg`. Reject other
selected values with a configuration error rather than silently changing them
to Sum.

Builds 2 and 3 preserve every inherited property name and type. Build 3 creates
a new `vibeAction` bundle and adds required
`accountIdField: SemanticDimension` to that bundle's initial contract.

## Metadata

Use API version 67.0. `sdk` is runtime-injected and must never appear
as a metadata property.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>67.0</apiVersion>
    <isExposed>true</isExposed>
    <masterLabel>Vibe Table</masterLabel>
    <description>Opportunity table with dashboard-configured semantic data bindings.</description>
    <targets>
        <target>analytics__Dashboard</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="analytics__Dashboard">
            <property name="sdmName" type="SemanticModel"
                label="Semantic Model" description="Model to query." required="true" />
            <property name="opportunityIdField" type="SemanticDimension"
                label="Opportunity ID" description="Stable opportunity identifier used for row identity." required="true" />
            <property name="accountNameField" type="SemanticDimension"
                label="Account" description="Account name displayed in the table." required="true" />
            <property name="stageField" type="SemanticDimension"
                label="Stage" description="Opportunity stage displayed in the table." required="true" />
            <property name="closeDateField" type="SemanticDimension"
                label="Close Date" description="Opportunity close date displayed in the table." required="true" />
            <property name="typeField" type="SemanticDimension"
                label="Opportunity Type" description="Opportunity type displayed in the table." required="true" />
            <property name="amountField" type="SemanticMeasure"
                label="Amount" description="Measure used to rank the returned opportunities." required="true" />
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```

Use bound `.label` values for column headings and accessible names. Property
labels describe roles (for example, "Group-by Dimension"), not JavaScript
variable names.

## Query strategy

Data binding supplies the query inputs; it does not change the query transport.
Use `registerFieldsForQuery` so the dashboard runtime owns the query and
automatically applies current filters and parameters. Do not switch to
`fetchDataUsingQueryAndSource` merely because fields are bound.

Build specs in this order:

1. Every dimension with `rowGrouping: true`.
2. Every measure with `rowGrouping: false`.

For a qualified raw measure, pass the bound aggregation after normalization.
For a bare model-level calculated measure, omit `aggregationType` because the
semantic model owns it. Native `SemanticMeasure` bindings do not expose
semantic metrics; keep metric handling in verified hard-coded/manual paths.

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

function measureSpec(binding) {
    const spec = { model: binding.name, rowGrouping: false };
    if (!binding.name.includes('.')) return spec;

    const aggregationType = normalizeAggregation(binding.aggregation);
    if (!aggregationType) {
        throw new Error(`Unsupported measure aggregation: ${binding.aggregation}`);
    }
    return { ...spec, aggregationType };
}
```

Keep the exact final `specs[]` order as the row index contract. The SDK returns
array-like Proxy rows and groups dimensions before measures.

## Binding-aware controller

The runtime can assign `sdk` and binding properties after `connectedCallback`,
and it can replace bindings while the author edits the widget. A one-shot
`_pipelineStarted` guard is therefore not sufficient.

Use private-backed `@api` accessors. Each setter schedules one synchronization
microtask. A stable signature suppresses duplicate registration when the
runtime assigns equivalent object instances.

```javascript
@api
get sdmName() { return this._sdmName; }
set sdmName(value) { this._sdmName = value; this._scheduleBindingSync(); }

@api
get amountField() { return this._amountField; }
set amountField(value) { this._amountField = value; this._scheduleBindingSync(); }

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
}

_scheduleBindingSync() {
    if (this._syncScheduled) return;
    this._syncScheduled = true;
    Promise.resolve().then(() => {
        this._syncScheduled = false;
        this._syncBindings();
    });
}
```

Apply this pattern to every required property, including `sdk`. In `_syncBindings`:

1. Return when disconnected or `sdk` is absent.
2. Emit `init` once when the SDK first becomes usable.
3. Subscribe once for the current SDK instance.
4. Validate every required binding.
5. If incomplete, show a configuration message, issue no query, and emit a
   terminal `error` lifecycle event so the host does not remain loading.
6. Build a signature from source API name, field names, measure aggregation,
   and limit.
7. Return if the signature already matches the active registration.
8. Invalidate stale UI and asynchronous Build 2 work.
9. Set loading, then call `registerFieldsForQuery`; it registers the source
   internally in the current SDK.

```javascript
_bindingConfiguration() {
    const dimensions = [
        ['opportunityId', this.opportunityIdField],
        ['accountName', this.accountNameField],
        ['stage', this.stageField],
        ['closeDate', this.closeDateField],
        ['type', this.typeField]
    ];
    const missing = [
        !this.sdmName?.apiName && 'Semantic Model',
        ...dimensions.map(([key, field]) => !field?.name && key),
        !this.amountField?.name && 'amount'
    ].filter(Boolean);
    if (missing.length) return { missing };

    const specs = [
        ...dimensions.map(([, field]) => ({ model: field.name, rowGrouping: true })),
        measureSpec(this.amountField)
    ];
    return {
        sourceName: this.sdmName.apiName,
        specs,
        labels: {
            accountName: this.accountNameField.label,
            stage: this.stageField.label,
            closeDate: this.closeDateField.label,
            type: this.typeField.label,
            amount: this.amountField.label
        }
    };
}

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
        this.rows = [];
        this._invalidateFeatureState();
        clearTimeout(this._loadingTimer);
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
    this._labels = config.labels;
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
        this._isQueryRegistered = false;
        this._registrationInFlight = false;
        this._activeBindingSignature = '';
        this._showError(String(error?.message || error));
    }
}
```

`registerFieldsForQuery` internally fetches and emits `dataUpdate`. Subscribe
before the first registration and never call `fetchData()` immediately after
registration. `dataUpdate` remains the only data ingestion path.

If the author changes bindings while a registration is in flight, store only
the latest desired signature. In `_handleDataUpdate`, compare it with the
active signature. When they differ, ignore those obsolete rows, clear
`_registrationInFlight`, and schedule synchronization for the latest bindings.
When they match, clear `_registrationInFlight` and process the rows. The event
does not carry a source token, so generation checks around the synchronous
register call alone cannot prevent an older response from overwriting newer
bindings.

This queue is a best-effort guard, not proof that in-place rebinding is safe.
`dataUpdate` does not identify the query that produced it, so overlapping old
filter refreshes can still arrive after a new registration. Until the live gate
proves cancellation/order or the SDK adds event attribution, treat retargeting
as requiring the dashboard runtime to remount the component. Do not advertise
in-place rebinding as supported workshop behavior.

```javascript
_handleDataUpdate(rows) {
    if (!this._isQueryRegistered) return;
    this._registrationInFlight = false;
    if (rows === undefined) return; // SDK already published the query error.
    if (this._desiredBindingSignature !== this._activeBindingSignature) {
        this._activeBindingSignature = '';
        this._scheduleBindingSync();
        return;
    }
    this._processRows(rows);
}
```

## Events and lifecycle

Install subscriptions once per SDK instance:

```javascript
_ensureSubscriptions() {
    if (this._subscribedSdk === this.sdk || typeof this.sdk.on !== 'function') return;
    this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    this._unsubscribes = [
        this.sdk.on('dataUpdate', (rows) => {
            if (this._isQueryRegistered) this._handleDataUpdate(rows);
        }),
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

- `filterChange` and `parameterChange` are UI-only. The registered query
  refetches internally; never call `fetchData()` from these handlers.
- Derive filter relevance from exact active bound field names or their exact
  object segment. Do not use a broad prefix such as `startsWith('Account')`.
- Emit `init` once per SDK connection, then always reach `loaded`, `nodata`, or
  `error`. Do not emit `init` during rebinding or ordinary refreshes.
- A filter timeout may restore the last valid rows. A binding-change timeout
  must not restore rows from the previous model.

## Publishing a bound filter

When a generated visualization publishes selection, use the raw selected value
and the configured model and dimension:

```javascript
this.sdk.actions.applyFilter({
    fieldOrFields: this.stageField.name,
    values: [selectedStage],
    operator: 'In',
    dataSourceName: this.sdmName.apiName
});
```

Interactive marks must also be keyboard operable, have a visible focus state,
and expose selection state with a native control or appropriate ARIA state.

## Compatibility rule

Dashboard mappings persist property names and types. Never rename, remove,
repurpose, or change the type of a shipped binding. Add a new optional property
or create a new component bundle. If platform validation fails while removing
old metadata, use the two-step target-detachment workaround documented in
SKILL.md; do not delete the deployed component as a first response.

## Live release gate

Before switching the workshop manual, verify in a live dashboard that:

1. Semantic property pickers appear and return the documented object shapes.
2. A complete mapping registers and renders rows.
3. Retargeting remounts the component, or the SDK proves that prior requests
   are cancelled/attributed before a second registration becomes active.
4. An external dashboard filter changes the rows without an explicit fetch.
5. Retargeting to another model with different field names works without a
   redeploy.
6. Clearing a binding returns to configuration state without stale rows.
7. `applyFilter` uses the bound source and dimension and updates compatible
   native visualizations.

If item 3 fails, disable in-place retargeting and keep data binding limited to
the initial mapping/remount path. Do not switch to one-off fetching until its
dashboard-filter behavior is independently proven.
