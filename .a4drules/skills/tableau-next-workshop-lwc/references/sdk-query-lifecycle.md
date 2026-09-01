# SDK query lifecycle

Use this reference for every data-backed workshop extension. It is
contract-equivalent to `sdm-data-binding.md`: that reference owns prompt-derived
role compilation, while this one isolates the live-proven startup and query
lifecycle.

Fourteen native-binding bundles passed automated verification, deployment, and
live Tableau Next dashboard testing in `26213playground` on August 31, 2026.
The validated default is setter-scheduled one-shot startup. Do not replace it
with discovery-first code, source hydration, rendered query startup, or dynamic
rebinding.

## Invariants

1. Use source API version `67.0` and target `analytics__Dashboard`.
2. Generate private-backed `@api` accessors for `sdk`, `sdmName`, and every
   prompt-derived semantic role. Every setter calls `_scheduleStart()`.
3. `connectedCallback()` marks the instance connected and calls
   `_scheduleStart()`.
4. Never initiate or synchronize a query from `renderedCallback`. It remains
   valid for DOM-only work such as focus transfer or D3 rendering.
5. Start once after the component is connected and all required mappings exist.
6. Do not call `getDataSource()` or `getJson()` in this lifecycle. Do not build
   binding signatures, registration generations, or in-place rebinding logic.
7. A materially changed model or role mapping requires the dashboard runtime to
   remount the component.
8. Register every dimension before every measure and derive row indexes from
   that final order.
9. Subscribe to `dataUpdate` before `registerFieldsForQuery` because
   registration may emit synchronously.
10. Call `registerFieldsForQuery(specs, sourceName, { limit: QUERY_LIMIT })`.
    The registered query owns fetching and dashboard filter/parameter refresh.
11. Accept direct row payloads and wrappers shaped as `{ rows: [...] }` or
    `{ data: [...] }`.
12. End an initial or refresh wait with `loaded`, `nodata`, or a visible `error`.
    Use an eight-second terminal timeout.

## API setters and one-shot scheduling

The runtime can assign `sdk`, model, and role bindings before or after
`connectedCallback`. Route every assignment through the same microtask. The
guards collapse multiple assignments into one startup attempt and prevent
duplicate registration.

```javascript
@api
get sdk() { return this._sdk; }
set sdk(value) {
    this._sdk = value;
    this._scheduleStart();
}

@api
get sdmName() { return this._sdmName; }
set sdmName(value) {
    this._sdmName = value;
    this._scheduleStart();
}

@api
get primaryLabelField() { return this._primaryLabelField; }
set primaryLabelField(value) {
    this._primaryLabelField = value;
    this._scheduleStart();
}

connectedCallback() {
    this._connected = true;
    this._scheduleStart();
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

Generate one static accessor per confirmed role. Do not create dynamic `@api`
properties. Do not use `renderedCallback` as an injection retry loop.

## Query construction

Read the runtime objects directly:

```javascript
// SemanticModel
{ apiName: 'Model_Api_Name', id: '2SM...', label: 'Model label' }

// SemanticDimension
{ name: 'Object.Field', label: 'Field label' }

// SemanticMeasure
{ name: 'Object.Field', aggregation: 'Sum', label: 'Field label' }
```

Normalize selected measure aggregations to uppercase SDK enums: `SUM`, `AVG`,
`MIN`, `MAX`, `COUNT`, and `COUNT_DISTINCT`. For a qualified raw measure,
include its validated `aggregationType`. For a bare model-level calculated
measure, omit `aggregationType` because the semantic model owns aggregation.

Build the active prompt-derived roles with dimensions first and measures last:

```javascript
const orderedRoles = [
    ...mappedRoles.filter((role) => role.kind === 'dimension'),
    ...mappedRoles.filter((role) => role.kind === 'measure')
];
const specs = orderedRoles.map((role) =>
    role.kind === 'dimension'
        ? { model: role.binding.name, rowGrouping: true }
        : measureSpecFromBinding(role.binding, role.allowedAggregations)
);
this._orderedRoles = orderedRoles;
this._indexByRole = Object.fromEntries(
    orderedRoles.map((role, index) => [role.key, index])
);
```

The exact final order is the positional row contract. Never interleave measures
with dimensions, even when the visible display order differs.

## Canonical startup

Incomplete required mappings are an authoring state: show configuration
guidance and issue no query. Set `_started` before SDK calls. Start loading
before registration so a synchronous update remains final. Use `_showError` to
clear the timer, expose an error message, stop loading, and emit the `error`
lifecycle event.

```javascript
const QUERY_LIMIT = 5000;
const LOADING_TIMEOUT_MS = 8000;

