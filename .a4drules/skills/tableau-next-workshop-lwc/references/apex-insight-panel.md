# apex-insight-panel - Per-row AI narrative (Build 2)

Read this with `sdk-query-lifecycle.md` after reading the attendee's deployed
`vibeTable`. Preserve its query and `IDX` map in a new `vibeInsight` bundle.

## Apex Contract

Read `force-app/main/default/classes/OpportunityInsightGenerator.cls` before
writing the import. In this workshop it exposes:

```javascript
import generateInsight from '@salesforce/apex/OpportunityInsightGenerator.generateInsight';
```

Call it with its named `rowJson` parameter. Do not call the Models API in
browser code. The pre-baked class returns a bounded user-safe fallback; surface
that text in the widget instead of using `ShowToastEvent`, which is dropped by
dashboard extensions.

## Request Ownership

An Apex promise may settle after the user selects another row, closes the panel,
the dashboard refreshes, or the component disconnects. Use a monotonically
increasing token and require the token and selected row to still match before
updating panel state.

```javascript
@track modalOpen = false;
@track modalRow = null;
@track modalLoading = false;
@track modalText = '';
@track modalError = '';

_insightRequestToken = 0;
_focusBack = false;
_focusTriggerRowKey = null;
_restoreTriggerFocus = false;

get showTable() { return this.hasRows && !this.modalOpen; }
get modalTitle() {
    return this.modalRow
        ? `Insight - ${this.modalRow.accountName || this.modalRow.opportunityId}`
        : 'Opportunity Insight';
}

async handleInsightClick(event) {
    const row = this.rows.find((item) => item.rowKey === event.currentTarget.dataset.rowKey);
    if (!row) return;

    const token = ++this._insightRequestToken;
    this._focusTriggerRowKey = row.rowKey;
    this.modalRow = row;
    this.modalOpen = true;
    this.modalLoading = true;
    this.modalText = '';
    this.modalError = '';
    this._focusBack = true;

    const payload = {
        Account: row.accountName,
        Stage: row.stage,
        Close_Date: row.closeDate,
        Type: row.type,
        Amount: row.amount
    };
    try {
        const text = await generateInsight({ rowJson: JSON.stringify(payload) });
        if (!this._isCurrentInsightRequest(token, row.rowKey)) return;
        this.modalText = text || '(empty response)';
    } catch (error) {
        if (!this._isCurrentInsightRequest(token, row.rowKey)) return;
        console.error('[vibeInsight] insight request failed.');
        this.modalError = 'Unable to generate insight. Please retry.';
    } finally {
        if (this._isCurrentInsightRequest(token, row.rowKey)) this.modalLoading = false;
    }
}

_isCurrentInsightRequest(token, rowKey) {
    return token === this._insightRequestToken && this.modalOpen && this.modalRow?.rowKey === rowKey;
}

handleModalClose() {
    this._closeInsightPanel(true);
}

_invalidateInsightPanel() {
    this._closeInsightPanel(false);
}

_closeInsightPanel(restoreTriggerFocus) {
    this._insightRequestToken += 1;
    this._restoreTriggerFocus = restoreTriggerFocus;
    this.modalOpen = false;
    this.modalRow = null;
    this.modalLoading = false;
    this.modalText = '';
    this.modalError = '';
}
```

Call `_invalidateInsightPanel()` before starting a relevant query refresh and
from `disconnectedCallback`. It invalidates late responses without moving focus
to a row that the refresh may remove. `handleModalClose()` is the
user-initiated close path and is the only path that restores focus.

## Focus After A Panel Swap

The panel swap removes the triggering Insight control. Move focus to the Back
control after render, then restore it to the matching row's Insight control on
close when that row is still rendered. Use data selectors, never DOM position.
The panel's actionable Back control belongs at top-left because the dashboard
uses the tile's top-right hover area.

```javascript
renderedCallback() {
    this._tryStartPipeline();
    if (this._focusBack) {
        this._focusBack = false;
        this.template.querySelector('[data-insight-back]')?.focus();
        return;
    }
    if (!this.modalOpen && this._restoreTriggerFocus && this._focusTriggerRowKey) {
        const control = [...this.template.querySelectorAll('[data-insight-control]')]
            .find((element) => element.dataset.insightRowKey === this._focusTriggerRowKey);
        control?.focus();
        this._focusTriggerRowKey = null;
        this._restoreTriggerFocus = false;
    }
}
```

```html
<lightning-button-icon
  icon-name="utility:einstein"
  variant="brand"
  alternative-text="Insight"
  title="Generate AI insight"
  data-row-key={row.rowKey}
  data-insight-row-key={row.rowKey}
  data-insight-control
  onclick={handleInsightClick}
></lightning-button-icon>

<lightning-button-icon
  data-insight-back
  icon-name="utility:back"
  variant="bare"
  alternative-text="Back to opportunities"
  title="Back to opportunities"
  onclick={handleModalClose}
></lightning-button-icon>
```

Keep the table and panel mutually exclusive. Render in-widget error text in a
`slds-text-color_error` paragraph and use a non-empty spinner alternative text.
