---
name: tableau-next-workshop-lwc
description: |
  Builds and evolves Tableau Next dashboard extension LWCs for the DF26
  workshop. Use for vibeTable, vibeInsight, vibeAction, analytics__Dashboard,
  native semantic bindings, or the workshop D3 and media variations. Derives
  each component's business roles from the attendee's prompt while preserving
  the workshop's SDK, accessibility, insight, and navigation contracts. Do not
  use for generic Lightning pages, Tableau Cloud .trex extensions, or semantic
  model calculated-field authoring.
license: Apache-2.0
metadata:
  author: alaviron
  version: workshop-5.1
  fork_of: tableau-next-custom-lwc
  api-version: v67.0
---

# Tableau Next workshop LWC

Build one prompt-authored extension through three deployable bundles:
`vibeTable` -> `vibeInsight` -> `vibeAction`. Native Tableau Next data binding
is the default. Hard-coded fields exist only as an explicit recovery path.

This lifecycle was release-gated with 14 data-binding bundles in
`26213playground`: automated tests, deployment, and live Tableau Next dashboard
tests all passed. Treat `references/sdm-data-binding.md` as the validated
canonical implementation contract.

Do not reuse this workshop fork for production LWC work. Use the canonical
`tableau-next-custom-lwc` skill from `alaviron/tableau-skills` instead.

## Authoring boundary

Keep the technical framework fixed and derive the business design from the
attendee's prompt.

| Fixed by this skill                           | Derived from the prompt                     |
| --------------------------------------------- | ------------------------------------------- |
| API version `67.0` and `analytics__Dashboard` | Entity vocabulary and labels                |
| Native semantic property types                | Property names and semantic roles           |
| Registered-query and lifecycle mechanics      | Visible and hidden fields                   |
| Dimensions before measures                    | Display order, sorting, and formatting      |
| Proxy-row normalization                       | Insight subject, goal, and payload fields   |
| Three separate bundles                        | Filters, selections, and Salesforce actions |
| Accessibility and error behavior              | Chart-specific presentation choices         |

References are runtime patterns, not business templates. Never carry an
Opportunity, Account, Stage, Amount, or Log a Call assumption into an unrelated
prompt. Use those concepts only when requested or inside the clearly labelled
DF26 Top Opportunities worked example.

## Workflow

1. Read the attendee prompt and the matching reference before writing code.
2. Derive a semantic role contract and present it for confirmation.
3. Generate the current bundle from the confirmed contract.
4. Verify metadata, query ordering, row mapping, accessibility, and bounded
   result language.
5. Deploy only the current bundle when the attendee asks for deployment.
6. Return the canonical dashboard-placement instructions after a successful
   deploy.

For Build 2 or 3, first read the previous deployed bundle under
`force-app/main/default/lwc/`. It is the source of truth for inherited property
names, types, purposes, query roles, display order, formatting, and row keys.

## Prompt-derived role contract

Define this generation-time contract before Build 1. It is an authoring aid,
not a runtime JSON configuration API. Compile it into concrete metadata,
`@api` accessors, query specs, row mapping, and UI code.

```javascript
const COMPONENT_CONTRACT = {
  entity: {
    singularLabel: "Case",
    pluralLabel: "Cases",
  },
  roles: [
    {
      key: "caseNumber",
      propertyName: "caseNumberField",
      bindingType: "SemanticDimension",
      pickerLabel: "Case Number",
      purpose: "Case number displayed in each row.",
      required: true,
      visible: true,
      valueKind: "text",
      behaviors: ["rowIdentity", "primaryLabel", "insightContext"],
    },
    {
      key: "ageDays",
      propertyName: "ageDaysField",
      bindingType: "SemanticMeasure",
      pickerLabel: "Case Age",
      purpose: "Case age used for display and sorting.",
      required: true,
      visible: true,
      valueKind: "number",
      behaviors: ["primarySort", "insightContext"],
    },
  ],
  displayOrder: ["caseNumber", "ageDays"],
  sort: { roleKey: "ageDays", direction: "desc", scope: "returnedRows" },
  insight: {
    subjectRoleKey: "caseNumber",
    contextRoleKeys: ["caseNumber", "ageDays"],
    goal: "Explain the case status and suggest one supported next action.",
  },
  action: null,
  queryLimit: 5000,
  displayLimit: null,
};
```

Derive only roles the prompt needs. Do not invent a measure for a
dimensions-only list. Do not invent a record action for an aggregate row.
Clarify these cases before generation when the prompt does not supply enough
meaning:

- No stable row identity and no safe deterministic composite.
- Ambiguous dimension versus measure intent.
- A measure without a selected aggregation.
- Formatting that cannot be inferred safely, such as currency or percentage.
- Funnel order, ranking direction, or time grain not stated by the prompt.
- An action without a confirmed target record role or action API name.

