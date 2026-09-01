# Hard-coded recovery query

Use this reference only when the attendee explicitly requests recovery mode.
Native data binding remains the default. Recovery compiles the same confirmed
prompt-derived role contract into source and field constants after live SDM
discovery.

## Contents

- [Required handoff](#required-handoff)
- [Query rules](#query-rules)
- [Compile the confirmed roles](#compile-the-confirmed-roles)
- [Recovery pipeline](#recovery-pipeline)
- [Date-only values](#date-only-values)
- [Template states and result copy](#template-states-and-result-copy)
- [Verification](#verification)

## Required handoff

Do not write query code until `tableau-next-workshop-sdm-discovery` returns and
the attendee confirms a handoff shaped like this:

```json
{
  "sourceName": "verified semantic model API name",
  "limit": 25,
  "roles": [
    {
      "key": "recordIdentity",
      "kind": "dimension",
      "model": "Object.Verified_Dimension",
      "label": "Record ID",
      "visible": false,
      "valueKind": "text",
      "behaviors": ["rowIdentity"]
    },
    {
      "key": "primaryLabel",
      "kind": "dimension",
      "model": "Object.Verified_Label",
      "label": "Record",
      "visible": true,
      "valueKind": "text",
      "behaviors": ["primaryLabel"]
    },
    {
      "key": "score",
      "kind": "measure",
      "model": "Object.Verified_Measure",
      "aggregationType": "SUM",
      "label": "Score",
      "visible": true,
      "valueKind": "number",
      "behaviors": ["primarySort"]
    }
  ],
  "displayOrder": ["primaryLabel", "score"]
}
```

This example describes the handoff structure, not fields to copy. Every source,
role, model string, aggregation, label, visibility decision, and ordering value
must come from the confirmed prompt and live discovery. Keep strict model-field
validation: do not auto-pick fields and do not silently accept an unresolved or
unknown model string.

## Query rules

- Subscribe and enter loading before `registerFieldsForQuery`; registration
  may emit `dataUpdate` synchronously.
- Use `registerFieldsForQuery`, not `fetchDataUsingQueryAndSource`, so dashboard
  filters and parameters remain runtime-owned.
- Call registration with the options object `{ limit: QUERY_LIMIT }`.
- Order every dimension before every measure. Interleaving silently changes
  returned column positions.
- Use bare model names for verified model-level calculated dimensions,
  measurements, and metrics. Omit `aggregationType` for bare calculated
  measures.
- For qualified raw measures, use only supported uppercase SDK values:
  `SUM`, `AVG`, `MIN`, `MAX`, `MEDIAN`, `COUNT`, `COUNT_DISTINCT`, `STDDEV`,
  `VAR`, `VARP`, and `USER_AGG`, restricted to values supported by the role.
- Treat `dataUpdate` as the only row input. Accept direct rows and the wrappers
  `{ rows }` and `{ data }`. Filter and parameter handlers only update UI state.
- Read positional array-like Proxy rows through role indexes. Do not depend on
  `Array.isArray(row)`.
- Build a stable row key from the confirmed identity role or deterministic
  composite, never from an index alone.
- Do not hydrate through `getDataSource` or `getJson`.
- Do not start or synchronize a query from `renderedCallback`.

## Compile the confirmed roles

The emitted constants contain only values from the handoff:

```javascript
const SOURCE_NAME = '<verified-sdm-api-name>';
const QUERY_LIMIT = 25;
const LOADING_SAFETY_MS = 8000;

const ROLE_DEFINITIONS = [
    {
        key: '<identity-role-key>',
        kind: 'dimension',
        model: '<verified-qualified-or-bare-dimension>',
        visible: false,
        valueKind: 'text'
    },
    {
        key: '<label-role-key>',
        kind: 'dimension',
        model: '<verified-qualified-or-bare-dimension>',
        visible: true,
        valueKind: 'text'
    },
    {
        key: '<measure-role-key>',
        kind: 'measure',
        model: '<verified-qualified-or-bare-measure>',
        aggregationType: '<verified-uppercase-sdk-aggregation>',
        allowedAggregations: ['<prompt-compatible-uppercase-aggregation>'],
        visible: true,
        valueKind: 'number'
    }
];
```

Compile role order, specs, and indexes from the same array so they cannot drift:

```javascript
const SDK_AGGREGATIONS = new Set([
    'SUM', 'AVG', 'MIN', 'MAX', 'MEDIAN', 'COUNT', 'COUNT_DISTINCT',
    'STDDEV', 'VAR', 'VARP', 'USER_AGG'
]);

function compileQuery(roleDefinitions) {
    const dimensions = roleDefinitions.filter((role) => role.kind === 'dimension');
    const measures = roleDefinitions.filter((role) => role.kind === 'measure');
    const orderedRoles = [...dimensions, ...measures];
    const specs = orderedRoles.map((role) => {
        if (role.kind === 'dimension') {
            return { model: role.model, rowGrouping: true };
        }
        const spec = { model: role.model, rowGrouping: false };
        if (!role.model.includes('.')) return spec;
        if (
            !SDK_AGGREGATIONS.has(role.aggregationType) ||
            !role.allowedAggregations?.includes(role.aggregationType)
        ) {
            throw new Error(`Unsupported aggregation for ${role.key}.`);
        }
        return { ...spec, aggregationType: role.aggregationType };
    });
    const indexByRole = Object.fromEntries(
        orderedRoles.map((role, index) => [role.key, index])
    );
    return { orderedRoles, specs, indexByRole };
}

function eventRows(payload) {
    if (payload && typeof payload === 'object') {
        if (payload.rows !== undefined) return payload.rows;
        if (payload.data !== undefined) return payload.data;
    }
    return payload;
}
```

This removes the failure mode where a hand-written six-entry index map is used
with a three-field query. Generate each measure's `allowedAggregations` from its
confirmed units and formatter; the global set validates SDK syntax but does not
replace role-specific semantic validation.

## Recovery pipeline

Recovery still receives `sdk` through a private-backed `@api` accessor. The
setter schedules the same one-shot startup used by native bindings, so delayed
SDK assignment does not require render-driven polling.

```javascript
import { LightningElement, api, track } from 'lwc';

const SDK_EVENTS = {
    DATA_UPDATE: 'dataUpdate',
    FILTER_CHANGE: 'filterChange',
    PARAMETER_CHANGE: 'parameterChange'
};
const LIFE_CYCLE = {
    INIT: 'init', LOADED: 'loaded', ERROR: 'error', NO_DATA: 'nodata'
};

export default class VibeTable extends LightningElement {
    @track rows = [];
    @track _isLoading = true;
    @track _hasError = false;
    @track _hasNoData = false;
    @track _errorMessage = '';

    _sdk;
    _connected = false;
    _started = false;
    _startScheduled = false;
    _pipelineGeneration = 0;
    _isQueryRegistered = false;
    _unsubscribes = [];
    _loadingTimer;

    @api
    get sdk() {
        return this._sdk;
    }

    set sdk(value) {
        this._sdk = value;
        this._scheduleStart();
    }

    connectedCallback() {
        this._connected = true;
        this._scheduleStart();
    }

    disconnectedCallback() {
        this._connected = false;
        this._pipelineGeneration += 1;
        this._started = false;
        this._isQueryRegistered = false;
        this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
        this._unsubscribes = [];
        clearTimeout(this._loadingTimer);
    }

    _scheduleStart() {
        if (this._startScheduled) return;
        this._startScheduled = true;
        Promise.resolve().then(() => {
            this._startScheduled = false;
            this._tryStart();
        });
    }

    _tryStart() {
        if (this._started || !this._connected || !this.sdk) return;
        this._started = true;
        const generation = ++this._pipelineGeneration;
        this._runPipeline(generation);
    }

    _runPipeline(generation) {
        try {
            const query = compileQuery(ROLE_DEFINITIONS);
            this._orderedRoles = query.orderedRoles;
            this._indexByRole = query.indexByRole;
            this.sdk.registerDataSource(SOURCE_NAME);
            this._subscribeEvents(generation);
            this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.INIT);
            this._setLoadingState(generation);
            this._isQueryRegistered = true;
            this.sdk.registerFieldsForQuery(query.specs, SOURCE_NAME, {
                limit: QUERY_LIMIT
            });
        } catch (error) {
            if (!this._isCurrentPipeline(generation)) return;
            this._isQueryRegistered = false;
            this._showError('Unable to load data. Please retry.', error);
        }
    }

    _subscribeEvents(generation) {
        if (typeof this.sdk.on !== 'function') return;
        this._unsubscribes = [
            this.sdk.on(SDK_EVENTS.DATA_UPDATE, (payload) => {
                if (this._isCurrentPipeline(generation)) this._processRows(payload);
            }),
            this.sdk.on(SDK_EVENTS.FILTER_CHANGE, (payload) => {
                if (
                    this._isCurrentPipeline(generation)
                    && this._isQueryRegistered
                    && this._isFilterRelevant(payload)
                ) {
                    this._setLoadingState(generation, { preserveRows: true });
                }
            }),
            this.sdk.on(SDK_EVENTS.PARAMETER_CHANGE, () => {
                if (this._isCurrentPipeline(generation) && this._isQueryRegistered) {
                    this._setLoadingState(generation, { preserveRows: true });
                }
            })
        ];
    }

    _isCurrentPipeline(generation) {
        return this._connected && generation === this._pipelineGeneration;
    }

    _processRows(payload) {
        clearTimeout(this._loadingTimer);
        const rawRows = eventRows(payload);
        if (rawRows == null) {
            this._isQueryRegistered = false;
            this._showError('Unable to load data. Please retry.');
            return;
        }
        try {
            const length = typeof rawRows.length === 'number' ? rawRows.length : 0;
            const mapped = [];
            for (let rowIndex = 0; rowIndex < length; rowIndex += 1) {
                const rawRow = rawRows[rowIndex];
                if (!rawRow) continue;
                const values = {};
                for (const role of this._orderedRoles) {
                    values[role.key] = rawRow[this._indexByRole[role.key]] ?? null;
                }
                mapped.push({
                    rowKey: this._buildStableRowKey(values),
                    values,
                    displayValues: this._formatRoleValues(values)
                });
            }
            this.rows = this._sortReturnedRows(mapped);
        } catch (error) {
            this._isQueryRegistered = false;
            this._showError('Unable to display the returned data. Please retry.', error);
            return;
        }
        this._isLoading = false;
        this._hasError = false;
        this._hasNoData = this.rows.length === 0;
        this.sdk.actions?.notifyLifecycleChange?.(
            this._hasNoData ? LIFE_CYCLE.NO_DATA : LIFE_CYCLE.LOADED
        );
    }

    _setLoadingState(generation, { preserveRows = false } = {}) {
        if (!this._isCurrentPipeline(generation)) return;
        if (!preserveRows) this.rows = [];
        this._isLoading = true;
        this._hasError = false;
        this._hasNoData = false;
        clearTimeout(this._loadingTimer);
        this._loadingTimer = setTimeout(() => {
            if (!this._isCurrentPipeline(generation) || !this._isLoading) return;
            this._showError('Data refresh timed out. Please retry.');
        }, LOADING_SAFETY_MS);
    }

    _showError(message, error) {
        clearTimeout(this._loadingTimer);
        if (error) console.error('[vibeTable] data query failed:', error);
        this._isLoading = false;
        this._hasNoData = false;
        this._hasError = true;
        this._errorMessage = message;
        this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.ERROR, { message });
    }

    _isFilterRelevant(payload) {
        const activeModels = new Set(ROLE_DEFINITIONS.map((role) => role.model));
        const payloadModels = this._collectFilterModels(payload);
        return payloadModels.length === 0
            || payloadModels.some((model) => activeModels.has(model));
    }

    _collectFilterModels(payload) {
        const models = [];
        for (const filter of payload?.filters || []) {
            for (const field of filter?.fields || []) {
                if (typeof field?.model === 'string') models.push(field.model);
            }
        }
        return models;
    }

    _buildStableRowKey(values) {
        const identityParts = IDENTITY_ROLE_KEY
            ? [values[IDENTITY_ROLE_KEY]]
            : COMPOSITE_IDENTITY_ROLE_KEYS.map((key) => values[key]);
        if (
            identityParts.length === 0
            || identityParts.every(
                (value) => value === null || value === undefined || String(value) === ''
            )
        ) {
            throw new Error('The configured row identity is empty.');
        }
        return `row-${identityParts.map((value) => String(value ?? '')).join('|')}`;
    }

    _formatRoleValues(values) {
        return Object.fromEntries(
            ROLE_DEFINITIONS.map((role) => [
                role.key,
                this._formatRoleValue(role, values[role.key])
            ])
        );
    }

    _sortReturnedRows(rows) {
        if (!SORT_ROLE_KEY) return rows;
        const direction = SORT_DIRECTION === 'asc' ? 1 : -1;
        return rows.sort((left, right) =>
            direction * this._compareRoleValues(
                left.values[SORT_ROLE_KEY],
                right.values[SORT_ROLE_KEY]
            )
        );
    }
}
```

Generate `IDENTITY_ROLE_KEY`, `COMPOSITE_IDENTITY_ROLE_KEYS`, `SORT_ROLE_KEY`,
`SORT_DIRECTION`, `_formatRoleValue`, and `_compareRoleValues` from the
confirmed contract and active query roles. A timeout must show a user-safe error
and emit `error`; it must not silently hide the spinner. Sort only when the
contract identifies a sort role, and describe the result as sorted within the
returned limit.

## Date-only values

Do not parse Salesforce `YYYY-MM-DD` values through UTC. Users west of UTC can
otherwise see the preceding calendar day. Construct local calendar values from
their numeric parts; retain invalid values rather than rendering `Invalid Date`.

```javascript
_formatDate(value) {
    if (!value) return '';
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const date = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
```

Run this logic under `TZ=America/Los_Angeles` in maintainer validation.

## Template states and result copy

Render loading, error, no-data, and table states explicitly. Give every spinner
non-empty alternative text. The limit is not a global ranking guarantee, so use
bounded, prompt-derived wording in visible and assistive text.

```html
<template lwc:if={isLoading}>
  <lightning-spinner alternative-text={loadingLabel} size="small"></lightning-spinner>
</template>
<template lwc:if={hasError}>
  <p class="slds-text-color_error" role="alert">{errorMessage}</p>
</template>
<template lwc:if={showNoData}>
  <p>{noDataMessage}</p>
</template>
<template lwc:if={showTable}>
  <p class="slds-text-body_small">{boundedResultDescription}</p>
  <table class="slds-table slds-table_cell-buffer" aria-label={tableAccessibleLabel}>
    <!-- Prompt-derived column headings and rows -->
  </table>
</template>
```

Use "returned rows" or "returned groups" for aggregate visualizations, not a
record noun unless an identity dimension defines the result grain.

## Verification

Before generation, run `references/smoke-test-query.md` against the handoff.
After generation, verify:

1. `ROLE_DEFINITIONS`, `specs`, and `indexByRole` have identical role counts.
2. Every dimension precedes every measure.
3. Every qualified raw measure has a supported uppercase aggregation.
4. Every bare calculated measure omits aggregation.
5. The identity or composite produces stable non-empty row keys.
6. The visible field order and labels match the prompt.
7. Dashboard filters update rows without explicit `fetchData()`.
8. Direct, `{ rows }`, and `{ data }` payloads all reach row processing.
9. Delayed SDK assignment starts once through the setter-scheduled microtask.
10. No query startup or synchronization occurs in `renderedCallback`.
