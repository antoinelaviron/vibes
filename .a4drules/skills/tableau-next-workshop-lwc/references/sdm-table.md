# sdm-table - SDM-backed opportunity table (Build 1)

Use this reference after reading `sdk-query-lifecycle.md`. It owns the table's
query shape, positional row mapping, date display, and attendee-facing copy.
All source and field placeholders must come from the confirmed live discovery
hand-off.

## Query And Row Mapping

Build specs with every dimension first and every measure last. Model-level
calculated fields remain bare and omit `aggregationType`.

```javascript
const specs = [
    { model: `${OBJ_OPPORTUNITY}.<opportunity-id-dimension>`, rowGrouping: true },
    { model: `${OBJ_ACCOUNT}.<account-name-dimension>`, rowGrouping: true },
    { model: `${OBJ_OPPORTUNITY}.<stage-dimension>`, rowGrouping: true },
    { model: `${OBJ_OPPORTUNITY}.<close-date-dimension>`, rowGrouping: true },
    { model: `${OBJ_OPPORTUNITY}.<type-dimension>`, rowGrouping: true },
    { model: '<total-amount-clc>', rowGrouping: false }
];

const IDX = {
    OPPORTUNITY_ID: 0,
    ACCOUNT_NAME: 1,
    STAGE: 2,
    CLOSE_DATE: 3,
    TYPE: 4,
    AMOUNT: 5
};
```

`dataUpdate` rows are positional, array-like Proxies. Do not use
`Array.isArray(row)` or property names. Map through `IDX`, build a stable
`rowKey`, and sort only the returned set.

```javascript
_mapRows(raw) {
    const length = typeof raw.length === 'number' ? raw.length : 0;
    const mapped = [];
    for (let index = 0; index < length; index += 1) {
        const row = raw[index];
        if (!row) continue;
        const amount = Number(row[IDX.AMOUNT]) || 0;
        mapped.push({
            rowKey: row[IDX.OPPORTUNITY_ID]
                ? `opportunity-${row[IDX.OPPORTUNITY_ID]}`
                : `returned-row-${index}`,
            opportunityId: row[IDX.OPPORTUNITY_ID] ?? null,
            accountName: row[IDX.ACCOUNT_NAME] ?? null,
            stage: row[IDX.STAGE] ?? null,
            closeDate: this._formatDate(row[IDX.CLOSE_DATE]),
            type: row[IDX.TYPE] ?? null,
            amount,
            amountDisplay: this._formatCurrency(amount)
        });
    }
    return mapped.sort((left, right) => right.amount - left.amount);
}
```

## Date-Only Values

Do not parse Salesforce `YYYY-MM-DD` values through UTC. Users west of UTC can
otherwise see the preceding calendar day. Construct local calendar values from
their numeric parts; retain invalid values rather than rendering `Invalid Date`.

```javascript
_formatDate(value) {
    if (!value) return '';
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const date = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
```

Run this logic under `TZ=America/Los_Angeles` in maintainer validation.

## Template States And Result Copy

Render loading, error, no-data, and table states explicitly. Give every spinner
non-empty alternative text. The limit is not a global ranking guarantee, so use
bounded wording in visible and assistive text.

```html
<template lwc:if={isLoading}>
  <lightning-spinner alternative-text="Loading returned opportunities" size="small"></lightning-spinner>
</template>
<template lwc:if={hasError}>
  <p class="slds-text-color_error" role="alert">{errorMessage}</p>
</template>
<template lwc:if={showNoData}>
  <p>No opportunities match the current dashboard filters.</p>
</template>
<template lwc:if={showTable}>
  <p class="slds-text-body_small">Up to 25 returned opportunities, sorted by displayed amount.</p>
  <table class="slds-table slds-table_cell-buffer" aria-label="Up to 25 opportunities, sorted by displayed amount">
    <!-- Column headings and rows -->
  </table>
</template>
```

Use "returned rows" or "returned groups" for aggregate visualizations, not
"opportunities" unless an opportunity dimension defines the result grain.