Use role keys for internal behavior and `propertyName` for the persisted
dashboard contract. Use display labels from bound `.label` values after
mapping. Keep query order independent from display order: query every dimension
first and every measure last, while rendering `displayOrder` exactly.

## Native binding contract

Read `references/sdm-data-binding.md` for every data-backed component. The
dashboard runtime supplies:

| Role type      | Metadata type       | Runtime value                  |
| -------------- | ------------------- | ------------------------------ |
| Semantic model | `SemanticModel`     | `{ apiName, id, label }`       |
| Dimension      | `SemanticDimension` | `{ name, label }`              |
| Measure        | `SemanticMeasure`   | `{ name, aggregation, label }` |

Read these objects directly. Do not accept legacy string fallbacks, derive
labels from API names, or substitute a hard-coded field when a role is missing.
Declare the model and every role under
`<targetConfig targets="analytics__Dashboard">`. Never expose runtime-injected
`sdk` in metadata.

Bindings are persisted dashboard contracts. Once a bundle is deployed, never
rename, remove, change the type or requiredness of, or repurpose a property.
Create a new bundle or add a genuinely optional role instead.

### Hard-coded recovery mode

Use recovery mode only when the attendee explicitly asks for the basic wire
contract or needs the recovery build. Invoke
`tableau-next-workshop-sdm-discovery`, pass it the confirmed semantic role
contract, and require a live API-derived mapping from the attendee's org in the
current session. Get an explicit "yes" before generating SDK code. Then read
`references/sdm-table.md`.

Never treat the discovery skill's `references/field-mapping-table.md` or a
worked example as a data source. Never hard-code a source, object, or field
from a reference.

## The three builds

| Build | Bundle             | Read                                                  | Change                                                       |
| ----- | ------------------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| 1     | `lwc/vibeTable/`   | `references/sdm-data-binding.md`                      | Derive and freeze roles; render the requested table or chart |
| 2     | `lwc/vibeInsight/` | prior bundle + `references/apex-insight-panel.md`     | Preserve the contract; add a prompt-derived per-row insight  |
| 3     | `lwc/vibeAction/`  | prior bundle + `references/salesforce-action-link.md` | Preserve the contract; add the requested Salesforce action   |

Each build creates a new LWC folder. Do not evolve one bundle in place across
the three workshop prompts. This gives attendees three independent successful
deploys and makes previous output the recovery point.

For a later showcase that presents both Build 2 and Build 3 in one component,
use one `Insights & Actions` view with both row controls. Do not create separate
tabs whose only difference is the addition of the action control.

### Build 1: data surface

1. Confirm the role contract, including property names, types, visibility,
   display order, formatting, row identity, sorting, interactions, query limit,
   and optional display limit.
2. Scaffold `vibeTable.js`, `vibeTable.html`, and
   `vibeTable.js-meta.xml`; add CSS only for iframe-safe layout needs.
3. Use class `VibeTable`, master label `Vibe Table`, API `67.0`, and target
   `analytics__Dashboard`.
4. Compile every role into a native semantic property and private-backed
   `@api` accessor.
5. Register dimensions before measures and keep the final spec order as the
   positional row contract.
6. Render columns or marks in the prompt-derived display order using bound
   labels.
7. Keep query and display limits explicit. A null display limit renders every
   returned row; a numeric display limit applies only after client-side sorting.
   Describe the result honestly: say "Up to 5,000 returned cases, sorted by
   displayed age," not "Top cases," unless server-side measure ordering has
   been proved.

The shared query contract is fixed: subscribe before registration,
`registerFieldsForQuery` owns fetching, `dataUpdate` is the only data path, and
filter/parameter handlers never call `fetchData()`.

Use the live-proven one-shot startup contract. Every `@api` setter schedules a
microtask that attempts startup; the component starts once after it is connected
and all required mappings exist. Do not synchronize bindings from
`renderedCallback`, hydrate the source with `getDataSource().getJson()`, build
binding signatures, or re-register in place. A materially changed mapping
requires the dashboard runtime to remount the component.

### Build 2: per-row insight

1. Read `force-app/main/default/lwc/vibeTable/` and copy every inherited
   property contract unchanged into the new bundle.
2. Use the pre-baked, pre-deployed workshop head-start class at
   `force-app/main/default/classes/RecordInsightGenerator.cls`. Attendees do
   not author, modify, or deploy Apex during the workshop. Import its exact
   `@AuraEnabled` method and preserve the named parameter shape.
3. Compile `contract.insight` into a versioned payload containing the entity,
   subject, goal, and selected context roles. Do not send every hidden value by
   default.
