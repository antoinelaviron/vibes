# Skill authoring evaluations

Use these maintainer checks when changing the workshop skill. They validate
that generated business contracts come from prompts while fixed Tableau Next
mechanics remain intact. They do not replace live dashboard verification.

## Core build matrix

| Case | Prompt | Required evidence | Forbidden leakage |
| --- | --- | --- | --- |
| Canonical sales | Create top opportunities showing account, stage, close date, type, and amount; add an insight and Account Log a Call. | Required hidden Opportunity ID as the stable row identity, dimensions before amount, generic `RecordInsightGenerator` endpoint, hidden Account ID before measures, and the confirmed canonical `Global.LogACall` descriptor with prefix `001`. | A composite key made from visible fields, hard-coded field API names in native mode, `fetchData()`, or `NavigationMixin`. |
| Support cases | Show case number, customer, priority, status, owner, and age; add Explain Case and Open Case. | Case-named properties, bound labels, a Case insight envelope, and a Case record-page descriptor. | `opportunityIdField`, `amountField`, `Opportunity Insight`, `accountIdField`, `Global.LogACall`, or prefix `001`. |
| Suppliers | List active suppliers with region and risk category. | Dimension-only role contract and no invented sort measure. | Any amount or score measure, sales action, or fabricated row action. |
| Subscriptions | Show subscriptions with ARR and active seats. | Two measure properties after every dimension, explicit formatters, and a selected sort role. | Interleaved measure/dimension specs or inferred currency without confirmation. |
| Aggregate regions | Summarize revenue by region, then explain the regional result. | Region and revenue roles plus aggregate insight context. | Fabricated record ID or per-record Salesforce action. |
| Work orders | Show work orders with technician, scheduled date, category, and estimated hours; open the Work Order. | Prompt-derived identity/action role, date-only formatting, and a Work Order record-page descriptor. | Account prefix, Log a Call, or sales vocabulary. |

For each generated progression, compare metadata from Build 1 to Build 2 and
Build 2 to Build 3 as structured properties. Every inherited property must
retain its name, type, requiredness, label purpose, and semantic role. Build 3
must retain Build 2's insight behavior and add only the confirmed action
contract. Account, `001`, and `Global.LogACall` are valid only in the explicitly
confirmed canonical example; they are never defaults.

## Visualization matrix

| Pattern | Non-sales prompt | Required roles and choices | Forbidden assumptions |
| --- | --- | --- | --- |
| Beeswarm | Patients positioned by wait time and colored by triage severity. | Item, category, and value; duration formatter; accessible category summary. | Opportunity, stage, amount, or currency formatter. |
| Bump | Products ranked monthly by units shipped. | Period, entity, and ranking value; month grain; descending rank. | Account, close date, quarter, or pipeline. |
| Chord | Origin region to destination region weighted by shipment count. | Source/target-prefixed labels, source-count offset, symmetric matrix, and a fixture with unequal source and target cardinalities. | Type/stage labels, target-count offset, one-sided matrix, or color-only role distinction. |
| Funnel | Applications through submitted, review, interview, and decision. | Exact prompt order; step and value roles; unknown steps last. | Salesforce stage order or Closed Lost behavior. |
| Radar | Suppliers compared on quality, lead time, cost, sustainability, and reliability. | One generated measure property per axis; per-axis direction and formatter. | Fixed five sales measures or one shared scale. |
| Treemap | Cloud spend by department and service. | Parent, child, and size; nonnegative values; textual leaf summary. | Industry, Account, or revenue-specific labels. |
| Kanban | Service requests grouped by current status. | Prompt-derived columns, sanitized unique ARIA IDs, visible instructions, select-plus-Move keyboard path, and live result announcement. | Stage-specific vocabulary, drag-only operation, or unsanitized IDs. |
| Video | Create a media-only training video tile. | API 67; no SDK/discovery/query/Apex; strict media URL policy; fixed-origin YouTube reconstruction; blocked-autoplay recovery; pause control; captions guidance; native `no-referrer` and YouTube `strict-origin-when-cross-origin`. | Generic `?v=` matching, raw URL assignment, swallowed play rejection, or data-binding code. |

## Native lifecycle assertions

Apply these assertions to every data-backed native-binding output:

- Every private-backed `@api` setter, including `sdk`, schedules the same
  `_scheduleStart()` microtask. Delayed SDK and binding assignments converge on
  exactly one startup after connection and complete required mappings.
- `renderedCallback` does not register, query, synchronize bindings, or schedule
  query startup. Rendering work for D3 or focus management does not become a
  data-query path.
