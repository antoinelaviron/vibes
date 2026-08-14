# sdk-query-lifecycle - Tableau SDK startup, refresh, and reconnect pattern

Use this reference for every data-backed workshop extension. It is the single
authority for SDK lifecycle code; `sdm-table.md` and chart references own only
their query and rendering details.

## Contents

- [Invariant order](#invariant-order)
- [Canonical component pattern](#canonical-component-pattern)
- [Filter and parameter signals](#filter-and-parameter-signals)
- [Disconnect and reconnect](#disconnect-and-reconnect)
- [Failure states](#failure-states)

## Invariant Order

`registerFieldsForQuery` is the dashboard-aware query path. Keep this sequence:

```text
1. registerDataSource(sourceName)
2. bounded source hydration attempt
3. notifyLifecycleChange('init')
4. subscribe to SDK events
5. set loading state and install timeout
6. registerFieldsForQuery(specs, sourceName, { limit })
```

Hydration is a warning-only warmup. Start it after source registration, wait no
longer than its small budget, and continue after timeout or rejection. A pending
`getDataSource()` must not leave the tile permanently initializing. Subscribe
and set loading before registration because `dataUpdate` may arrive
synchronously from registration.

`DATA_UPDATE` is the only path that mutates rows. Do not call `fetchData()`
explicitly after registration or from filter/parameter events.

## Canonical Component Pattern

Replace every placeholder from live discovery. Keep dimensions before measures
and keep `IDX` in the SDK's dimensions-then-measures return order.

```javascript
import { LightningElement, api, track } from 'lwc';

const SDK_EVENTS = {
    DATA_UPDATE: 'dataUpdate',
    FILTER_CHANGE: 'filterChange',
    PARAMETER_CHANGE: 'parameterChange'
};
const LIFE_CYCLE = { INIT: 'init', LOADED: 'loaded', ERROR: 'error', NO_DATA: 'nodata' };
const HYDRATION_TIMEOUT_MS = 250;
const LOADING_TIMEOUT_MS = 8000;
const TIMEOUT_MESSAGE = 'Data refresh timed out';

export default class ExampleExtension extends LightningElement {
    @api sdk;
    @track rows = [];
    @track _isLoading = true;
    @track _hasError = false;
    @track _errorMessage = '';

    _connected = false;
    _pipelineStarted = false;
    _pipelineGeneration = 0;
    _isQueryRegistered = false;
    _unsubscribes = [];
    _loadingTimer = null;

    connectedCallback() {
        this._connected = true;
        this._tryStartPipeline();
    }

    renderedCallback() {
        this._tryStartPipeline(); // sdk is injected after connectedCallback.
    }

    disconnectedCallback() {
        this._connected = false;
        this._pipelineGeneration += 1;
        this._pipelineStarted = false;
        this._isQueryRegistered = false;
        this.rows = [];
        this._clearLoadingTimer();
        this._unsubscribes.forEach((unsubscribe) => unsubscribe?.());
        this._unsubscribes = [];
    }

    _tryStartPipeline() {
        if (this._pipelineStarted || !this.sdk) return;
        this._pipelineStarted = true;
        const generation = ++this._pipelineGeneration;
        this._runPipeline(generation);
    }

    _isCurrentPipeline(generation) {
        return this._connected && generation === this._pipelineGeneration;
    }

    async _runPipeline(generation) {
        try {
            this.sdk.registerDataSource(SOURCE_NAME);
            await this._hydrateSource(SOURCE_NAME, generation);
            if (!this._isCurrentPipeline(generation)) return;

            this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.INIT);
            const specs = this._buildSpecs();
            this._subscribeEvents(generation);
            if (!this._isCurrentPipeline(generation)) return;

            this._setLoadingState(generation);
            // dataUpdate can arrive synchronously from registration, so mark the
            // query active after loading starts but before registering it.
            this._isQueryRegistered = true;
            this.sdk.registerFieldsForQuery(specs, SOURCE_NAME, { limit: QUERY_LIMIT });
        } catch (error) {
            if (this._isCurrentPipeline(generation)) {
                this._isQueryRegistered = false;
                this._setTerminalError(error);
            }
        }
    }

    async _hydrateSource(sourceName, generation) {
        let timer;
        try {
            const hydration = Promise.resolve(this.sdk.getDataSource?.(sourceName))
                .then((source) => source?.getJson?.());
            const timeout = new Promise((resolve) => {
                timer = setTimeout(resolve, HYDRATION_TIMEOUT_MS);
            });
            await Promise.race([hydration, timeout]);
        } catch (error) {
            console.warn('[extension] source hydration warning:', error);
        } finally {
            clearTimeout(timer);
        }
    }
}
```

Finish the pattern with these lifecycle methods. Keep SDK event callbacks and
timers generation-aware so late work from a disconnected instance cannot mutate
a reconnected tile.

```javascript
_subscribeEvents(generation) {
    if (typeof this.sdk.on !== 'function') return;
    this._unsubscribes.push(
        this.sdk.on(SDK_EVENTS.DATA_UPDATE, (raw) => {
            if (this._isCurrentPipeline(generation)) this._handleDataUpdate(raw, generation);
        }),
        this.sdk.on(SDK_EVENTS.FILTER_CHANGE, (payload) => {
            if (
                this._isCurrentPipeline(generation) &&
                this._isQueryRegistered &&
                this._isRelevantFilterChange(payload)
            ) {
                this._setLoadingState(generation);
            }
        }),
        this.sdk.on(SDK_EVENTS.PARAMETER_CHANGE, () => {
            if (this._isCurrentPipeline(generation) && this._isQueryRegistered) {
                this._setLoadingState(generation);
            }
        })
    );
}

_handleDataUpdate(raw, generation) {
    if (!this._isCurrentPipeline(generation)) return;
    this._clearLoadingTimer();
    const mapped = this._mapRows(raw == null ? [] : raw);
    this.rows = mapped;
    this._isLoading = false;
    this._hasError = false;
    this.sdk.actions?.notifyLifecycleChange?.(
        mapped.length ? LIFE_CYCLE.LOADED : LIFE_CYCLE.NO_DATA
    );
}

_setLoadingState(generation) {
    this.rows = [];
    this._isLoading = true;
    this._hasError = false;
    this._errorMessage = '';
    this._clearLoadingTimer();
    this._loadingTimer = setTimeout(() => {
        if (this._isCurrentPipeline(generation) && this._isLoading) {
            this._setTerminalError(new Error(TIMEOUT_MESSAGE), TIMEOUT_MESSAGE);
        }
    }, LOADING_TIMEOUT_MS);
}

_setTerminalError(error, publicMessage = 'Unable to load data. Please try again.') {
    this._clearLoadingTimer();
    console.error('[extension] data query failed:', error);
    this._isLoading = false;
    this._hasError = true;
    this._errorMessage = publicMessage;
    this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.ERROR, {
        message: this._errorMessage
    });
}

_clearLoadingTimer() {
    if (this._loadingTimer) clearTimeout(this._loadingTimer);
    this._loadingTimer = null;
}
```

## Filter And Parameter Signals

Filter and parameter events are UI signals only. The dashboard runtime refetches
the registered query and later sends `dataUpdate`.

When a filter payload clearly identifies an unrelated object or model, ignoring
it avoids clearing a tile that will not receive an update. This is a best-effort
UX optimization, not query correctness: unknown or missing payload structures
must be treated as relevant. Build the relevance set from the query's objects
and model-level measures. A filter on a non-projected field of a queried object
can still affect results, so do not match only the exact specs.

```javascript
_isRelevantFilterChange(payload) {
    const models = this._collectFilterModels(payload);
    if (!models.length) return true;
    return models.some((model) => {
        if (!model.includes('.') && model !== OBJ_OPPORTUNITY && model !== OBJ_ACCOUNT) {
            // A bare field name cannot identify its object reliably.
            return true;
        }
        return (
            model === OBJ_OPPORTUNITY ||
            model === OBJ_ACCOUNT ||
            model.startsWith(`${OBJ_OPPORTUNITY}.`) ||
            model.startsWith(`${OBJ_ACCOUNT}.`) ||
            model === 'Total_Amount_clc'
        );
    });
}

_collectFilterModels(payload) {
    const models = [];
    const visit = (value, key = '') => {
        if (typeof value === 'string') {
            if (/^(model|field|fieldName|measure|source|object)$/i.test(key)) {
                models.push(value);
            }
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => visit(item, key));
            return;
        }
        if (value && typeof value === 'object') {
            Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey));
        }
    };
    visit(payload);
    return models;
}
```

Use a query-specific relevance set. For example, a chord query that uses
`Number_of_Opportunities_clc` must include that model-level measure.

## Disconnect And Reconnect

Resetting only subscriptions is insufficient: `_pipelineStarted` would otherwise
block a reconnected component forever. Disconnect must invalidate asynchronous
continuations, reset query registration, clear timers and buffered state, and
allow `renderedCallback` to start a new generation. D3 components add their
own script-load, render, and resize cleanup in `d3-in-lwc.md`.

## Failure States

- `init` marks setup only. Do not emit it after the component starts loading;
  the dashboard does not publish ready for this state.
- `loaded`, `nodata`, and `error` are terminal lifecycle outcomes and publish
  component readiness.
- An absent initial `dataUpdate` must become a visible error, not a blank tile
  or an indefinitely spinning indicator.
- Do not replace a terminal D3 error with later hydration or SDK callbacks.