4. Use the panel-swap, request-token, focus-transfer, and refresh-invalidation
   pattern in `references/apex-insight-panel.md`.
5. Route model calls through Apex. Never call `aiplatform.ModelsAPI` from
   JavaScript.

The expected endpoint is:

```javascript
import generateInsight from "@salesforce/apex/RecordInsightGenerator.generateInsight";

const narrative = await generateInsight({
  rowJson: JSON.stringify(payload),
});
```

`OpportunityInsightGenerator` remains only as a compatibility shim for older
workshop components. It is infrastructure, not an attendee task. Do not use it
in newly generated bundles.

### Build 3: per-row Salesforce action

1. Read `force-app/main/default/lwc/vibeInsight/` and copy its complete
   inherited contract unchanged into the new bundle.
2. Derive and confirm an action descriptor: action kind, visible label, icon,
   target record role, object API name for record-page navigation, quick-action
   API name when applicable, and optional record-ID prefixes.
3. Reuse an inherited ID role when it identifies the exact action target.
4. Otherwise add a prompt-derived hidden `SemanticDimension` role. Verify that
   it is functionally dependent on the current row grain; adding a grouping ID
   must not split previously aggregated rows.
5. Insert any new hidden dimension before every measure and rebuild the role
   indexes.
6. Use the validated origin-rewrite and generic record-action pattern from
   `references/salesforce-action-link.md`.

Do not default to Account, `001`, or `Global.LogACall`. Those belong only to a
confirmed Account Log a Call action.

## Critical SDK and UI gates

1. Use `registerFieldsForQuery`, not `fetchDataUsingQueryAndSource`, for the
   dashboard-owned registered query. The latter bypasses automatic dashboard
   filter and parameter context.
2. Declare every `rowGrouping: true` dimension before every
   `rowGrouping: false` measure. Interleaving is silently reordered and corrupts
   positional row mapping.
3. Subscribe to `dataUpdate` before registration because registration may emit
   synchronously.
4. Start loading before registration so a synchronous result remains final.
5. Never call `fetchData()` after registration or from `filterChange` and
   `parameterChange`; the SDK refetches internally.
6. Support delayed `sdk` and binding assignment with setter-scheduled one-shot
   startup. Never synchronize query state from `renderedCallback`.
7. Do not implement in-place rebinding. `dataUpdate` carries no query identity,
   so require a runtime remount for a materially changed mapping.
8. Emit `init` once per SDK connection and always terminate in `loaded`,
   `nodata`, or `error`.
9. Use an explicit no-data state and a visible terminal timeout error.
10. Use SLDS utilities and tokens first. Avoid inline styles. Reserve the
    widget's top-right corner for Tableau Next hover chrome.
11. Use semantic HTML and native Lightning controls. Interactive marks must be
    keyboard operable, visibly focusable, and programmatically named.
12. Use a date-only formatting branch for `YYYY-MM-DD` values so timezone
    conversion cannot shift the displayed calendar date.
13. Use "object" for SDM tables and `OBJ_` for recovery constants. Never emit
    internal `SDO_` terminology.
14. In a table, emit `<thead>`, `<tbody>`, `<th scope="col">`, and matching
    `<td>` cells for every visible data or action column. Give the table a
    prompt-derived caption or accessible name.

## Optional visualization routes

When the attendee asks for a chart, read `references/d3-in-lwc.md` plus the
matching chart reference. Use only its layout mechanics and generic semantic
roles; derive the business design from the prompt.

| Reference             | Required semantic roles                                       |
| --------------------- | ------------------------------------------------------------- |
| `d3-beeswarm.md`      | item dimension, optional category dimension, position measure |
| `d3-bump.md`          | period dimension, entity dimension, ranking measure           |
| `d3-chord.md`         | source dimension, target dimension, weight measure            |
| `d3-funnel.md`        | ordered step dimension, value measure                         |
| `d3-radar.md`         | entity dimension and prompt-selected measures                 |
| `d3-treemap.md`       | parent dimension, child dimension, size measure               |
| `sparkline-column.md` | entity, period, and value; or labelled synthetic demo mode    |

Do not add filter/selection behavior unless the prompt requests it. If the
prompt requests interaction, publish against the configured source and role,
and provide an equivalent keyboard path.

For a media-only tile, read `references/video-player.md`. It has no SDM query,
no discovery, and no `@api sdk`.

## Worked example: DF26 Top Opportunities

Use this only when the attendee asks for the canonical sales scenario or
explicitly selects the recovery example.

| Role                  | Property             | Type                |
| --------------------- | -------------------- | ------------------- |
| Stable opportunity ID | `opportunityIdField` | `SemanticDimension` |
| Account display name  | `accountNameField`   | `SemanticDimension` |
| Opportunity stage     | `stageField`         | `SemanticDimension` |
| Close date            | `closeDateField`     | `SemanticDimension` |
| Opportunity type      | `typeField`          | `SemanticDimension` |
| Amount                | `amountField`        | `SemanticMeasure`   |

