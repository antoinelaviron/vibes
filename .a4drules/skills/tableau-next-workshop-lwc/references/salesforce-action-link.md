# Prompt-derived Salesforce record action

Use this Build 3 pattern to open a confirmed Salesforce record page or quick
action from a Tableau Next extension. Standard Lightning navigation silently
fails inside `*--analytics.<domain>`, so validate and rewrite the origin before
opening a new tab.

## Contents

- [Derive the action contract](#derive-the-action-contract)
- [Target record role](#target-record-role)
- [Validation and URL construction](#validation-and-url-construction)
- [Row and click handling](#row-and-click-handling)
- [Template](#template)
- [Verification](#verification)

## Derive the action contract

Confirm the action before generating code. Record-page navigation also needs
the target object's API name; the ID alone is not a complete Lightning route:

```javascript
const ACTION_CONTRACT = {
    kind: 'recordPage',
    label: 'Open Case',
    iconName: 'utility:new_window',
    targetRoleKey: 'caseId',
    targetObjectApiName: 'Case',
    expectedIdPrefixes: ['500']
};
```

For a quick action:

```javascript
const ACTION_CONTRACT = {
    kind: 'quickAction',
    label: 'Log a Call',
    iconName: 'utility:log_a_call',
    actionName: 'Global.LogACall',
    targetRoleKey: 'accountId',
    expectedIdPrefixes: ['001']
};
```

The second descriptor is the canonical Account Log a Call example only. Do not
default to it. Confirm a quick-action API name from the prompt or org; never
invent one.

## Target record role

Reuse an inherited role when it identifies the exact target record. Otherwise
add a hidden prompt-derived `SemanticDimension` property to the new
`vibeAction` bundle.

Before adding a role, verify that its value is functionally dependent on the
existing row grain. A new grouping dimension can split aggregate rows; if it
does, clarify or choose a record-page design that matches the existing grain.

Insert every new hidden dimension before all measures:

```javascript
const orderedRoles = [
    ...inheritedDimensionRoles,
    actionTargetRole,
    ...inheritedMeasureRoles
];
const indexByRole = Object.fromEntries(
    orderedRoles.map((role, index) => [role.key, index])
);
```

Store the target in `row.values[ACTION_CONTRACT.targetRoleKey]`. Do not render
the hidden ID as a visible table cell.

## Validation and URL construction

```javascript
function isValidSalesforceId(value, expectedPrefixes = []) {
    if (typeof value !== 'string') return false;
    if (!/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(value || '')) return false;
    return (
        expectedPrefixes.length === 0
        || expectedPrefixes.some((prefix) => value.startsWith(prefix))
    );
}

function lightningOrigin(origin) {
    try {
        const parsed = new URL(origin);
        parsed.hostname = parsed.hostname.replace(/--analytics(?=\.)/, '');
        return parsed.protocol === 'https:' &&
            !parsed.username &&
            !parsed.password &&
            !parsed.port &&
            parsed.hostname.endsWith('.lightning.force.com')
            ? parsed.origin
            : null;
    } catch {
        return null;
    }
}

function actionUrl(contract, origin, recordId) {
    const base = lightningOrigin(origin);
    if (!base) return null;
    const encodedRecordId = encodeURIComponent(recordId);
    if (contract.kind === 'recordPage' && contract.targetObjectApiName) {
        const objectApiName = encodeURIComponent(contract.targetObjectApiName);
        return `${base}/lightning/r/${objectApiName}/${encodedRecordId}/view`;
    }
    if (contract.kind === 'quickAction' && contract.actionName) {
        const actionName = encodeURIComponent(contract.actionName);
        return `${base}/lightning/action/quick/${actionName}?recordId=${encodedRecordId}`;
    }
    return null;
}
```

Expected ID prefixes are optional and valid only when the target object's
prefix is confirmed. General ID shape validation remains mandatory.

## Row and click handling

Generate availability and accessible text while mapping rows:

```javascript
const recordId = values[ACTION_CONTRACT.targetRoleKey];
const subject = values[PRIMARY_LABEL_ROLE];
const actionAvailable = isValidSalesforceId(
    recordId,
    ACTION_CONTRACT.expectedIdPrefixes
) && Boolean(this._lightningOrigin);

mapped.push({
    rowKey,
    values,
    displayValues,
    actionRecordId: recordId,
    actionAvailable,
    actionDisabled: !actionAvailable,
    actionAccessibleLabel: `${ACTION_CONTRACT.label} for ${subject} - opens in a new tab`
});
```

```javascript
handleActionClick(event) {
    const recordId = event.currentTarget.dataset.recordId;
    if (!isValidSalesforceId(recordId, ACTION_CONTRACT.expectedIdPrefixes)) return;

    const url = actionUrl(ACTION_CONTRACT, this._lightningOrigin, recordId);
    if (!url) {
        this._showActionError('Unable to open this Salesforce destination.');
        return;
    }
    window.open(url, '_blank', 'noopener');
}
```

Use `window.open`, not `NavigationMixin`, and do not redirect the iframe's
current tab. Set `this._lightningOrigin = lightningOrigin(window.location.origin)`
once during component setup so an invalid destination disables actions before
interaction. Do not infer popup failure from the `window.open` return value;
`noopener` may return `null` after a successful open.

## Template

```html
<template>
  <table class="slds-table slds-table_cell-buffer" aria-label={tableAccessibleLabel}>
    <thead>
      <tr>
        <!-- inherited headers... -->
        <th scope="col">{actionColumnLabel}</th>
      </tr>
    </thead>
    <tbody>
      <template for:each={rows} for:item="row">
        <tr key={row.rowKey}>
          <!-- inherited data cells... -->
          <td class="slds-text-align_center">
            <lightning-button-icon
              icon-name={actionIconName}
              variant="border"
              alternative-text={row.actionAccessibleLabel}
              title={row.actionAccessibleLabel}
              data-record-id={row.actionRecordId}
              onclick={handleActionClick}
              disabled={row.actionDisabled}
            ></lightning-button-icon>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
  <template lwc:if={actionError}>
    <p class="slds-text-color_error" role="alert">{actionError}</p>
  </template>
</template>
```

LWC templates do not support negation expressions, so generate
`actionDisabled: !actionAvailable` in the row model. Disabling or omitting an
invalid action is better than presenting an enabled control that silently does
nothing. Derive `actionColumnLabel` from the visible action label. Validate the
Lightning destination during component setup so a known-invalid origin also
disables every row action; preserve the in-widget alert for click-time failures.

## Verification

1. Valid 15- and 18-character target IDs open the requested destination.
2. Missing, numeric, malformed, and wrong-prefix IDs remain unavailable.
3. Prefix validation is omitted when the target object's prefix is unknown.
4. The rewritten origin is HTTPS and ends in `.lightning.force.com`.
5. The confirmed action API name and record ID are URL encoded.
6. Any added hidden ID role appears before every measure.
7. Build 3 has the same row count and grain as Build 2.
8. The accessible name includes the visible action, row subject, and new-tab
   behavior.
9. The inherited insight panel and all Build 2 bindings remain unchanged.
