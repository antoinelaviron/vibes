# salesforce-action-link — per-row Salesforce quick action (Build 3 pattern)

**What this teaches:** how to open a Salesforce standard quick action
(Log a Call, New Task, etc.) on a record from a Tableau Next dashboard
extension. The tricky part is that the extension runs inside
`*--analytics.<domain>` and standard navigation from that origin fails
silently — this pattern rewrites the origin and opens the action in a
new tab.

**Do NOT copy this file verbatim.** The quick-action name must match the org's
configuration. In the default path, the ID-carrying field comes from the
required `accountIdField: SemanticDimension` binding. Only hard-coded recovery
mode obtains it from discovery.

## Rules

- **Origin rewrite is mandatory.** `NavigationMixin` does not work
  inside `*--analytics.<domain>`. Rewrite to `.lightning.force.com`
  before `window.open`. See SKILL.md Gate #6.
- **Use `window.open(url, '_blank')`,** not `NavigationMixin.Navigate`,
  and not a same-tab redirect (the analytics iframe traps the nav).
- **Exact quick-action name.** `Global.LogACall` — one word, no
  underscores, `Global.` prefix. Do NOT invent `Account.LogACall` or
  `Global.Log_a_Call`. Confirm the name in Setup → Global Actions if
  it's not the workshop default.
- **The ID-carrying field is a DIMENSION** (`rowGrouping: true`), and
  it must be declared **before** any measure spec. Appending it at
  the end of `specs[]` after a `_clc` measure produces the classic
  Gate #8 desync — the row Proxy delivers the measure where the ID
  should be, and the URL becomes `recordId=<dollar amount>`. See
  SKILL.md Gate #8.
- **Hidden column.** The ID is used for the URL, NOT rendered as a
   visible `<td>`. Store as `row.accountId`; do not add a header cell.
- **Validate before opening.** Render the action disabled or omit it when the
  role is unmapped. Accept only a 15- or 18-character Account ID beginning
  with `001`; this catches an amount accidentally mapped into `recordId`.
- **Use `<lightning-button-icon>`,** not `<lightning-button>` — the
  label wraps in narrow columns and looks bad. Set
  `alternative-text` and `title`, and pass the ID via
  `data-account-id={row.accountId}`.
- **Underneath**, the panel-swap from `references/apex-insight-panel.md`
  is unchanged — this pattern *adds* a button, doesn't replace one.

## Annotated snippet — the handler

```javascript
handleLogACallClick(event) {
    const accountId = event.currentTarget.dataset.accountId;
    if (!/^001[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(accountId || '')) return;

    // Rewrite origin: *--analytics.<domain>  →  <base>.lightning.force.com
    const base = window.location.origin.replace(/--analytics\..+/, '.lightning.force.com');
    if (!base.endsWith('.lightning.force.com')) return;
    const url  = `${base}/lightning/action/quick/Global.LogACall?recordId=${encodeURIComponent(accountId)}`;

    // window.open, NOT NavigationMixin — the analytics iframe blocks the mixin silently.
    window.open(url, '_blank', 'noopener');
}
```

## Spec order — insert the ID dimension BEFORE the measure

The ID-carrying spec is a **dimension** and must sit alongside the
other dimensions, not appended at the end:

```javascript
const specs = [
    // ...Build 2 dimensions (rowGrouping: true)...
    { model: `${OBJ_OPPORTUNITY}.<id-carrying-dim-apiName>`, rowGrouping: true },  // NEW: hidden ID
    // ...Build 2 measures (rowGrouping: false)...
    { model: '<calc-measure-apiName>_clc', rowGrouping: false }
];

// Update IDX so ACCOUNT_ID lands at its correct position — right BEFORE the last-position measure.
const IDX = {
    /* ...existing dims... */
    ACCOUNT_ID: <n-1>,
    AMOUNT:     <n>          // measure — always last
};
```

In native mode, use the required bound role instead of an `OBJ_` placeholder:

```javascript
if (this.accountIdField?.name) {
    dimensionSpecs.push({ model: this.accountIdField.name, rowGrouping: true });
}
```

Symptom you'll see if you get this wrong: the Log a Call button opens
`…?recordId=4822.56` (a dollar amount) instead of `…?recordId=001…`
(a real 15/18-char record ID). Fix by moving the ID spec before every
measure in the array, and rebuilding `IDX` to match.

## Template — hidden ID, visible button

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

The row-mapping side stashes `accountId` off the ID dimension:

```javascript
mapped.push({
    /* ...existing row fields... */
    accountId: r[IDX.ACCOUNT_ID],   // hidden — never rendered as a column
    amount:    Number(r[IDX.AMOUNT]) || 0
});
```

## See also

- SKILL.md gates: **#6** (origin rewrite), **#8** (spec order — ID
  dimension goes before measures), **#3** (SLDS-first styling).
- `references/apex-insight-panel.md` — the panel-swap this pattern
  layers onto.
- `references/sdm-data-binding.md` - native role metadata and rebinding.
- `references/sdm-table.md` - hard-coded recovery pipeline.
