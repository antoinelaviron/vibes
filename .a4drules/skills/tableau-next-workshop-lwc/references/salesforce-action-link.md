# salesforce-action-link - Per-row Log a Call (Build 3)

Read this after the attendee's deployed `vibeInsight` bundle. It adds the
workshop's fixed `Global.LogACall` quick action to a new `vibeAction` bundle.

## Query Shape

The Account record ID is a hidden dimension. Put it before every measure, map it
to `row.accountId`, and do not render it in a table cell. An ID placed after a
measure desynchronizes `IDX` and can turn an amount into `recordId`.

```javascript
const specs = [
    // Existing dimensions.
    { model: `${OBJ_OPPORTUNITY}.<account-id-dimension>`, rowGrouping: true },
    // Existing measures follow.
    { model: '<total-amount-clc>', rowGrouping: false }
];
```

## Validated Action URL

Only a Salesforce Account ID is valid for this action: 15 or 18 alphanumeric
characters starting with `001`. Validate it before rendering the control and in
the click handler. The component runs in an analytics iframe, so rewrite only a
valid analytics origin to a Lightning host and refuse to open any other target.

```javascript
_isAccountId(value) {
    return /^001[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(String(value || ''));
}

_logACallUrl(accountId) {
    if (!this._isAccountId(accountId)) return null;
    const origin = new URL(window.location.origin);
    const rewritten = origin.origin.replace(/--analytics\.[^.]+\..+$/, '.lightning.force.com');
    const base = new URL(rewritten);
    if (base.protocol !== 'https:' || !base.hostname.endsWith('.lightning.force.com')) return null;
    return `${base.origin}/lightning/action/quick/Global.LogACall?recordId=${encodeURIComponent(accountId)}`;
}

handleLogACallClick(event) {
    const url = this._logACallUrl(event.currentTarget.dataset.accountId);
    if (url) window.open(url, '_blank', 'noopener');
}
```

Use the third `window.open` argument only where the workshop's analytics iframe
has been verified to permit it. If browser behavior rejects that feature string,
keep the ID and origin validation and record the compatibility result.

Derive `canLogCall` when mapping rows so the UI is not an always-enabled control
that silently does nothing:

```javascript
accountId: row[IDX.ACCOUNT_ID] ?? null,
canLogCall: this._isAccountId(row[IDX.ACCOUNT_ID])
```

```html
<template lwc:if={row.canLogCall}>
  <lightning-button-icon
    icon-name="utility:log_a_call"
    variant="border"
    alternative-text="Log a Call"
    title="Log a Call on this account"
    data-account-id={row.accountId}
    onclick={handleLogACallClick}
  ></lightning-button-icon>
</template>
```

Never use `NavigationMixin` here. It silently fails within the analytics iframe.
