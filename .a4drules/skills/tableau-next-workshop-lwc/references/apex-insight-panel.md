# apex-insight-panel — per-row AI narrative via Apex (Build 2 pattern)

**What this teaches:** how to add a per-row action button that fetches
an AI-generated narrative from Apex and displays it inline by
*swapping* the widget's rendered content, without breaking the SDM
query pipeline underneath.

**Do NOT copy this file verbatim.** The Apex class name and method
signature are placeholders — read
`force-app/main/default/classes/<YourInsightClass>.cls` in the
attendee's repo before importing, and use the exact method name and
parameter shape it declares.

## Rules

- **Trust Layer routing: never call the Models API from JS.** Always
  through an `@AuraEnabled` Apex method. See SKILL.md Gate #4.
- **Never invent an Apex method name.** Read the `.cls` first, mirror
  the `@AuraEnabled` signature exactly. See SKILL.md Gate #5.
- **Import Apex, not JS:**
  `import <fn> from '@salesforce/apex/<ClassName>.<methodName>'`.
- **Call with named params:** `await fn({ rowJson: JSON.stringify(payload) })`.
- **Panel-swap, not modal.** `position: fixed` inside the analytics
  iframe is fixed to the iframe viewport, not the page — backdrops
  bleed at the iframe boundary. Instead, render *either* the table
  *or* the insight panel (mutually exclusive). See SKILL.md
  "The panel-swap pattern".
- **Refetch wipes panel state.** When `filterChange` /
  `parameterChange` fires, close the panel and clear its state —
  otherwise the panel shows an insight for a row that's no longer
  in the current filter context.
- **Surface Apex errors.** Render `e?.body?.message || e?.message`
  in a `slds-text-color_error` paragraph — do not swallow.
- **`ShowToastEvent` is silently dropped** in a dashboard extension.
  Use in-widget error text.
- **Underneath**, the SDM pipeline from `references/sdm-table.md` is
  unchanged — same specs, same `IDX`, same subscribe-before-register.

## Annotated snippet — panel state + click handler

```javascript
import generateInsight from '@salesforce/apex/<ApexClass>.<method>';

@track modalOpen    = false;
@track modalRow     = null;
@track modalLoading = false;
@track modalText    = '';
@track modalError   = '';

get showTable()  { return this.hasRows && !this.modalOpen; }
get modalTitle() { return this.modalRow ? `Insight — ${this.modalRow.accountName || this.modalRow.opportunityId}` : 'Opportunity Insight'; }

async handleInsightClick(event) {
    const rowKey = event.currentTarget.dataset.rowKey;
    const row = this.rows.find((r) => r.rowKey === rowKey);
    if (!row) return;

    this.modalRow = row; this.modalOpen = true;
    this.modalLoading = true; this.modalText = ''; this.modalError = '';

    const payload = {
        Opportunity_Id: row.opportunityId, Account: row.accountName,
        Stage: row.stage, Close_Date: row.closeDate, Type: row.type, Amount: row.amount
    };
    try {
        this.modalText = (await generateInsight({ rowJson: JSON.stringify(payload) })) || '(empty response)';
    } catch (e) {
        this.modalError = String(e?.body?.message || e?.message || e);
    } finally {
        this.modalLoading = false;
    }
}

handleModalClose() {
    this.modalOpen = false; this.modalRow = null;
    this.modalLoading = false; this.modalText = ''; this.modalError = '';
}
```

## Template shape (mutually exclusive states)

```html
<template lwc:if={showTable}>
  <!-- the SDM table from references/sdm-table.md, PLUS an Insight
       <td> per row: -->
  <!-- <lightning-button-icon icon-name="utility:einstein" variant="brand"
         alternative-text="Insight" title="Generate AI insight"
         data-row-key={row.rowKey} onclick={handleInsightClick}></lightning-button-icon> -->
</template>

<template lwc:if={modalOpen}>
  <div class="slds-p-around_medium insight-panel">
    <div class="slds-grid slds-grid_align-spread slds-p-bottom_small slds-border_bottom">
      <h3 class="slds-text-heading_small">{modalTitle}</h3>
      <lightning-button-icon icon-name="utility:back" variant="bare" onclick={handleModalClose}></lightning-button-icon>
    </div>
    <div class="slds-p-top_medium">
      <template lwc:if={modalLoading}>
        <lightning-spinner alternative-text="Generating insight" size="small"></lightning-spinner>
      </template>
      <template lwc:if={modalText}>
        <p class="insight-narrative">{modalText}</p>
      </template>
      <template lwc:if={modalError}>
        <p class="slds-text-color_error">Insight failed: {modalError}</p>
      </template>
    </div>
  </div>
</template>
```

Companion CSS — iframe-safe sizing tweaks only:

```css
.insight-panel     { min-height: 12rem; }
.insight-narrative { font-size: 1rem; line-height: 1.5; }
```

## Refetch → wipe panel state

Inside `_subscribeEvents()`, the `filterChange` / `parameterChange`
handlers must both (a) enter loading state on the table AND (b) close
the panel and clear its state — otherwise a stale insight sticks
around for a row that's no longer in the filtered result set:

```javascript
this.sdk.on(SDK_EVENTS.FILTER_CHANGE, () => {
    if (!this._isQueryRegistered) return;
    this.handleModalClose();       // wipe stale insight
    this._setLoadingState();
});
```

## See also

- SKILL.md gates: **#4** (Trust Layer routing), **#5** (no invented
  Apex names), and the panel-swap section.
- `references/sdm-table.md` — the underlying query pipeline.
- `references/salesforce-action-link.md` — Build 3 layers a Log a Call
  button on top of this pattern.
