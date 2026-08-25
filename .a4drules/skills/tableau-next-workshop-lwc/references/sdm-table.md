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
      "aggregationType": "Sum",
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
must come from the confirmed prompt and live discovery.

## Query rules

- Subscribe and enter loading before `registerFieldsForQuery`; registration
  may emit `dataUpdate` synchronously.
- Use `registerFieldsForQuery`, not `fetchDataUsingQueryAndSource`, so dashboard
  filters and parameters remain runtime-owned.
- Order every dimension before every measure. Interleaving silently changes
  returned column positions.
- Use bare model names for model-level calculated dimensions, measurements, and
  metrics. Omit `aggregationType` for bare calculated measures.
- Include a verified aggregation for a qualified raw measure.
- Treat `dataUpdate` as the only row input. Filter and parameter handlers only
  update UI state.
- Read positional array-like Proxy rows through role indexes. Do not depend on
  `Array.isArray(row)`.
- Build a stable row key from the confirmed identity role or deterministic
  composite, never from an index alone.

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
        aggregationType: '<verified-aggregation>',
        visible: true,
        valueKind: 'number'
    }
];
```

Compile role order, specs, and indexes from the same array so they cannot drift:

```javascript
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
        if (!role.aggregationType) {
            throw new Error(`Missing aggregation for ${role.key}`);
        }
        return { ...spec, aggregationType: role.aggregationType };
    });
    const indexByRole = Object.fromEntries(
        orderedRoles.map((role, index) => [role.key, index])
    );
    return { orderedRoles, specs, indexByRole };
}
```

This removes the failure mode where a hand-written six-entry index map is used
with a three-field query.

## Recovery pipeline

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
    @api sdk;
    @track rows = [];
    @track _isLoading = true;
    @track _hasError = false;
    @track _hasNoData = false;
    @track _errorMessage = '';

    _connected = false;
    _pipelineStarted = false;
    _pipelineGeneration = 0;
    _isQueryRegistered = false;
    _unsubscribes = [];
    _loadingTimer;

    connectedCallback() {
        this._connected = true;
        this._tryStartPipeline();
    }

    renderedCallback() {
        this._tryStartPipeline();
    }

    disconnectedCallback() {
        this._connected = false;
        this._pipelineGeneration += 1;
        this._pipelineStarted = false;
        this._isQueryRegistered = false;
        this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
        this._unsubscribes = [];
        clearTimeout(this._loadingTimer);
    }

    _tryStartPipeline() {
        if (this._pipelineStarted || !this._connected || !this.sdk) return;
        this._pipelineStarted = true;
        const generation = ++this._pipelineGeneration;
        this._runPipeline(generation);
    }

    _runPipeline(generation) {
        try {
            this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.INIT);
            const query = compileQuery(ROLE_DEFINITIONS);
            this._orderedRoles = query.orderedRoles;
            this._indexByRole = query.indexByRole;
            this._subscribeEvents(generation);
            this._setLoadingState(generation);
            this._isQueryRegistered = true;
            this.sdk.registerFieldsForQuery(query.specs, SOURCE_NAME, {
                limit: QUERY_LIMIT
            });
        } catch (error) {
            if (!this._isCurrentPipeline(generation)) return;
            this._showError(String(error?.message || error));
        }
    }

    _subscribeEvents(generation) {
        if (typeof this.sdk.on !== 'function') return;
        this._unsubscribes = [
            this.sdk.on(SDK_EVENTS.DATA_UPDATE, (rows) => {
                if (this._isCurrentPipeline(generation)) this._processRows(rows);
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

    _processRows(rawRows) {
        clearTimeout(this._loadingTimer);
        if (rawRows === undefined) {
            this._isQueryRegistered = false;
            this._showError('Unable to load data. Please retry.');
            return;
        }
        const length = typeof rawRows?.length === 'number' ? rawRows.length : 0;
        const mapped = [];
        for (let rowIndex = 0; rowIndex < length; rowIndex += 1) {
            const rawRow = rawRows[rowIndex];
            if (!rawRow) continue;
            const values = {};
            for (const role of this._orderedRoles) {
                values[role.key] = rawRow[this._indexByRole[role.key]] ?? null;
            }
            mapped.push({
                rowKey: this._buildStableRowKey(values, rowIndex),
                values,
                displayValues: this._formatRoleValues(values)
            });
        }
        this.rows = this._sortReturnedRows(mapped);
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

    _showError(message) {
        clearTimeout(this._loadingTimer);
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

    _buildStableRowKey(values, rowIndex) {
        const identity = IDENTITY_ROLE_KEY
            ? values[IDENTITY_ROLE_KEY]
            : COMPOSITE_IDENTITY_ROLE_KEYS.map((key) => values[key]).join('|');
        return `row-${rowIndex}-${String(identity ?? '')}`;
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
confirmed contract and active query roles. A
timeout must show a user-safe error and emit `error`; it must not silently hide
the spinner. Sort only when the contract identifies a sort role, and describe
the result as sorted within the returned limit.

## Verification

Before generation, run `references/smoke-test-query.md` against the handoff.
After generation, verify:

1. `ROLE_DEFINITIONS`, `specs`, and `indexByRole` have identical role counts.
2. Every dimension precedes every measure.
3. Every qualified raw measure has a confirmed aggregation.
4. Every bare calculated measure omits aggregation.
5. The identity or composite produces stable non-empty row keys.
6. The visible field order and labels match the prompt.
7. Dashboard filters update rows without explicit `fetchData()`.
