---
name: tableau-next-workshop-lwc
description: |
  Build a Tableau Next dashboard extension LWC for the DF26 workshop.
  Use when the user asks to create, scaffold, or evolve a Tableau Next
  extension for the DF26 workshop. Triggers on "Tableau Next dashboard
  extension", "vibeTable", "vibeInsight", "vibeAction",
  "analytics__Dashboard", or workshop-context requests to build/grow one
  of the three workshop LWCs.
  Do NOT use for generic Lightning pages (Home / Record / App). Do NOT use for
  Tableau Cloud Extensions API (.trex files). Do NOT use for calculated field
  or metric creation — that's tableau-next-workshop-sdm-discovery's territory.
license: Apache-2.0
metadata:
  author: alaviron
  version: workshop-3.0
  fork_of: tableau-next-custom-lwc
  api-version: v66.0
---

# tableau-next-workshop-lwc

**Fork of `tableau-next-custom-lwc`, narrowed for the DF26 workshop.** One
workshop, three LWCs, one hour on stage. Everything not on that path was
deleted.

**Do not reuse outside DF26.** For production LWC work, use the canonical
`tableau-next-custom-lwc` skill at `alaviron/tableau-skills`.

## The three builds — one LWC per build

Each build creates a NEW LWC. Attendees do NOT edit a single file across
prompts. Build 1 is scaffolded from scratch (with the SDK pipeline
plumbed in via the discovery skill). Builds 2 and 3 start from the
attendee's own deployed LWC from the previous build — that's the
natural source of truth, and mirrors what a stuck attendee would do
if the facilitator handed them the recovery kit.

| Build | LWC folder | Reference pattern | What it does |
|---|---|---|---|
| **1** | `lwc/vibeTable/` | `references/sdm-table.md` | Table of top 25 opportunities from the SDM, reacts to filters |
| **2** | `lwc/vibeInsight/` | `references/sdm-table.md` + `references/apex-insight-panel.md` | Build 1 + per-row Insight button → AI narrative panel |
| **3** | `lwc/vibeAction/` | prior two + `references/salesforce-action-link.md` | Build 2 + per-row Log a Call button |

**Why per-build LWCs**: each build lands as a distinct, working file
so the attendee sees three deploys succeed in a row and can point back
at each one on the dashboard. An attendee who falls behind is unblocked
by the facilitator recovery kit (outside this skill), not by copying an
asset out of it.

**Why hardcoded field names** (no `@api` config): this is a workshop —
attendees see literal values in the code. Cleaner, faster to grasp.

## Critical gates (must follow)