_tryStart() {
    if (this._started || !this._connected || !this.sdk) return;

    const sourceName = this.sdmName?.apiName;
    const activeRoles = ROLE_DEFINITIONS.map((role) => ({
        ...role,
        binding: this[role.propertyName]
    }));
    const missingRequiredRole = activeRoles.some(
        (role) => role.required && !role.binding?.name
    );
    if (!sourceName || missingRequiredRole) {
        this._showConfigurationMessage();
        return;
    }
    const mappedRoles = activeRoles.filter((role) => role.binding?.name);

    this._started = true;
    this._setLoadingState();
    try {
        const specs = this._buildQuerySpecs(mappedRoles);
        this.sdk.registerDataSource(sourceName);
        this._unsubscribes = [
            this.sdk.on('dataUpdate', (payload) =>
                this._handleDataUpdate(payload)
            )
        ];
        this.sdk.actions?.notifyLifecycleChange?.('init');
        this._loadingTimer = setTimeout(() => {
            this._showError('No data update was received within 8 seconds.');
        }, LOADING_TIMEOUT_MS);
        this.sdk.registerFieldsForQuery(specs, sourceName, {
            limit: QUERY_LIMIT
        });
    } catch (error) {
        this._showError(String(error?.message || error));
    }
}

_showError(message) {
    clearTimeout(this._loadingTimer);
    this._isLoading = false;
    this._hasError = true;
    this._errorMessage = message;
    this.sdk.actions?.notifyLifecycleChange?.('error', { message });
}
```

`_buildQuerySpecs(mappedRoles)` must derive `orderedRoles`, indexes, labels, and
specs only from those mapped roles. It must preserve every mapped dimension
before every mapped measure and pass each measure's `allowedAggregations` to
`measureSpecFromBinding`. An unmapped optional role does not block startup or
occupy a returned-row index.

`registerFieldsForQuery` fetches internally. Never call `fetchData()` after
registration or from filter and parameter handlers. Add filter or parameter
subscriptions only when a requested feature must invalidate local UI state;
rows still change only through `dataUpdate`.

## Data updates and terminal states

Normalize the event envelope before row mapping:

```javascript
function eventRows(payload) {
    if (payload && typeof payload === 'object') {
        if (payload.rows !== undefined) return payload.rows;
        if (payload.data !== undefined) return payload.data;
    }
    return payload;
}

_handleDataUpdate(payload) {
    clearTimeout(this._loadingTimer);
    const rawRows = eventRows(payload);
    const rows = Array.from(rawRows || [], (row, index) =>
        this._mapRow(row, index)
    );
    const sortedRows = rows.sort(this._compareRows);
    this.rows = DISPLAY_LIMIT === null
        ? sortedRows
        : sortedRows.slice(0, DISPLAY_LIMIT);
    this._isLoading = false;
    this._hasError = false;
    this.sdk.actions?.notifyLifecycleChange?.(
        this.rows.length ? 'loaded' : 'nodata'
    );
}
```

The eight-second timeout must render a visible error and emit `error`; it must
not silently stop loading. For tables, clear it on every accepted update. For
D3, keep it active until no-data, successful visual render, or error as described
in `d3-in-lwc.md`. Always clear it on query failure and disconnect. Use a
distinct no-data state.

Client sorting applies only within rows already returned by the limited query.
Do not claim a global top-N unless server-side measure ordering has been proved.
Keep query and display limits separate, and omit `slice()` when every returned
row should render.

## Disconnect and remount

```javascript
disconnectedCallback() {
    this._connected = false;
    this._started = false;
    this.rows = [];
    this._orderedRoles = [];
    this._indexByRole = {};
    this._labelsByRole = {};
    this._isLoading = false;
    this._hasData = false;
    this._hasNoData = false;
    this._hasError = false;
    this._errorMessage = '';
    this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    this._unsubscribes = [];
    clearTimeout(this._loadingTimer);
    this._loadingTimer = null;
    this._invalidateFeatureState();
}
```

Disconnect cleanup removes subscriptions, timers, stale rows or visual buffers,
and pending feature state. A later connection can use the same setter-scheduled
startup path. Do not attempt to compare binding signatures or re-register while
the old query can still emit unattributed `dataUpdate` events. Material mapping
changes require a remount.

## Verification

1. Delayed `sdk`, model, and role assignment produces exactly one registration.
2. No query starts from `renderedCallback`.
3. No `getDataSource`, `getJson`, binding signature, or in-place rebind exists.
4. Dimensions precede measures and uppercase aggregations are used.
5. `dataUpdate` is subscribed before registration and accepts direct, `rows`,
   and `data` payloads.
6. Missing initial data reaches a visible terminal error after eight seconds.
7. Dashboard filters update rows without explicit fetching.
8. Client-sorted copy describes the returned set, not unsupported global top-N.
