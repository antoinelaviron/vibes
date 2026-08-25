# sdm-table - hard-coded recovery pattern

**Recovery mode only.** Native data binding is the default Build 1 path; read
`references/sdm-data-binding.md` first. Use this file only when the attendee
explicitly asks for the basic hard-coded wire contract or needs recovery.

**What this teaches:** how to render a table inside an
`analytics__Dashboard` LWC whose rows come from a semantic data model
and re-fetch automatically whenever a dashboard filter or parameter
changes. This is the foundation every build in the workshop layers on
top of.

**Do NOT copy this file verbatim into `force-app/…`.** Every apiName,
`SOURCE_NAME`, and object constant is a placeholder — the real values
come from the discovery hand-off JSON produced by
`tableau-next-workshop-sdm-discovery` in the current session.

## Rules

- **Registered SDK pipeline** — subscribe and set loading before
  `registerFieldsForQuery`. The method registers the source and fetches data
  internally. Do not call a private `registerDataSource` method.
- **`registerFieldsForQuery`, never `fetchDataUsingQueryAndSource`.**
  Only the register-fields path lets the dashboard runtime inject
  filter/parameter context on refetch. See SKILL.md Gate #7.
- **Spec order: all dimensions first, all measures last.** The SDK
  silently reorders columns so `rowGrouping: true` specs come first —
  interleaved specs desync your `IDX` map by one column and the
  classic symptom is a numeric value showing up where a text ID
  should be. See SKILL.md Gate #8.
- **`_clc` / `_mtc` fields:** bare `model: 'MyCalc_clc'` (no
  `Object.` prefix), and **omit `aggregationType`** — the SDM already
  owns aggregation. Setting one triggers *"Summary formula cannot
  have aggregation method different than NONE/AUTO/USER_AGG"*.
- **`DATA_UPDATE` is the only data path.** `filterChange` and
  `parameterChange` are UI-only signals — set a loading flag, never
  call `fetchData()`. See SKILL.md Gate #7.
- **Subscribe before register.** `DATA_UPDATE` can fire synchronously
  inside `registerFieldsForQuery`; wiring the listener after the call
  loses the initial payload.
- **Rows are positional array-like Proxies.** `Array.isArray(row)` is
  `false` but `row[i]` and `row.length` work. Access by `IDX` only.
- **`for:each` `key` cannot be the index alone** (LWC1065). Compose
  a stable `rowKey` from index + a stable field.

## Annotated snippet — the pipeline

```javascript
async _runPipeline() {
    // 1. Lifecycle: init.
    this.sdk.actions?.notifyLifecycleChange?.('init');

    // 2. Build specs: dims FIRST, measures LAST. Gate #8.
    const specs = [
        { model: `${OBJ_OPPORTUNITY}.<dim-apiName>`, rowGrouping: true  },
        { model: `${OBJ_ACCOUNT}.<dim-apiName>`,     rowGrouping: true  },
        { model: '<calc-measure-apiName>_clc',       rowGrouping: false }
        // NO aggregationType on _clc — SDM owns it.
    ];

    // 3. Subscribe and set loading BEFORE register.
    this._subscribeEvents();
    this._setLoadingState();

    // 4. Register — SDK registers the source, fetches, and auto-refetches.
    this.sdk.registerFieldsForQuery(specs, SOURCE_NAME, { limit: QUERY_LIMIT });
}
```

## Full placeholder-ified pattern

Every `<placeholder>` token below MUST be replaced from the discovery
hand-off. Do **not** copy this file wholesale.