1. **Read the matching pattern reference before writing code.** Every
   build has a reference under `references/` (see the build table
   above). Read it — the rules, the annotated snippet, the placeholder
   full-file — then author the LWC from the attendee's prompt matching
   that shape. Do NOT dump the reference file to the attendee as-is.
   Do NOT copy `SOURCE_NAME`, object apiNames, or field apiNames
   verbatim — every placeholder in the reference comes from the
   discovery hand-off (Gate #2). The attendee needs to see code get
   authored from their prompt, not watch you paste a starter. For
   Builds 2 and 3, also read the attendee's already-deployed LWC from
   the previous build (`force-app/main/default/lwc/vibe<Prev>/`) —
   that's the natural source of truth for the query shape, the `IDX`
   map, and the sort order, so the new file stays consistent with what
   they wrote.

2. **Discovery-first for Build 1 — live discovery, not cached mapping.**
   Never write SDK code until you have a hand-off JSON from
   `tableau-next-workshop-sdm-discovery` whose values came from a live
   `sf api request rest /services/data/v66.0/ssot/semantic/models[/…]`
   call against the attendee's org **in this session**. Cached mappings
   from the discovery skill's `references/field-mapping-table.md` are
   NOT acceptable substitutes — that file is a hint fallback, not a data
   source. If no live-discovery hand-off exists, STOP and call the
   discovery skill. Get explicit "yes" from the attendee on the mapping
   before you generate SDK pipeline code. Never hardcode `SOURCE_NAME`,
   table names, or field apiNames from example blocks in this file or
   any reference file.

3. **SLDS-first styling.** Use SLDS utility classes. Avoid inline
   `<div style="…">`. A small `<lwc>.css` for iframe-safe layout tweaks
   (min-heights, borders) is fine — see Build 2/3 canonical files.

4. **Never call the Models API from JS (Build 2).** Always via an
   `@AuraEnabled` Apex method. This is Trust Layer routing — non-negotiable.

5. **Never invent an Apex method name (Build 2).** Read
   `force-app/main/default/classes/OpportunityInsightGenerator.cls` in this
   repo. Use the exact `@AuraEnabled` method name and parameter shape.

6. **Origin rewrite for Salesforce navigation (Build 3).** Any `/lightning/…`
   URL must be rewritten from the analytics domain to the Lightning domain.
   `NavigationMixin` does NOT work inside `*--analytics.<domain>`.

7. **Fetch via `registerFieldsForQuery` (Builds 1+).** NEVER
   `fetchDataUsingQueryAndSource`. This is the ONLY path that lets the
   dashboard's active filters and parameters flow into the query
   automatically. `fetchDataUsingQueryAndSource` sends `queryJson`
   verbatim to the semantic engine — filters/parameters do NOT flow,
   the widget re-renders identical data on every filter change, and
   there is no supported wire shape for injecting them manually (the
   `StructuredSemanticQuery` message has no `filters` field —
   HAR-verified against a live viz payload, 2026-07-29). See
   "The canonical SDK pipeline" below for the required order of calls.

8. **Spec order rule: declare ALL dimensions BEFORE any measure.**
   `registerFieldsForQuery` returns rows whose columns are grouped by
   `rowGrouping` — every `rowGrouping: true` spec is delivered first,
   every `rowGrouping: false` spec last, regardless of the order you
   declared them. **Interleaving is silently reordered.** If you declare
   `[dim, dim, dim, measure, dim]`, the row Proxy comes back as
   `[dim, dim, dim, dim, measure]` and your `IDX` map is off by one —
   the classic symptom is a numeric value showing up where a text ID
   or label should be (e.g. `recordId=4822.56` in a Log a Call URL,
   verified 2026-07-29 on the workshop template SDM).
   
   Rule: keep the `specs[]` array grouped — all `rowGrouping: true`
   first, all `rowGrouping: false` last. Then build the `IDX` map in the
   same order the SDK will return columns. When adding a field in a
   later build, insert it in the correct group — dimensions go before
   any existing measure, never after.

9. **Naming: use "object" for SDM tables, never "SDO".** The Sales Cloud
   semantic model has *objects* (Account, Opportunity, etc.), not "SDOs".
   When you declare per-object constants in the LWC, prefix them `OBJ_`,
   not `SDO_` — e.g. `const OBJ_OPPORTUNITY = 'Opportunity'`. "SDO" is
   internal-Salesforce jargon and does not appear anywhere else in the
   workshop. Do not emit it in code, comments, or attendee-facing prose.

10. **Use the canonical "How to add it to your dashboard" wording after
    every successful deploy.** See "Post-deploy: telling the attendee how
    to add the widget" below. Do NOT invent your own steps — the picker
    UI is not where Lightning App Builder puts custom components, and
    getting the placement wrong wastes 5 minutes per attendee looking for
    a "puzzle-piece Components tab" that doesn't exist.

## Post-deploy: telling the attendee how to add the widget

After a successful `sf project deploy start ... --source-dir ...`,
paste this exact block back to the attendee. Do not paraphrase, do not
add steps, do not reference Analytics Studio, a left panel, a
Components tab, or a puzzle-piece icon — none of those apply.

> Deploy succeeded — `<lwc-name>` is live in your org.
>
> **How to add it to your dashboard:**
>
> 1. Open your Tableau Next dashboard **in edit mode** (from the Tableau
>    tab in your org).
> 2. In the **toolbar across the top of the dashboard**, click the
>    **lightning-bolt icon** (tooltip: "Extension") — it's toward the
>    right end of the icon row.
> 3. The extensions picker opens with a list of your custom LWC
>    extensions. Find **`Vibe <Name>`** in that list.
> 4. Drag it onto your dashboard canvas.
>
> That's it. The widget renders on drop.

Substitute `<lwc-name>` with the folder name (e.g. `vibeTable`) and
`Vibe <Name>` with the `<masterLabel>` from the meta.xml
(e.g. `Vibe Table`). No other wording changes.

---

## Build 1 — Data table (the SDK pipeline)

**Attendee prompt shape:** "Create a Tableau Next dashboard extension
called `vibeTable` — a table of my top opportunities."

**Your job:**

1. **Call `tableau-next-workshop-sdm-discovery` FIRST.** Do not proceed
   without a confirmed field mapping. Present the mapping to the attendee,
   wait for "yes".

2. **Scaffold `force-app/main/default/lwc/vibeTable/` from scratch.**
   Three files (`vibeTable.js`, `vibeTable.html`, `vibeTable.js-meta.xml`),
   `<target>analytics__Dashboard</target>`, class `VibeTable`,
   `<masterLabel>Vibe Table</masterLabel>`, `apiVersion` 60+.
   Consult `references/sdm-table.md` for the exact shape — every apiName
   and `SOURCE_NAME` still comes from the discovery hand-off. See
   "The canonical SDK pipeline" and "The canonical Build 1 file" below.

3. **Write the pipeline using `registerFieldsForQuery`.** The 5-step
   order (registerDataSource → getJson → notifyLifecycleChange(init) →
   subscribe → registerFieldsForQuery) is not negotiable. `dataUpdate`
   is the only data path. Never call `fetchData()`. See the canonical
   file below for the exact shape.

4. **The attendee needs to see Vibes author from their prompt**, not
   receive a pre-baked file. Read the canonical file to know the shape,
   then generate the LWC from the attendee's prompt matching that shape.

### The canonical SDK pipeline — HAR-verified 2026-07-29

**The 5-step order below is not negotiable.** Skipping any step (or
reordering) reproduces the exact failure the old workshop test hit on
2026-07-10: silent no-op, `workloadName=undefined-undefined` in the
Network payload, wasted attendee time.

```
1. registerDataSource(sourceName)                  — idempotent, required
2. await getDataSource(sourceName).getJson()       — warms the source
3. notifyLifecycleChange('init')                   — mark initializing
4. _subscribeEvents()                              — BEFORE register
5. registerFieldsForQuery(specs, sourceName, {limit}) — SDK fetches +
                                                       emits DATA_UPDATE
                                                       + auto-refetches
                                                       on filter/param
```

Rules that make the pipeline work:

- **`registerDataSource` is mandatory.** Without it `registerFieldsForQuery`
  fires with `workloadName=undefined-undefined` and gets rejected.
- **Subscribe BEFORE register.** `DATA_UPDATE` can fire synchronously
  inside `registerFieldsForQuery`'s internal fetch — subscribe first or
  miss the initial payload.
- **`DATA_UPDATE` is the only data path.** Not `filterChange`, not
  `parameterChange`, not an explicit `fetchData()`. See "Event handlers"
  below.
- **Never call `fetchData()` yourself.** `registerFieldsForQuery` calls
  it internally. A second call races and triggers `setErrorState`.

### Field-shape rules (the specs passed to registerFieldsForQuery)

Each spec is a `SemanticQueryField`: `{ model, rowGrouping, aggregationType? }`.

| Field kind | `model` | `rowGrouping` | `aggregationType` |
|---|---|---|---|
| Raw table dimension | `"Object.field"` (qualified) | `true` | omit |
| Raw table measure | `"Object.field"` (qualified) | `false` | `'Sum'` (or `'Avg'`, `'Min'`, `'Max'`, `'Count'`, `'CountDistinct'`) |
| Model-level `*_clc` calc | `"MyCalc_clc"` (**BARE — no object prefix**) | `false` | **omit — do NOT set** |
| Model-level `*_mtc` metric | `"MyMetric_mtc"` (**BARE — no object prefix**) | `false` | **omit — do NOT set** |

**The `aggregationType` rule is the single biggest failure mode.** Setting
it on a `_clc` / `_mtc` field produces the semantic engine error:

> *Summary formula cannot have aggregation method different than NONE/AUTO/USER_AGG*

The SDM already owns the aggregation for these fields (`UserAgg`,
`Average`, etc.) — passing `aggregationType: 'Sum'` overrides it to
`SEMANTIC_AGGREGATION_METHOD_SUM` and the engine rejects. Leave it off.

### The calc-measure lesson (this is where 90% of first attempts fail)

A calc measure like `Total_Amount_clc` is **not addressable as an
object-qualified field**. If you write `model: "Opportunity.Total_Amount_clc"`,
the semantic layer's error is:

> *The field Total_Amount_clc does not exist in table Opportunity.*

That's because `_clc` fields are **model-scoped**, not object-scoped.
Their expression can reference multiple objects — e.g.
`SUM([Opportunity_Product].[Product_Quantity] * [Opportunity_Product].[List_Price_Amount])`.
The field lives at the SDM level; the `model` string stays bare.

- Every raw dimension → `"Object.field"`, `rowGrouping: true`.
- Every raw measure → `"Object.field"`, `rowGrouping: false`, `aggregationType: '<Sum|Avg|…>'`.
- Every `_clc` / `_mtc` field → bare `"apiName"`, `rowGrouping: false`,
  **NO `aggregationType`**.

### Row-shape rules

- Rows returned via `DATA_UPDATE` are **positional array-like Proxies**.
  `row[i]` works. `Array.isArray(row)` is `false`. `.length` works.
  **Access by index.**
- Declaration order in the `specs[]` array == row column order. Keep an `IDX` map:

    ```javascript
    const IDX = {
      OPPORTUNITY_ID: 0,
      ACCOUNT_NAME: 1,
      STAGE: 2,
      // ...
    };
    ```

- `for:each` in the template requires a unique `key` — cannot be `i` alone.
  Compose one:

    ```javascript
    rowKey: `row-${i}-${row[IDX.OPPORTUNITY_ID] || ''}`
    ```

### Filter/parameter — flows automatically (VERIFIED)

`registerFieldsForQuery` registers the query with the dashboard runtime.
The runtime owns the query and re-fires it automatically whenever
dashboard filters or parameters change, injecting the current filter
context on every refetch. **You do not build a `filters` clause. You do
not read `dashboardState.filters`. You do not call `fetchData()`.**

Event handlers are UI-only:

```javascript
_subscribeEvents() {
    this._unsubscribes.push(
        // DATA_UPDATE: the SDK's fired-for-you path. This is the ONLY
        // place row state gets mutated. Fires for initial load AND for
        // every SDK-driven refetch (filter, parameter, dataspace).
        this.sdk.on('dataUpdate', (rows) => this._handleDataUpdate(rows)),

        // filterChange / parameterChange: UI-only signals. Flip a
        // loading flag; DO NOT call fetchData() — SDK refetches
        // internally and a second call races and errors the widget.
        this.sdk.on('filterChange',    () => this._setLoadingState()),
        this.sdk.on('parameterChange', () => this._setLoadingState())
    );
}
```

**Verified working, 2026-07-29** against the workshop template SDM on
`orgfarm-5fc1b8c97a`: change an Account_Name filter on the dashboard →
`filterChange` fires (spinner) → SDK refetches with the new filter
context → `DATA_UPDATE` arrives with the filtered rows → widget renders.
Zero code from us builds the filter clause.

### The canonical Build 1 file (registerFieldsForQuery pipeline)

**Every apiName and `SOURCE_NAME` value below is a placeholder. They
MUST come from the discovery hand-off JSON produced by
`tableau-next-workshop-sdm-discovery` in this session. Copying the
tokens verbatim will fail on any attendee org.**

```javascript
import { LightningElement, api, track } from 'lwc';

const TAG = '[vibeTable]';

const SDK_EVENTS = {
    DATA_UPDATE: 'dataUpdate',
    FILTER_CHANGE: 'filterChange',
    PARAMETER_CHANGE: 'parameterChange'
};

const LIFE_CYCLE = {
    INIT: 'init',
    LOADED: 'loaded',
    ERROR: 'error',
    NO_DATA: 'nodata'
};

// From discovery hand-off — SDM apiName in the attendee's org.
const SOURCE_NAME = '<from discovery hand-off — do NOT copy>';

// Per-object constants — use OBJ_ prefix, never SDO_.
const OBJ_OPPORTUNITY = '<object-apiName-from-discovery>';
const OBJ_ACCOUNT     = '<object-apiName-from-discovery>';

const QUERY_LIMIT = 25;

// Order MUST match specs[] declaration order in _runPipeline.
const IDX = {
    OPPORTUNITY_ID: 0,
    ACCOUNT_NAME:   1,
    STAGE:          2,
    CLOSE_DATE:     3,
    TYPE:           4,
    AMOUNT:         5
};

const LOADING_SAFETY_MS = 8000;

export default class VibeTable extends LightningElement {
    @api sdk;

    @track rows = [];
    @track _isLoading = true;
    @track _hasError = false;
    @track _errorMessage = '';

    _pipelineStarted = false;
    _isQueryRegistered = false;
    _unsubscribes = [];
    _loadingTimer = null;

    connectedCallback() { this._tryStartPipeline(); }
    renderedCallback() { this._tryStartPipeline(); }

    disconnectedCallback() {
        this._unsubscribes.forEach((u) => typeof u === 'function' && u());
        this._unsubscribes = [];
        if (this._loadingTimer) { clearTimeout(this._loadingTimer); this._loadingTimer = null; }
    }

    _tryStartPipeline() {
        if (this._pipelineStarted) return;
        if (!this.sdk) return;   // SDK injected AFTER connectedCallback — renderedCallback retries
        this._pipelineStarted = true;
        this._runPipeline();
    }

    async _runPipeline() {
        try {
            // 1. registerDataSource — required before anything else.
            this.sdk.registerDataSource(SOURCE_NAME);

            // 2. Warm the SDM JSON so auth errors surface early.
            try {
                const src = await this.sdk.getDataSource?.(SOURCE_NAME);
                src?.getJson?.();
            } catch (e) { console.warn(TAG, 'getDataSource/getJson warning:', e); }

            // 3. Lifecycle: init.
            this.sdk.actions?.notifyLifecycleChange?.(LIFE_CYCLE.INIT);

            // 4. Build specs. Object.field for raw, BARE for _clc/_mtc.
            //    NO aggregationType on _clc/_mtc — SDM owns aggregation.
            //    ORDER MATTERS: all dimensions (rowGrouping: true) FIRST,
            //    then all measures (rowGrouping: false). The SDK reorders
            //    interleaved specs silently and your IDX will be off. See Gate #8.
            const specs = [
                { model: `${OBJ_OPPORTUNITY}.<dim-apiName-from-discovery>`, rowGrouping: true },
                { model: `${OBJ_ACCOUNT}.<dim-apiName-from-discovery>`,     rowGrouping: true },
                // ...more dimensions...
                { model: '<calc-measure-apiName-from-discovery>_clc',       rowGrouping: false }
            ];

            // 5. Subscribe BEFORE register — DATA_UPDATE can fire synchronously.
            this._subscribeEvents();

            // 6. Register. SDK internally fetches + emits DATA_UPDATE +
            //    auto-refetches on filter/parameter changes.
            this.sdk.registerFieldsForQuery(specs, SOURCE_NAME, { limit: QUERY_LIMIT });
            this._isQueryRegistered = true;
        } catch (err) {
            console.error(TAG, 'pipeline failed:', err);
            this._hasError = true;
            this._errorMessage = String(err?.message || err);
            this._isLoading = false;
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
        if (this._loadingTimer) { clearTimeout(this._loadingTimer); this._loadingTimer = null; }
        const rows = raw == null ? [] : raw;
        const length = typeof rows.length === 'number' ? rows.length : 0;
        const mapped = [];
        for (let i = 0; i < length; i++) {
            const r = rows[i];
            if (!r) continue;
            mapped.push({
                rowKey: `row-${i}-${r[IDX.OPPORTUNITY_ID] || ''}`,
                opportunityId: r[IDX.OPPORTUNITY_ID] ?? null,
                accountName:   r[IDX.ACCOUNT_NAME]   ?? null,
                // ...map each IDX to a named row property...
                amount:        Number(r[IDX.AMOUNT]) || 0
            });
        }
        this.rows = mapped.sort((a, b) => (b.amount || 0) - (a.amount || 0));
        this._isLoading = false;
        this._hasError = false;
        this.sdk.actions?.notifyLifecycleChange?.(
            this.rows.length ? LIFE_CYCLE.LOADED : LIFE_CYCLE.NO_DATA
        );
    }

    _setLoadingState() {
        this._isLoading = true;
        if (this._loadingTimer) clearTimeout(this._loadingTimer);
        // Safety net if DATA_UPDATE never arrives (e.g. filter fired pre-registration).
        this._loadingTimer = setTimeout(() => {
            if (this._isLoading) this._isLoading = false;
            this._loadingTimer = null;
        }, LOADING_SAFETY_MS);
    }

    get hasRows() { return this.rows.length > 0; }
}
```

The full annotated pattern (rules, snippet, and a placeholder-ified
end-to-end file) lives at `references/sdm-table.md`. Read that file;
do not copy it wholesale into `force-app/…`.

Note on cross-table joins: an SDM that joins `Opportunity_Product ↔
Opportunity ↔ Account` (or similar) lets you reference fields on any
joined object as `"OtherObject.field"` — the join is done by the
semantic engine, not your specs. Only propose cross-object fields that
appear in the discovery hand-off. Do not assume a join exists.

---

## Build 2 — Per-row AI insight

**Attendee prompt shape:** "Create `vibeInsight`, a new extension in
its own folder. Start from the `vibeTable` code just deployed — same
table, plus an Insight button per row that gets an AI narrative."

**Your job:**

1. **Start from the attendee's deployed `vibeTable` code**
   (`force-app/main/default/lwc/vibeTable/` — they wrote it in Build 1
   and it's the natural source of truth for the query shape and `IDX`
   map). Read `references/apex-insight-panel.md` for the panel-swap
   pattern and the exact Apex-call shape you're adding. Then author
   `vibeInsight` from the attendee's prompt matching that shape. New
   folder, new class name (`VibeInsight`), new `<masterLabel>Vibe Insight</masterLabel>`.
2. **Read the Apex class** at
   `force-app/main/default/classes/OpportunityInsightGenerator.cls` to get
   the exact signature — do NOT guess method names.
3. **Import from Apex, not JS:**

    ```javascript
    import generateInsight from '@salesforce/apex/OpportunityInsightGenerator.generateInsight';
    ```

    Call with named params:

    ```javascript
    const narrative = await generateInsight({ rowJson: JSON.stringify(payload) });
    ```

### The panel-swap pattern (NOT a modal, NOT an inline expand)

**Tried and rejected:**
- Inline row expansion (extra `<tr>`) — LWC template rules make this ugly and the layout jitters on load.
- Fixed-position modal — `position: fixed` inside the analytics iframe is fixed to the iframe viewport, not the page. Backdrop bleeds through the iframe's boundary. Looks awful.

**What works:** replace the entire widget content with the insight view when active. Two mutually exclusive states:

- **Table mode**: render the table normally.
- **Insight mode**: hide the table, render a header (title + back arrow) and a body (spinner / narrative / error).

```javascript
@track modalOpen = false;
@track modalRow = null;
@track modalLoading = false;
@track modalText = '';
@track modalError = '';

get showTable() { return this.hasRows && !this.modalOpen; }
get modalTitle() {
    if (!this.modalRow) return 'Opportunity Insight';
    return `Insight — ${this.modalRow.accountName || this.modalRow.opportunityId}`;
}

async handleInsightClick(event) {
    const rowKey = event.currentTarget.dataset.rowKey;
    const row = this.rows.find((r) => r.rowKey === rowKey);
    if (!row) return;

    this.modalRow = row;
    this.modalOpen = true;
    this.modalLoading = true;
    this.modalText = '';
    this.modalError = '';

    const payload = {
        Opportunity_Id: row.opportunityId,
        Account: row.accountName,
        Stage: row.stage,
        Close_Date: row.closeDate,
        Type: row.type,
        Amount: row.amount
    };
    try {
        const text = await generateInsight({ rowJson: JSON.stringify(payload) });
        this.modalText = text || '(empty response)';
    } catch (e) {
        this.modalError = String(e?.body?.message || e?.message || e);
    } finally {
        this.modalLoading = false;
    }
}

handleModalClose() {
    this.modalOpen = false;
    this.modalRow = null;
    this.modalLoading = false;
    this.modalText = '';
    this.modalError = '';
}
```

Template shape:

```html
<template lwc:if={showTable}>
  <!-- normal table -->
</template>
<template lwc:if={modalOpen}>
  <div class="slds-p-around_medium insight-panel">
    <div class="slds-grid slds-grid_align-spread slds-p-bottom_small slds-border_bottom">
      <h3 class="slds-text-heading_small">{modalTitle}</h3>
      <lightning-button-icon icon-name="utility:back" variant="bare" onclick={handleModalClose}></lightning-button-icon>
    </div>
    <div class="slds-p-top_medium">
      <template lwc:if={modalLoading}> ... spinner ... </template>
      <template lwc:if={modalText}><p class="insight-narrative">{modalText}</p></template>
      <template lwc:if={modalError}><p class="slds-text-color_error">Insight failed: {modalError}</p></template>
    </div>
  </div>
</template>
```

And a tiny `.css`:

```css
.insight-panel { min-height: 12rem; }
.insight-narrative { font-size: 1rem; line-height: 1.5; }
```

**Refetch wipes insight state.** When `filterChange`/`parameterChange`
fires, close the panel and clear cached state — stale data → invalid insight.

**Error surfacing.** If Apex throws, render the error string. Do NOT hide it.

---

## Build 3 — Per-row Log a Call

**Attendee prompt shape:** "Create `vibeAction`, a new extension in
its own folder. Start from the `vibeInsight` code just deployed —
same table + Insight, plus a Log a Call button per row."

**Your job:**

1. **Start from the attendee's deployed `vibeInsight` code**
   (`force-app/main/default/lwc/vibeInsight/` from Build 2 — same
   rationale). Read `references/salesforce-action-link.md` for the
   origin-rewrite pattern, the exact `Global.LogACall` quick-action
   name, and the "hidden ID dimension goes BEFORE the measure" spec
   ordering (Gate #8). Then author `vibeAction` from the attendee's
   prompt. New folder, new class name (`VibeAction`), new
   `<masterLabel>Vibe Action</masterLabel>`.
2. **Add a hidden `accountId` field to the query** — we need it for the Log a Call URL. In this SDM, the Opportunity's `CustomerAccount` field IS the Account record ID (it's a lookup, not a name). Query it, store as `row.accountId`, but do NOT display it in a column.
3. **Add the Log a Call button per row.**

### Origin rewrite (mandatory)

The extension runs inside `*--analytics.<domain>`. Standard navigation from
that origin fails silently. Rewrite to `.lightning.force.com`:

```javascript
handleLogACallClick(event) {
    const accountId = event.currentTarget.dataset.accountId;
    if (!accountId) return;
    const base = window.location.origin.replace(/--analytics\..+/, '.lightning.force.com');
    const url = `${base}/lightning/action/quick/Global.LogACall?recordId=${encodeURIComponent(accountId)}`;
    window.open(url, '_blank');
}
```

**Rules:**
- `Global.LogACall` is the exact quick-action name. Don't invent
  `Account.LogACall` or `Global.Log_a_Call`.
- Use `window.open(url, '_blank')`. Do NOT use `NavigationMixin` — it does
  not work inside the analytics iframe.
- `accountId` comes from the query — in this workshop's SDM, the
  Opportunity's `CustomerAccount` field IS the Account record ID. Use it.

Button in the template — use `<lightning-button-icon>` (not
`<lightning-button>` with a label) — the label wraps in narrow columns
and looks bad:

```html
<td class="slds-text-align_center">
  <lightning-button-icon
    icon-name="utility:log_a_call"
    variant="border"
    alternative-text="Log a Call"
    title="Log a Call on this account"
    data-account-id={row.accountId}
    onclick={handleLogACallClick}
  ></lightning-button-icon>
</td>
```

---

## Cross-cutting gotchas

**SDK undefined in `connectedCallback`.** `@api sdk` is injected AFTER
`connectedCallback` on `analytics__Dashboard` widgets. Always guard with
`_pipelineStarted` and re-enter from `renderedCallback`:

```javascript
connectedCallback() { this._tryStartPipeline(); }
renderedCallback() { this._tryStartPipeline(); }

_tryStartPipeline() {
    if (this._pipelineStarted) return;
    if (!this.sdk) return;
    this._pipelineStarted = true;
    this._runPipeline();
}
```

**Never `<property name="sdk">` in meta.xml.** `@api sdk` is
runtime-injected — declaring it as a `<property>` causes a deploy error.

**`ShowToastEvent` is silently dropped** in a dashboard extension.

**Deploy NPE workaround.** If deploy fails with
`"insights.lwc.LwcValidator_AnalyticsDashboard$Property.getType()" because
the return value of "java.util.Map.get(Object)" is null`, do a two-step
deploy: (1) remove `analytics__Dashboard` from `<targets>` and deploy;
(2) re-add it and deploy again.

**`position: fixed` doesn't escape the iframe.** Anything you want to
"float over the dashboard" is trapped inside the widget's iframe rectangle.
Design for in-widget states (panel swap, drawer within the widget) —
don't build modals.

**`lightning-spinner alternative-text=""` prints a console warning.**
Always set a non-empty `alternative-text`.

**`key` on `<template>` is invalid.** For per-row expansion or multi-tbody
patterns, put `key` on a real DOM element (`<tr>`, `<tbody>`).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Query 400: *"Summary formula cannot have aggregation method different than NONE/AUTO/USER_AGG"* | `aggregationType` set on a `_clc` / `_mtc` spec | Remove `aggregationType` from those specs — SDM owns aggregation for calc measures/metrics |
| Query 400: *"field X does not exist in table Y"* | `_clc`/`_mtc` written as `"Object.field"` | Use bare `model: "myField_clc"` — calc/metric fields are model-scoped |
| `workloadName=undefined-undefined` in Network payload, silent no-op | Missing `registerDataSource(SOURCE_NAME)` before `registerFieldsForQuery` | Call `registerDataSource` first — always |
| Widget errors mid-load, `setErrorState` fires | Called `fetchData()` after `registerFieldsForQuery` (or from `filterChange` handler) | Never call `fetchData()` — SDK fetches internally. Event handlers are UI-only |
| Widget renders on load but never reacts to filters | Using `fetchDataUsingQueryAndSource` instead of `registerFieldsForQuery` | Switch paths — see Gate #7. `fetchDataUsingQueryAndSource` bypasses the dashboard's filter runtime |
| Initial payload missing rows | Subscribed to `dataUpdate` AFTER calling `registerFieldsForQuery` | Subscribe first — `DATA_UPDATE` can fire synchronously inside `registerFieldsForQuery` |
| Table empty but no error | Positional row-read mismatch | Verify `IDX` map matches spec declaration order |
| Text/ID column shows a number (e.g. `recordId=4822.56` in a URL, dollar amount where an account ID should be) | Dimension declared AFTER a measure in `specs[]` — SDK reordered it so dimensions come first, measures last. `IDX` is off by one column | See Gate #8. Rearrange `specs[]` so ALL `rowGrouping: true` specs come before any `rowGrouping: false` spec, then update `IDX` to match |
| Pipeline never runs | SDK undefined in `connectedCallback`, no re-entry | Call `_tryStartPipeline()` from both `connectedCallback` and `renderedCallback` |
| Widget deploys but not visible in dashboard picker | Wrong target in meta.xml | Ensure `<target>analytics__Dashboard</target>` |
| Log a Call button does nothing | Missing origin rewrite | Rewrite `--analytics.<domain>` → `.lightning.force.com` before `window.open` |
| Modal has gray stripe on the widget iframe boundary | Using `position: fixed` inside the iframe | Use panel-swap pattern instead of a modal |
| Console: LWC1065 for:each key error | Used `i` (index) as key | Compose a `rowKey` from index + stable field |

## Files in this skill

```
.a4drules/skills/tableau-next-workshop-lwc/
├── SKILL.md                          ← this file
├── README.md                         ← short overview
└── references/
    ├── sdm-helpers.js                ← copy-paste SDK helper functions
    ├── smoke-test-query.md           ← curl the SDM query before writing LWC
    ├── sdm-table.md                  ← Build 1 pattern (SDM query + table)
    ├── apex-insight-panel.md         ← Build 2 pattern (Apex + panel-swap)
    ├── salesforce-action-link.md     ← Build 3 pattern (origin-rewrite + Log a Call)
    ├── d3-in-lwc.md                  ← D3 shadow-DOM survival (attributed to Skip)
    ├── sparkline-column.md           ← per-row inline sparkline (composes d3-in-lwc + sdm-table)
    ├── d3-beeswarm.md                ← deal-size distribution scatter (attributed to Skip)
    ├── d3-radar.md                   ← multi-metric industry compare (attributed to Skip)
    ├── d3-funnel.md                  ← pipeline funnel by opportunity stage (attributed to Skip)
    ├── d3-treemap.md                 ← revenue by industry × account (attributed to Skip)
    └── d3-bump.md                    ← rank-over-time by account (attributed to Skip)
```

Each reference is a **pattern**, not a starter. Read it, understand
the rules and the shape, then author from the attendee's prompt —
never dump the reference verbatim into `force-app/…`. Every
org-specific token (`SOURCE_NAME`, object apiNames, field apiNames,
Apex class names) is a placeholder to be replaced from the discovery
hand-off (Gate #2).

**When the attendee asks for "something other than a table"** — a
chart, viz, or shape — the 5 `d3-<name>.md` references cover the
sanctioned chart types. Each is a full end-to-end pattern (SDM query
shape, layout mechanic, common surprises) and works with the workshop
template's Sales Cloud SDM out of the box. Read the matching
`d3-<name>.md` **plus** `d3-in-lwc.md` before writing code — the
survival-guide rules in the latter still apply per chart.

## Attribution

Forked from `tableau-next-custom-lwc` (Antoine Laviron / Radhika Maiya) at
`alaviron/tableau-skills`. Wire-format ground truth reverse-engineered
from Skip Sauls' `aftest` and John Demby's
`tableau-vibe-coding-workshop-starter-kit-main/cloudKicksSankey`. This
workshop fork is DF26-specific — do not reuse outside the workshop.