- No hydration call or requirement appears: reject `getDataSource(`, `getJson(`,
  `_hydrateSource`, and language that makes hydration a prerequisite.
- No binding-signature or in-place rebinding machinery appears: reject names
  such as `_bindingSignature`, `_mappingSignature`, or registration queues.
  A material mapping change requires a runtime remount.
- Every dimension spec precedes every measure spec. Qualified raw-measure
  `aggregationType` values are uppercase supported enums such as `SUM`, `AVG`,
  `MIN`, `MAX`, `COUNT`, or `COUNT_DISTINCT`; bare model calculations omit
  `aggregationType`.
- `registerFieldsForQuery` receives an explicit options object such as
  `{ limit: QUERY_LIMIT }`. Query and display limits remain distinct.
- Subscription and loading occur before registration so a synchronous
  `dataUpdate` remains final. The handler accepts direct rows, `{ rows: [...] }`,
  and `{ data: [...] }` without requiring one wrapper shape.
- Missing initial data reaches a visible terminal error and `error` lifecycle
  event after exactly eight seconds (`8000` ms).
- `registerFieldsForQuery` owns fetching. No explicit `fetchData()` follows
  registration or runs from a filter, parameter, or render callback.

## Build-specific assertions

- Build 2 imports
  `@salesforce/apex/RecordInsightGenerator.generateInsight` and sends the exact
  named `rowJson` parameter. Its generic versioned envelope includes entity,
  subject, goal, and selected context roles; it does not use a fixed
  Opportunity-only contract.
- Build 3 derives the target role, action kind, object API name or quick-action
  API name, and optional ID prefixes from the prompt. Invalid IDs and invalid
  Lightning origins remain unavailable. It uses
  `window.open(url, '_blank', 'noopener')`, not `NavigationMixin`.
- Adding a hidden action dimension preserves dimensions-before-measures order
  and does not change the inherited row grain or visible columns.
- A row-per-record Build 1 queries a stable hidden record identity and derives
  `rowKey` from it without using a query index or repeatable descriptive fields.
- A chord test fixture has unequal source and target cardinalities and asserts
  the target offset uses the source count, both node groups have geometry, and
  the matrix is symmetric.
- A Kanban output, when requested, preserves inherited table, insight, and
  action contracts and includes pointer-independent movement plus accessible
  status feedback.
- A video output accepts only the documented exact YouTube hosts and safe
  credential-free HTTPS or same-origin `/resource/` URLs. It rejects unsafe
  protocols, lookalike hosts, credentials, ports, unsupported query strings,
  and fragments before DOM assignment. YouTube embeds use a fixed origin.
- A video output shows visible Play recovery and controls when native autoplay
  is blocked, exposes Pause when hidden controls accompany successful autoplay,
  supports a validated `captionUrl` for authored WebVTT, applies
  `referrerpolicy="no-referrer"` to native media, and preserves YouTube player
  identity with `strict-origin-when-cross-origin`.

## Accessibility assertions

- Data tables use native table, header, and cell semantics.
- Visible labels and programmatic names use prompt or bound-field language.
- Icon buttons have non-empty row-specific names containing the visible action.
- Insight loading/completion uses status semantics and failure uses alert
  semantics; focus moves to Back and returns predictably.
- Interactive D3 marks are keyboard operable and visibly focusable or have a
  native-control alternative.
- Informative SVGs have a title, description, and textual equivalent.
- Color is not the only way to distinguish categories, sides, or state.
- Moving or autoplaying content has an operable pause or stop mechanism.

## Static checks

Select two to five checks relevant to each generated output, plus every native
lifecycle assertion applicable to its code path. Typical presence checks:

- `<target>analytics__Dashboard</target>`
- `<apiVersion>67.0</apiVersion>`
- `registerFieldsForQuery(` with `{ limit: QUERY_LIMIT }`
- `rowGrouping: true` before `rowGrouping: false`
- uppercase `aggregationType` values
- `setTimeout(` with `8000`
- direct, `{ rows }`, and `{ data }` update normalization
- `@salesforce/apex/RecordInsightGenerator.generateInsight`
- `schemaVersion: 1`
- `window.open(url, '_blank', 'noopener')`

Typical absence checks:

- `fetchDataUsingQueryAndSource`
- an explicit `fetchData()` after registration or in event handlers
- `getDataSource(`, `getJson(`, or hydration as a prerequisite
- query synchronization from `renderedCallback`
- hydration or binding-signature helpers
- `<property name="sdk"`
- `NavigationMixin`
- `position: fixed` for the insight panel
- `Math.random()` for stable row behavior
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
