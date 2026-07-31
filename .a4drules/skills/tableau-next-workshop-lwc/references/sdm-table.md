# sdm-table — Tableau Next SDM-backed table (Build 1 pattern)

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

- **5-step SDK pipeline** — `registerDataSource` → `getJson` →
  `notifyLifecycleChange('init')` → `_subscribeEvents()` →
  `registerFieldsForQuery`. Order is not negotiable. See SKILL.md
  "The canonical SDK pipeline".
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
    // 1. Required — without it, workloadName=undefined-undefined.
    this.sdk.registerDataSource(SOURCE_NAME);

    // 2. Warm SDM JSON — surfaces auth errors early.
    const src = await this.sdk.getDataSource?.(SOURCE_NAME);
    src?.getJson?.();

    // 3. Lifecycle: init.
    this.sdk.actions?.notifyLifecycleChange?.('init');

    // 4. Build specs: dims FIRST, measures LAST. Gate #8.
    const specs = [
        { model: `${OBJ_OPPORTUNITY}.<dim-apiName>`, rowGrouping: true  },
        { model: `${OBJ_ACCOUNT}.<dim-apiName>`,     rowGrouping: true  },
        { model: '<calc-measure-apiName>_clc',       rowGrouping: false }
        // NO aggregationType on _clc — SDM owns it.
    ];

    // 5. Subscribe BEFORE register — DATA_UPDATE can fire synchronously.
    this._subscribeEvents();

    // 6. Register — SDK fetches + auto-refetches on filter/param changes.
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
            this.sdk.registerDataSource(SOURCE_NAME);
            try { (await this.sdk.getDataSource?.(SOURCE_NAME))?.getJson?.(); } catch (e) { /* warn */ }
            this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.INIT);
            const specs = [
                { model: `${OBJ_OPPORTUNITY}.<dim-apiName>`, rowGrouping: true },
                { model: `${OBJ_ACCOUNT}.<dim-apiName>`,     rowGrouping: true },
                { model: '<calc-measure-apiName>_clc',       rowGrouping: false }
            ];
            this._subscribeEvents();
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