For the canonical Build 3 only, an Account Log a Call action may add hidden
`accountIdField: SemanticDimension`, validate prefixes `001`, and use
`Global.LogACall`. This example never establishes defaults for other prompts.

## Post-deploy response

After a successful `sf project deploy start ... --source-dir ...`, return this
block exactly, substituting only the two placeholders:

> Deploy succeeded - `<lwc-name>` is live in your org.
>
> **How to add it to your dashboard:**
>
> 1. Open your Tableau Next dashboard **in edit mode** (from the Tableau
>    tab in your org).
> 2. In the **toolbar across the top of the dashboard**, click the
>    **lightning-bolt icon** (tooltip: "Extension") - it's toward the
>    right end of the icon row.
> 3. The extensions picker opens with a list of your custom LWC
>    extensions. Find **`Vibe <Name>`** in that list.
> 4. Drag it onto your dashboard canvas.
> 5. In the widget panel, select the semantic model and map every required
>    dimension and measure role. Select the aggregation for each measure.
>
> The widget renders as soon as all required roles are mapped.

Do not add Analytics Studio, left-panel, Components-tab, or puzzle-piece steps;
those locations do not apply to Tableau Next extensions.

## Troubleshooting

| Symptom                                               | Cause                                                                     | Fix                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Calculated measure query returns an aggregation error | An aggregation was set on a bare calculated measure                       | Omit `aggregationType`; the model owns it                                  |
| Field does not exist in table                         | A model-level field was qualified or a recovery mapping was guessed       | Use the confirmed bare model-level name or rerun discovery                 |
| Widget enters error during load                       | `fetchData()` raced the registered query                                  | Remove explicit fetches from registration and filter handlers              |
| Initial rows never arrive                             | Subscription was installed after registration                             | Subscribe before `registerFieldsForQuery`                                  |
| Text or ID contains a numeric measure                 | A dimension was placed after a measure or role indexes do not match specs | Group all dimensions first and rebuild indexes                             |
| Configuration state remains visible                   | A required semantic role is unmapped                                      | Map every required role; do not add a hard-coded fallback                  |
| Old rows appear after remapping                       | Overlapping registrations cannot be attributed                            | Require remount; do not advertise live retargeting                         |
| Insight returns to a closed or newer panel            | Missing request-token invalidation                                        | Apply the complete pattern in `apex-insight-panel.md`                      |
| Salesforce action does nothing                        | Invalid target ID, action name, or rewritten origin                       | Validate the confirmed action descriptor before opening                    |
| Date displays one day early                           | UTC parsing was used for a date-only value                                | Construct the local date from year, month, and day parts                   |
| Component is absent from the picker                   | Incorrect metadata target or API version                                  | Use `analytics__Dashboard` and API `67.0`                                  |
| Deploy validator throws a null property type error    | The org retains an old target-property shape                              | Deploy once without the analytics target, then restore it and deploy again |

## Verification

Read `references/test-contract.md` before deployment and
`references/skill-evals.md` when changing this skill. At minimum:

1. Compare Build 1 -> 2 -> 3 metadata as structured properties.
2. Verify all dimensions precede measures in every query.
3. Verify each visible label and accessible name comes from the prompt or a
   mapped binding.
4. Run a canonical Opportunity generation and an unrelated Support Case
   generation; the latter must contain no leaked sales roles or actions.
5. Smoke-test the concrete mapped query through
   `references/smoke-test-query.md`.
6. Exercise loaded, no-data, error, filter refresh, insight focus, stale
   response, and action validation behavior in a live dashboard.

## Files

```text
.a4drules/skills/tableau-next-workshop-lwc/
|-- SKILL.md
|-- README.md
`-- references/
    |-- sdm-data-binding.md
    |-- sdm-table.md
    |-- sdm-helpers.js
    |-- smoke-test-query.md
    |-- apex-insight-panel.md
    |-- salesforce-action-link.md
    |-- d3-in-lwc.md
    |-- d3-beeswarm.md
    |-- d3-bump.md
    |-- d3-chord.md
    |-- d3-funnel.md
    |-- d3-radar.md
    |-- d3-treemap.md
    |-- sparkline-column.md
    |-- video-player.md
    |-- skill-evals.md
    `-- test-contract.md
```

## Attribution

Forked from `tableau-next-custom-lwc` at `alaviron/tableau-skills` (Tableau
Next tooling team). Wire-format behavior was verified from internal reference
tooling and live workshop prototypes. This fork remains DF26-specific.