```javascript
import { LightningElement, api, track } from 'lwc';

const SDK_EVENTS = { DATA_UPDATE: 'dataUpdate', FILTER_CHANGE: 'filterChange', PARAMETER_CHANGE: 'parameterChange' };
const LIFE_CYCLE = { INIT: 'init', LOADED: 'loaded', ERROR: 'error', NO_DATA: 'nodata' };

const SOURCE_NAME     = '<sdm-apiName-from-discovery>';
const OBJ_OPPORTUNITY = '<object-apiName-from-discovery>';
const OBJ_ACCOUNT     = '<object-apiName-from-discovery>';
const QUERY_LIMIT     = 25;
const LOADING_SAFETY_MS = 8000;

// IDX order MUST match specs[] order: dims first, measures last.
const IDX = { OPPORTUNITY_ID: 0, ACCOUNT_NAME: 1, STAGE: 2, CLOSE_DATE: 3, TYPE: 4, AMOUNT: 5 };

export default class VibeTable extends LightningElement {
    @api sdk;
    @track rows = []; @track _isLoading = true; @track _hasError = false; @track _errorMessage = '';
    _pipelineStarted = false; _isQueryRegistered = false; _unsubscribes = []; _loadingTimer = null;

    connectedCallback() { this._tryStartPipeline(); }
    renderedCallback()  { this._tryStartPipeline(); }
    disconnectedCallback() {
        this._unsubscribes.forEach((u) => typeof u === 'function' && u());
        if (this._loadingTimer) clearTimeout(this._loadingTimer);
    }
    _tryStartPipeline() {
        if (this._pipelineStarted || !this.sdk) return;
        this._pipelineStarted = true;
        this._runPipeline();
    }
    async _runPipeline() {
        try {
            this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.INIT);
            const specs = [
                { model: `${OBJ_OPPORTUNITY}.<dim-apiName>`, rowGrouping: true },
                { model: `${OBJ_ACCOUNT}.<dim-apiName>`,     rowGrouping: true },
                { model: '<calc-measure-apiName>_clc',       rowGrouping: false }
            ];
            this._subscribeEvents();
            this._setLoadingState();
            this.sdk.registerFieldsForQuery(specs, SOURCE_NAME, { limit: QUERY_LIMIT });
            this._isQueryRegistered = true;
        } catch (err) {
            this._hasError = true; this._errorMessage = String(err?.message || err); this._isLoading = false;
            this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.ERROR, { message: this._errorMessage });
        }
    }
    _subscribeEvents() {
        if (typeof this.sdk.on !== 'function') return;
        this._unsubscribes.push(
            this.sdk.on(SDK_EVENTS.DATA_UPDATE, (rows) => this._handleDataUpdate(rows)),
            this.sdk.on(SDK_EVENTS.FILTER_CHANGE,    () => this._isQueryRegistered && this._setLoadingState()),
            this.sdk.on(SDK_EVENTS.PARAMETER_CHANGE, () => this._isQueryRegistered && this._setLoadingState())
        );
    }
    _handleDataUpdate(raw) {
        if (this._loadingTimer) clearTimeout(this._loadingTimer);
        const rows = raw == null ? [] : raw;
        const len = typeof rows.length === 'number' ? rows.length : 0;
        const mapped = [];
        for (let i = 0; i < len; i++) {
            const r = rows[i]; if (!r) continue;
            mapped.push({
                rowKey: `row-${i}-${r[IDX.OPPORTUNITY_ID] || ''}`,
                opportunityId: r[IDX.OPPORTUNITY_ID] ?? null,
                accountName:   r[IDX.ACCOUNT_NAME]   ?? null,
                amount:        Number(r[IDX.AMOUNT]) || 0
            });
        }
        this.rows = mapped.sort((a, b) => (b.amount || 0) - (a.amount || 0));
        this._isLoading = false; this._hasError = false;
        this.sdk.actions?.notifyLifecycleChange?.(this.rows.length ? LIFE_CYCLE.LOADED : LIFE_CYCLE.NO_DATA);
    }
    _setLoadingState() {
        this._isLoading = true;
        if (this._loadingTimer) clearTimeout(this._loadingTimer);
        this._loadingTimer = setTimeout(() => { if (this._isLoading) this._isLoading = false; }, LOADING_SAFETY_MS);
    }
    get hasRows() { return this.rows.length > 0; }
}
```

## See also

- SKILL.md gates: **#2** (discovery-first), **#7** (register vs fetch),
  **#8** (spec order), **#9** (`OBJ_` naming).
- `references/smoke-test-query.md` — validate the SDM query with `curl`
  before writing the LWC.
- `references/apex-insight-panel.md` — Build 2 layers a per-row panel
  onto this pattern.
- `references/sdm-data-binding.md` - default role-based metadata and runtime
  rebinding pattern.
