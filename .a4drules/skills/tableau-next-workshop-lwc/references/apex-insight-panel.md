# Prompt-derived per-row insight panel

Use this Build 2 pattern to add an Apex-backed narrative without replacing or
reinterpreting Build 1's semantic roles. The widget swaps between its data
surface and an inline insight panel; it never attempts an iframe modal.

`RecordInsightGenerator` is a pre-baked, pre-deployed workshop head-start
class. The attendee's task is to call it from the LWC, not to create, edit, or
deploy Apex.

## Contents

- [Rules](#rules)
- [Contract compiled from the prompt](#contract-compiled-from-the-prompt)
- [State and payload](#state-and-payload)
- [Complete request-token pattern](#complete-request-token-pattern)
- [Focus transfer](#focus-transfer)
- [Template shape](#template-shape)
- [Verification](#verification)

## Rules

- Read `force-app/main/default/classes/RecordInsightGenerator.cls` before
  generating the import. Mirror its exact `@AuraEnabled` method and named
  parameter.
- Route model calls through Apex. Never call `aiplatform.ModelsAPI` from JS.
- Preserve every Build 1 property name, type, requiredness, purpose, query role,
  display format, and row key.
- Derive the entity label, subject role, insight goal, and context roles from
  the confirmed prompt contract.
- Send only selected context roles. Hidden IDs are excluded unless the prompt
  explicitly makes one relevant to the narrative.
- Invalidate pending work when the panel closes, another row is selected, data
  refreshes, bindings change, or the component disconnects.
- Move focus to the Back control after opening and restore it to the triggering
  row control after closing when that row still exists.
- Put the Back control at top-left; Tableau Next reserves the widget's top-right
  area for platform hover chrome.
- Render errors and statuses inside the widget. `ShowToastEvent` is silently
  dropped by dashboard extensions.
- Use non-empty, prompt-derived accessible labels. Generic "Insight" text alone
  does not identify the affected row.

## Contract compiled from the prompt

Build 2 inherits Build 1's roles and adds an insight descriptor:

```javascript
const INSIGHT_CONTRACT = {
    entitySingularLabel: 'Case',
    entityPluralLabel: 'Cases',
    subjectRoleKey: 'caseNumber',
    contextRoleKeys: [
        'caseNumber', 'customerName', 'priority', 'status', 'ownerName', 'ageDays'
    ],
    goal: 'Explain the case status and suggest one supported next action.'
};
```

The Case values demonstrate shape only. Generate this constant from the actual
attendee prompt and inherited role keys.

## State and payload

```javascript
import generateInsight from '@salesforce/apex/RecordInsightGenerator.generateInsight';

@track insightOpen = false;
@track insightRow = null;
@track insightLoading = false;
@track insightText = '';
@track insightError = '';

_insightRequestToken = 0;
_insightTriggerRowKey = null;
_focusInsightBack = false;
_restoreInsightTrigger = false;

get showDataSurface() {
    return this.hasRows && !this.insightOpen;
}

get insightTitle() {
    const subject = this._subjectValue(this.insightRow);
    return subject
        ? `${INSIGHT_CONTRACT.entitySingularLabel} Insight: ${subject}`
        : `${INSIGHT_CONTRACT.entitySingularLabel} Insight`;
}

_subjectValue(row) {
    const roleKey = INSIGHT_CONTRACT.subjectRoleKey;
    return row?.displayValues?.[roleKey] || row?.values?.[roleKey] || '';
}

get backLabel() {
    return `Back to ${INSIGHT_CONTRACT.entityPluralLabel}`;
}

_buildInsightPayload(row) {
    const subjectRole = INSIGHT_CONTRACT.subjectRoleKey;
    return {
        schemaVersion: 1,
        entityLabel: INSIGHT_CONTRACT.entitySingularLabel,
        subject: {
            role: subjectRole,
            label: this._labelsByRole[subjectRole],
            value: row.values[subjectRole]
        },
        insightGoal: INSIGHT_CONTRACT.goal,
        fields: INSIGHT_CONTRACT.contextRoleKeys.map((roleKey) => ({
            role: roleKey,
            label: this._labelsByRole[roleKey],
            value: row.values[roleKey]
        }))
    };
}
```

Do not flatten fields into fixed keys such as `Stage` or `Amount`. The semantic
envelope tells Apex what the row represents while preserving bound labels.

## Complete request-token pattern

```javascript
async handleInsightClick(event) {
    const rowKey = event.currentTarget.dataset.rowKey;
    const row = this.rows.find((candidate) => candidate.rowKey === rowKey);
    if (!row) return;

    const token = ++this._insightRequestToken;
    this._insightTriggerRowKey = rowKey;
    this.insightRow = row;
    this.insightOpen = true;
    this.insightLoading = true;
    this.insightText = '';
    this.insightError = '';
    this._focusInsightBack = true;

    try {
        const text = await generateInsight({
            rowJson: JSON.stringify(this._buildInsightPayload(row))
        });
        if (!this._isCurrentInsightRequest(token, rowKey)) return;
        if (!text || text === 'Unable to generate insight. Please retry.') {
            this.insightError = text || 'No insight generated. Please retry.';
        } else {
            this.insightText = text;
        }
    } catch (error) {
        if (!this._isCurrentInsightRequest(token, rowKey)) return;
        this.insightError = String(
            error?.body?.message || error?.message || 'Unable to generate insight.'
        );
    } finally {
        if (this._isCurrentInsightRequest(token, rowKey)) {
            this.insightLoading = false;
        }
    }
}

_isCurrentInsightRequest(token, rowKey) {
    return (
        this._connected
        && token === this._insightRequestToken
        && this.insightOpen
        && this.insightRow?.rowKey === rowKey
    );
}

handleInsightClose() {
    this._resetInsight({ restoreFocus: true });
}

_resetInsight({ restoreFocus = false } = {}) {
    this._insightRequestToken += 1;
    this._restoreInsightTrigger = restoreFocus && Boolean(this._insightTriggerRowKey);
    this.insightOpen = false;
    this.insightRow = null;
    this.insightLoading = false;
    this.insightText = '';
    this.insightError = '';
}

_invalidateFeatureState() {
    const restoreFocus = this.insightOpen;
    this._resetInsight({ restoreFocus });
    if (!restoreFocus) this._insightTriggerRowKey = null;
}
```

Call `_invalidateFeatureState()` before binding registration, on relevant filter
or parameter refresh, before processing every accepted `dataUpdate`, and during
disconnect. On disconnect, clear the focus-restoration flags because no target
remains. Selecting a new row increments the token before the prior request can
update state.

## Focus transfer

```javascript
renderedCallback() {
    this._scheduleBindingSync();

    if (this._focusInsightBack && this.insightOpen) {
        this._focusInsightBack = false;
        this.template.querySelector('[data-insight-back]')?.focus();
    }
    if (this._restoreInsightTrigger && !this.insightOpen) {
        this._restoreInsightTrigger = false;
        const rowKey = this._insightTriggerRowKey;
        const controls = this.template.querySelectorAll('[data-insight-trigger]');
        const target = [...controls].find(
            (control) => control.dataset.rowKey === rowKey
        );
        (target || this.template.querySelector('[data-widget-focus-target]'))?.focus();
        this._insightTriggerRowKey = null;
    }
}
```

LWC selector escaping for arbitrary row keys is fragile, so find the matching
control from `querySelectorAll` instead of interpolating the key into CSS.

## Template shape

```html
<template lwc:if={showDataSurface}>
  <h2>{dataSurfaceTitle}</h2>
  <!-- Existing table or chart. Each row action uses: -->
  <!--
  <lightning-button-icon
    data-insight-trigger
    data-row-key={row.rowKey}
    icon-name="utility:einstein"
    variant="brand"
    alternative-text={row.insightAccessibleLabel}
    title={row.insightAccessibleLabel}
    onclick={handleInsightClick}
  ></lightning-button-icon>
  -->
</template>

<!-- Place outside every conditional branch so it always remains rendered. -->
<span data-widget-focus-target tabindex="-1" class="slds-assistive-text">
  {widgetStatusLabel}
</span>

<template lwc:if={insightOpen}>
  <section class="slds-p-around_medium insight-panel" aria-labelledby="insight-title">
    <div class="slds-grid slds-grid_vertical-align-center slds-p-bottom_small slds-border_bottom">
      <lightning-button-icon
        data-insight-back
        icon-name="utility:back"
        variant="bare"
        alternative-text={backLabel}
        title={backLabel}
        onclick={handleInsightClose}
      ></lightning-button-icon>
      <h3 id="insight-title" class="slds-text-heading_small slds-p-left_small">
        {insightTitle}
      </h3>
    </div>
    <div class="slds-p-top_medium">
      <template lwc:if={insightLoading}>
        <div role="status" aria-live="polite">
          <lightning-spinner alternative-text="Generating insight" size="small"></lightning-spinner>
        </div>
      </template>
      <template lwc:if={insightText}>
        <p class="insight-narrative" role="status" aria-live="polite">{insightText}</p>
      </template>
      <template lwc:if={insightError}>
        <p class="slds-text-color_error" role="alert">Insight failed: {insightError}</p>
      </template>
    </div>
  </section>
</template>
```

Generate each row's `insightAccessibleLabel` from the action and subject, such
as `Explain Case 00001234`. Its programmatic name must include the visible
action wording.

```css
.insight-panel { min-height: 12rem; }
.insight-narrative { font-size: 1rem; line-height: 1.5; }
```

## Verification

1. Rapidly select row A then row B; A cannot overwrite B.
2. Close during generation; the response cannot reopen or update the panel.
3. Refresh or remap data; the panel closes and pending work is invalidated.
4. Keyboard activation moves focus to Back after render.
5. Back restores focus to the triggering row or the data heading if the row
   disappeared.
6. Loading and completion use status semantics; errors use alert semantics.
7. The payload includes only the configured entity, subject, goal, and context
   roles and contains no leaked canonical sales fields.
