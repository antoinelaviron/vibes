# Skill authoring evaluations

Use these maintainer checks when changing the workshop skill. They validate
that generated business contracts come from prompts while fixed Tableau Next
mechanics remain intact. They do not replace live dashboard verification.

## Core build matrix

| Case              | Prompt                                                                                                               | Required evidence                                                                                                                  | Forbidden leakage                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Canonical sales   | Create top opportunities showing account, stage, close date, type, and amount; add an insight and Account Log a Call | Opportunity roles, dimensions before amount, generic Apex endpoint, hidden Account ID before measures, confirmed `Global.LogACall` | Hard-coded field API names in native mode, `fetchData()`, `NavigationMixin`                                   |
| Support cases     | Show case number, customer, priority, status, owner, and age; add Explain Case and Open Case                         | Case-named properties, bound labels, Case insight envelope, Case record action                                                     | `opportunityIdField`, `amountField`, `Opportunity Insight`, `accountIdField`, `Global.LogACall`, prefix `001` |
| Suppliers         | List active suppliers with region and risk category                                                                  | Dimension-only role contract and no invented sort measure                                                                          | Any amount/score measure, sales action, fabricated row action                                                 |
| Subscriptions     | Show subscriptions with ARR and active seats                                                                         | Two measure properties after every dimension; explicit formatter and selected sort role                                            | Interleaved measure/dimension specs, inferred currency without confirmation                                   |
| Aggregate regions | Summarize revenue by region, then explain the regional result                                                        | Region plus revenue roles and aggregate insight context                                                                            | Fabricated record ID or per-record Salesforce action                                                          |
| Work orders       | Show work orders with technician, scheduled date, category, and estimated hours; open the Work Order                 | Prompt-derived identity/action role, date-only formatting, record-page URL                                                         | Account prefix, Log a Call, sales vocabulary                                                                  |

For each generated progression, compare metadata from Build 1 to Build 2 and
Build 2 to Build 3. Every inherited property must retain its name, type,
requiredness, label purpose, and semantic role.

## Visualization matrix

| Chart     | Non-sales prompt                                                            | Required roles and choices                                                | Forbidden assumptions                            |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| Beeswarm  | Patients positioned by wait time and colored by triage severity             | item, category, value; duration formatter; accessible category summary    | opportunity, stage, amount, currency formatter   |
| Bump      | Products ranked monthly by units shipped                                    | period, entity, ranking value; month grain; descending rank               | account, close date, quarter, pipeline           |
| Chord     | Origin region to destination region weighted by shipment count              | source/target prefixed labels; source-count offset; symmetric matrix      | type/stage labels or color-only role distinction |
| Funnel    | Applications through submitted, review, interview, decision                 | exact prompt order; step and value roles; unknown steps last              | Salesforce stage order or Closed Lost behavior   |
| Radar     | Suppliers compared on quality, lead time, cost, sustainability, reliability | one generated measure property per axis; per-axis direction and formatter | fixed five sales measures or shared scale        |
| Treemap   | Cloud spend by department and service                                       | parent, child, size; nonnegative values; textual leaf summary             | industry, account, revenue-specific labels       |
| Sparkline | Device temperature by hour                                                  | entity, period, value; chronological ordering                             | synthetic history or current-amount assumptions  |

## Static checks

For each generated output, select two to five checks that prove behavior rather
than generic prose. Typical presence checks:

- `<target>analytics__Dashboard</target>`
- `<apiVersion>67.0</apiVersion>`
- `registerFieldsForQuery(`
- `rowGrouping: true` before `rowGrouping: false`
- uppercase `aggregationType` values such as `SUM` or `AVG`
- explicit query and display limits, with no `slice()` when every returned row
  should render
- `@salesforce/apex/RecordInsightGenerator.generateInsight`
- `schemaVersion: 1`
- `window.open(url, '_blank', 'noopener')`

Typical absence checks:

- `fetchDataUsingQueryAndSource`
- an explicit `fetchData()` after registration or in filter handlers
- `getDataSource(` or `getJson(` in the native startup path
- query synchronization from `renderedCallback`
- `<property name="sdk"`
- `NavigationMixin`
- `position: fixed` for the insight panel
- `Math.random()` for stable row/trend behavior
- `SDO_`

For every non-sales prompt, also assert that canonical example tokens do not
appear in generated code, metadata, visible text, or accessible names:

```text
opportunityIdField
accountNameField
stageField
amountField
accountIdField
Opportunity Insight
Global.LogACall
001
```

Do not apply those absence checks to the explicitly selected DF26 Top
Opportunities example.

## Negative triggers

This skill must not generate the workshop pipeline for:

- A generic Lightning Record, Home, or App Page LWC.
- A Tableau Cloud `.trex` visualization extension.
- A semantic model calculated field or metric.
- A dashboard extension outside the DF26 workshop when the canonical
  production skill is available.
