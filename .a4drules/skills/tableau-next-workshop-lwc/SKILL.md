---
name: tableau-next-workshop-lwc
description: |
  Build a Tableau Next dashboard extension LWC for the DF26 workshop.
  Use when the user asks to create, scaffold, or evolve a Tableau Next
  extension for the DF26 workshop. Triggers on "Tableau Next dashboard
  extension", "vibeTable", "vibeInsight", "vibeAction",
  "analytics__Dashboard", or workshop-context requests to build/grow one
  of the three workshop LWCs.
  Do NOT use for generic Lightning pages (Home / Record / App). Do NOT use for
  Tableau Cloud Extensions API (.trex files). Do NOT use for calculated field
  or metric creation.
license: Apache-2.0
metadata:
  author: alaviron
  version: workshop-4.0
  fork_of: tableau-next-custom-lwc
  api-version: v67.0
---

# tableau-next-workshop-lwc

**Fork of `tableau-next-custom-lwc`, narrowed for the DF26 workshop.** One
workshop, three LWCs, one hour on stage. Everything not on that path was
deleted.

**Do not reuse outside DF26.** For production LWC work, use the canonical
`tableau-next-custom-lwc` skill at `alaviron/tableau-skills`.

## Default architecture: native data binding

Generate SDM-backed workshop components with native Tableau Next data
binding by default. The component declares semantic roles in metadata;
the dashboard author maps those roles in the widget panel after deployment.

| Role type | Metadata type | Runtime value |
|---|---|---|
| Semantic model | `SemanticModel` | `{ apiName, id, label }` |
| Measure | `SemanticMeasure` | `{ name, aggregation, label }` |
| Dimension | `SemanticDimension` | `{ name, label }` |

Read these guaranteed object shapes directly. Do not accept legacy string
fallbacks, derive display labels from API names, or insert hard-coded field
names when a binding is missing. Use API version 67.0 and declare
each role under `<targetConfig targets="analytics__Dashboard">`.

Read `references/sdm-data-binding.md` before generating any SDM-backed
component. It owns the metadata contract, runtime rebinding controller,
aggregation rules, registered-query pipeline, and verification gate.

### Hard-coded recovery mode

The original discovery-driven path remains available when the attendee asks
to learn the basic wire contract or needs the recovery build. Only in that
mode, invoke `tableau-next-workshop-sdm-discovery`, confirm the live mapping,
and compile the confirmed source and fields into constants. Read
`references/sdm-table.md` for that path.

## The three builds — one LWC per build

Each build creates a NEW LWC. Attendees do NOT edit a single file across
prompts. Build 1 is scaffolded from scratch with native semantic bindings.
Builds 2 and 3 start from the
attendee's own deployed LWC from the previous build — that's the
natural source of truth, and mirrors what a stuck attendee would do
if the facilitator handed them the recovery kit.

| Build | LWC folder | Reference pattern | What it does |
|---|---|---|---|
| **1** | `lwc/vibeTable/` | `references/sdm-data-binding.md` | Bound opportunity table, reacts to filters |
| **2** | `lwc/vibeInsight/` | prior build + `references/apex-insight-panel.md` | Build 1 + per-row Insight button → AI narrative panel |
| **3** | `lwc/vibeAction/` | prior two + `references/salesforce-action-link.md` | Build 2 + per-row Log a Call button |

**Why per-build LWCs**: each build lands as a distinct, working file
so the attendee sees three deploys succeed in a row and can point back
at each one on the dashboard. An attendee who falls behind is unblocked
by the facilitator recovery kit (outside this skill), not by copying an
asset out of it.

**Why native binding:** attendees create an extension whose semantic roles are
mapped in the dashboard instead of compiled into code. After the live release
gate proves the SDK's remount/cancellation behavior, it can also be retargeted
to another compatible model without editing and redeploying code. The skill
absorbs the lifecycle complexity; the attendee sees semantic roles rather
than org-specific API names.

## Critical gates (must follow)

1. **Read the matching pattern reference before writing code.** Every
   build has a reference under `references/` (see the build table
   above). Read it — the rules, the annotated snippet, the placeholder
   full-file — then author the LWC from the attendee's prompt matching
   that shape. Do NOT dump the reference file to the attendee as-is.
   Do NOT copy `SOURCE_NAME`, object apiNames, or field apiNames
   verbatim — every placeholder in the reference comes from the
   discovery hand-off (Gate #2). The attendee needs to see code get
   authored from their prompt, not watch you paste a starter. For
   Builds 2 and 3, also read the attendee's already-deployed LWC from
   the previous build (`force-app/main/default/lwc/vibe<Prev>/`) —
   that's the natural source of truth for the binding contract, query shape,
   the `IDX` map, and the sort order, so the new file stays consistent with
   what they wrote.

2. **Native binding first; discovery-first only in recovery mode.** For the
   default path, define and confirm a role-based binding contract, then expose
   those roles as semantic metadata properties. Do not discover or hardcode a
   concrete SDM. For hard-coded recovery mode, never write SDK code until you
   have a hand-off JSON from
   `tableau-next-workshop-sdm-discovery` whose values came from a live
   `sf api request rest /services/data/v67.0/ssot/semantic/models[/…]`
   call against the attendee's org **in this session**. Cached mappings
   from the discovery skill's `references/field-mapping-table.md` are
   NOT acceptable substitutes — that file is a hint fallback, not a data
   source. If no live-discovery hand-off exists, STOP and call the
   discovery skill. Get explicit "yes" from the attendee on the mapping
   before you generate SDK pipeline code. Never hardcode `SOURCE_NAME`,
   table names, or field apiNames from example blocks in this file or
   any reference file.

3. **SLDS-first styling.** Use SLDS utility classes. Avoid inline
   `<div style="…">`. A small `<lwc>.css` for iframe-safe layout tweaks
   (min-heights, borders) is fine — see Build 2/3 canonical files.
   Top-right of the widget is reserved by Tableau Next's own hover
   chrome — see `apex-insight-panel.md`'s panel-header rule.

4. **Never call the Models API from JS (Build 2).** Always via an
   `@AuraEnabled` Apex method. This is Trust Layer routing — non-negotiable.

5. **Never invent an Apex method name (Build 2).** Read
   `force-app/main/default/classes/OpportunityInsightGenerator.cls` in this
   repo. Use the exact `@AuraEnabled` method name and parameter shape.

6. **Origin rewrite for Salesforce navigation (Build 3).** Any `/lightning/…`
   URL must be rewritten from the analytics domain to the Lightning domain.
   `NavigationMixin` does NOT work inside `*--analytics.<domain>`.

7. **Query bound fields via `registerFieldsForQuery` (Builds 1+).** Data
   binding does not change the query transport. Translate `sdmName.apiName`
   and each bound field's `name` into field specs. Do not use
   `fetchDataUsingQueryAndSource` merely because fields are bound. The
   registered path lets the
   dashboard's active filters and parameters flow into the query
   automatically. `fetchDataUsingQueryAndSource` sends `queryJson`
   verbatim to the semantic engine — filters/parameters do NOT flow,
   the widget re-renders identical data on every filter change, and
   there is no supported wire shape for injecting them manually (the
   `StructuredSemanticQuery` message has no `filters` field —
   HAR-verified against a live viz payload, 2026-07-29). See
   `references/sdm-data-binding.md` for the native controller and
   `references/sdm-table.md` for recovery-mode call order.

8. **Spec order rule: declare ALL dimensions BEFORE any measure.** This
   applies equally to specs built from bound properties.
   `registerFieldsForQuery` returns rows whose columns are grouped by
   `rowGrouping` — every `rowGrouping: true` spec is delivered first,
   every `rowGrouping: false` spec last, regardless of the order you
   declared them. **Interleaving is silently reordered.** If you declare
   `[dim, dim, dim, measure, dim]`, the row Proxy comes back as
   `[dim, dim, dim, dim, measure]` and your `IDX` map is off by one —
   the classic symptom is a numeric value showing up where a text ID
   or label should be (e.g. `recordId=4822.56` in a Log a Call URL,
   verified 2026-07-29 on the workshop template SDM).
   
   Rule: keep the `specs[]` array grouped — all `rowGrouping: true`
   first, all `rowGrouping: false` last. Then build the `IDX` map in the
   same order the SDK will return columns. When adding a field in a
   later build, insert it in the correct group — dimensions go before
   any existing measure, never after.

9. **Naming: use "object" for SDM tables, never "SDO".** The Sales Cloud
   semantic model has *objects* (Account, Opportunity, etc.), not "SDOs".
   When you declare per-object constants in the LWC, prefix them `OBJ_`,
   not `SDO_` — e.g. `const OBJ_OPPORTUNITY = 'Opportunity'`. "SDO" is
   internal-Salesforce jargon and does not appear anywhere else in the
   workshop. Do not emit it in code, comments, or attendee-facing prose.

10. **Use the canonical "How to add it to your dashboard" wording after
    every successful deploy.** See "Post-deploy: telling the attendee how
    to add the widget" below. Do NOT invent your own steps — the picker
    UI is not where Lightning App Builder puts custom components, and
    getting the placement wrong wastes 5 minutes per attendee looking for
    a "puzzle-piece Components tab" that doesn't exist.

11. **Bindings are a persisted dashboard contract.** Never rename, remove,
    change the type of, or repurpose a binding property in a deployed bundle.
    Add a new optional property or create a new LWC bundle. Never expose
    runtime-injected `sdk` in metadata.

## Post-deploy: telling the attendee how to add the widget

After a successful `sf project deploy start ... --source-dir ...`,
paste this exact block back to the attendee. Do not paraphrase, do not
add steps, do not reference Analytics Studio, a left panel, a
Components tab, or a puzzle-piece icon — none of those apply.

> Deploy succeeded — `<lwc-name>` is live in your org.
>
> **How to add it to your dashboard:**
>
> 1. Open your Tableau Next dashboard **in edit mode** (from the Tableau
>    tab in your org).
> 2. In the **toolbar across the top of the dashboard**, click the
>    **lightning-bolt icon** (tooltip: "Extension") — it's toward the
>    right end of the icon row.
> 3. The extensions picker opens with a list of your custom LWC
>    extensions. Find **`Vibe <Name>`** in that list.
> 4. Drag it onto your dashboard canvas.
> 5. In the widget panel, select the semantic model and map every required
>    dimension and measure role. Select the aggregation for each measure.
>
> The widget renders as soon as all required roles are mapped.

Substitute `<lwc-name>` with the folder name (e.g. `vibeTable`) and
`Vibe <Name>` with the `<masterLabel>` from the meta.xml
(e.g. `Vibe Table`). No other wording changes.

---

## Build 1 — Data table (the SDK pipeline)

**Attendee prompt shape:** "Create a Tableau Next dashboard extension
called `vibeTable` — a table of my top opportunities."

**Your job:**

1. **Define the binding contract first.** Present these role names and confirm
   them with the attendee. Do not select a concrete SDM or field API names in
   the default path:

   - `sdmName` — `SemanticModel`
   - `opportunityIdField` — `SemanticDimension`
   - `accountNameField` — `SemanticDimension`
   - `stageField` — `SemanticDimension`
   - `closeDateField` — `SemanticDimension`
   - `typeField` — `SemanticDimension`
   - `amountField` — `SemanticMeasure`

2. **Scaffold `force-app/main/default/lwc/vibeTable/` from scratch.**
   Three files (`vibeTable.js`, `vibeTable.html`, `vibeTable.js-meta.xml`),
   `<target>analytics__Dashboard</target>`, class `VibeTable`,
   `<masterLabel>Vibe Table</masterLabel>`, `apiVersion` 67.0.
   Consult `references/sdm-data-binding.md` for the exact metadata and
   runtime shape. See
   the native data-binding reference. The pipeline and full file below are
   retained only for hard-coded recovery mode.

3. **Write the binding-aware pipeline using `registerFieldsForQuery`.**
   Wait until all required properties are mapped, subscribe before the first
   registration, and build dimensions before measures. `dataUpdate` is the
   only data path. Never call `fetchData()` after registration or from
   filter/parameter handlers.

4. **Hard-coded recovery exception.** If the attendee explicitly chooses
   recovery mode, call `tableau-next-workshop-sdm-discovery`, wait for the
   confirmed hand-off, and use `references/sdm-table.md` instead.

5. **The attendee needs to see Vibes author from their prompt**, not
   receive a pre-baked file. Read the canonical file to know the shape,
   then generate the LWC from the attendee's prompt matching that shape.

### Shared query contract

Both native and hard-coded modes use `registerFieldsForQuery`, subscribe to
`dataUpdate` before registration, keep all dimensions before measures, consume
Proxy rows positionally, and never call `fetchData()` after registration or
from filter/parameter handlers. Raw object measures use their selected
aggregation; bare model-level calculated measurements omit it. Semantic
metrics remain a verified hard-coded/manual-query concern.

Read `references/sdm-data-binding.md` for the default metadata and rebinding
controller. Read `references/sdm-table.md` for the full hard-coded recovery
pipeline, field-shape examples, row mapping, and filter behavior.

---

## Build 2 — Per-row AI insight

**Attendee prompt shape:** "Create `vibeInsight`, a new extension in
its own folder. Start from the `vibeTable` code just deployed — same
table, plus an Insight button per row that gets an AI narrative."

**Your job:**

1. **Start from the attendee's deployed `vibeTable` code**
   (`force-app/main/default/lwc/vibeTable/` — they wrote it in Build 1
   and it's the natural source of truth for the binding contract, query
   shape, and `IDX` map). Keep every semantic property name and type
   unchanged. Read `references/apex-insight-panel.md` for the panel-swap
   pattern and the exact Apex-call shape you're adding. Then author
   `vibeInsight` from the attendee's prompt matching that shape. New
   folder, new class name (`VibeInsight`), new `<masterLabel>Vibe Insight</masterLabel>`.
2. **Read the Apex class** at
   `force-app/main/default/classes/OpportunityInsightGenerator.cls` to get
   the exact signature — do NOT guess method names.
3. **Import from Apex, not JS:**

    ```javascript
    import generateInsight from '@salesforce/apex/OpportunityInsightGenerator.generateInsight';
    ```

    Call with named params:

    ```javascript
    const narrative = await generateInsight({ rowJson: JSON.stringify(payload) });
    ```

Use the panel-swap pattern from `references/apex-insight-panel.md`: render the
table or the insight panel, never a fixed-position modal. That reference owns
the state, stale-request token, focus transfer, template, and error behavior.
Refreshes and binding changes must close the panel and invalidate pending Apex
requests.

---

## Build 3 — Per-row Log a Call

**Attendee prompt shape:** "Create `vibeAction`, a new extension in
its own folder. Start from the `vibeInsight` code just deployed —
same table + Insight, plus a Log a Call button per row."

**Your job:**

1. **Start from the attendee's deployed `vibeInsight` code**
   (`force-app/main/default/lwc/vibeInsight/` from Build 2 — same
   rationale). Read `references/salesforce-action-link.md` for the
   origin-rewrite pattern, the exact `Global.LogACall` quick-action
   name, and the "hidden ID dimension goes BEFORE the measure" spec
   ordering (Gate #8). Then author `vibeAction` from the attendee's
   prompt. New folder, new class name (`VibeAction`), new
   `<masterLabel>Vibe Action</masterLabel>`. Preserve all inherited semantic
   property names and types.
2. **Add `accountIdField` as a required `SemanticDimension` binding.** Query
   it as a hidden dimension, store it as `row.accountId`, and do not display
   it in a column. Do not assume a specific SDM field name. `vibeAction` is a
   new bundle, so its initial contract can require this role.
3. **Add the Log a Call button per row.**

Use the origin rewrite and validated Account-ID handler from
`references/salesforce-action-link.md`. That reference owns the exact
`Global.LogACall` action name, `001...` validation, hidden-dimension ordering,
button accessibility, and `window.open` behavior.

---

## Cross-cutting gotchas

**SDK undefined in `connectedCallback`.** `@api sdk` is injected AFTER
`connectedCallback` on `analytics__Dashboard` widgets. Hard-coded recovery
mode uses the guarded re-entry below; native mode uses the binding sync
controller in `sdm-data-binding.md`:

```javascript
connectedCallback() { this._tryStartPipeline(); }
renderedCallback() { this._tryStartPipeline(); }

_tryStartPipeline() {
    if (this._pipelineStarted) return;
    if (!this.sdk) return;
    this._pipelineStarted = true;
    this._runPipeline();
}
```

**Never `<property name="sdk">` in meta.xml.** `@api sdk` is
runtime-injected — declaring it as a `<property>` causes a deploy error.

**Semantic bindings belong in meta.xml.** Unlike `sdk`, `sdmName` and every
role-specific field property must be declared under the
`analytics__Dashboard` target config. API version 67.0 is required.

**Bindings arrive after construction and can change.** A one-shot
`_pipelineStarted` guard is only valid for hard-coded recovery mode. Native
data-bound components compare a stable binding signature and re-register once
when the model, field, aggregation, or limit changes. See
`references/sdm-data-binding.md`. Because `dataUpdate` has no query token,
in-place retargeting remains experimental until the live gate proves remount or
request cancellation.

**`ShowToastEvent` is silently dropped** in a dashboard extension.

**Deploy NPE workaround.** If deploy fails with
`"insights.lwc.LwcValidator_AnalyticsDashboard$Property.getType()" because
the return value of "java.util.Map.get(Object)" is null`, do a two-step
deploy: (1) remove `analytics__Dashboard` from `<targets>` and deploy;
(2) re-add it and deploy again.

**`position: fixed` doesn't escape the iframe.** Anything you want to
"float over the dashboard" is trapped inside the widget's iframe rectangle.
Design for in-widget states (panel swap, drawer within the widget) —
don't build modals.

**`lightning-spinner alternative-text=""` prints a console warning.**
Always set a non-empty `alternative-text`.

**`key` on `<template>` is invalid.** For per-row expansion or multi-tbody
patterns, put `key` on a real DOM element (`<tr>`, `<tbody>`).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Query 400: *"Summary formula cannot have aggregation method different than NONE/AUTO/USER_AGG"* | `aggregationType` set on a bare calculated measurement | Remove `aggregationType` — the SDM owns aggregation for calculated measurements |
| Query 400: *"field X does not exist in table Y"* | A model-level calculated field written as `"Object.field"` | Use its bare `model` name |
| Widget errors mid-load, `setErrorState` fires | Called `fetchData()` after `registerFieldsForQuery` (or from `filterChange` handler) | Never call `fetchData()` — SDK fetches internally. Event handlers are UI-only |
| Widget renders on load but never reacts to filters | Using `fetchDataUsingQueryAndSource` instead of `registerFieldsForQuery` | Switch paths — see Gate #7. `fetchDataUsingQueryAndSource` bypasses the dashboard's filter runtime |
| Initial payload missing rows | Subscribed to `dataUpdate` AFTER calling `registerFieldsForQuery` | Subscribe first — `DATA_UPDATE` can fire synchronously inside `registerFieldsForQuery` |
| Table empty but no error | Positional row-read mismatch | Verify `IDX` map matches spec declaration order |
| Text/ID column shows a number (e.g. `recordId=4822.56` in a URL, dollar amount where an account ID should be) | Dimension declared AFTER a measure in `specs[]` — SDK reordered it so dimensions come first, measures last. `IDX` is off by one column | See Gate #8. Rearrange `specs[]` so ALL `rowGrouping: true` specs come before any `rowGrouping: false` spec, then update `IDX` to match |
| Pipeline never runs | SDK undefined in `connectedCallback`, no re-entry | Call `_tryStartPipeline()` from both `connectedCallback` and `renderedCallback` |
| Widget shows configuration message | One or more required semantic roles are unmapped | Select a model and map every required role in the widget panel; do not add a hard-coded fallback |
| Configuration panel is empty | API version below 67.0 or native data binding is disabled in the org | Set `<apiVersion>67.0</apiVersion>` and verify the org feature |
| Widget shows old data after remapping | One-shot pipeline or duplicate binding registration | Use the binding signature controller in `sdm-data-binding.md`; verify replacement behavior in a live dashboard |
| Widget deploys but not visible in dashboard picker | Wrong target in meta.xml | Ensure `<target>analytics__Dashboard</target>` |
| Log a Call button does nothing | Missing origin rewrite | Rewrite `--analytics.<domain>` → `.lightning.force.com` before `window.open` |
| Modal has gray stripe on the widget iframe boundary | Using `position: fixed` inside the iframe | Use panel-swap pattern instead of a modal |
| Console: LWC1065 for:each key error | Used `i` (index) as key | Compose a `rowKey` from index + stable field |

## Files in this skill

```
.a4drules/skills/tableau-next-workshop-lwc/
├── SKILL.md                          ← this file
├── README.md                         ← short overview
└── references/
    ├── sdm-helpers.js                ← copy-paste SDK helper functions
    ├── sdm-data-binding.md           ← default Build 1 metadata + rebinding pattern
    ├── smoke-test-query.md           ← curl the SDM query before writing LWC
    ├── sdm-table.md                  ← Build 1 pattern (SDM query + table)
    ├── apex-insight-panel.md         ← Build 2 pattern (Apex + panel-swap)
    ├── salesforce-action-link.md     ← Build 3 pattern (origin-rewrite + Log a Call)
    ├── d3-in-lwc.md                  ← D3 shadow-DOM survival guide
    ├── sparkline-column.md           ← per-row inline sparkline (composes d3-in-lwc + sdm-table)
    ├── d3-beeswarm.md                ← deal-size distribution scatter
    ├── d3-radar.md                   ← multi-metric industry compare
    ├── d3-funnel.md                  ← pipeline funnel by opportunity stage
    ├── d3-treemap.md                 ← revenue by industry × account
    ├── d3-bump.md                    ← rank-over-time by account
    ├── d3-chord.md                   ← circular flow between type × stage (workshop-original)
    └── video-player.md               ← MP4/YouTube video tile, no SDK
```

Each reference is a **pattern**, not a starter. Read it, understand
the rules and the shape, then author from the attendee's prompt —
never dump the reference verbatim into `force-app/…`. In the default path,
SDM source and field API names come from native bound objects at runtime.
Only the hard-coded recovery references contain org-specific placeholders
supplied by discovery.

**When the attendee asks for "something other than a table"** — a
chart, viz, or shape — the 6 `d3-<name>.md` references cover the
sanctioned chart types. Each is a full end-to-end pattern (SDM query
shape, layout mechanic, common surprises) and works with the workshop
template's Sales Cloud SDM out of the box. Read the matching
`d3-<name>.md` **plus** `d3-in-lwc.md` before writing code — the
survival-guide rules in the latter still apply per chart.

**When the attendee asks for a video tile** — read `references/
video-player.md` instead. It is the one pattern with **no SDM query
and no `@api sdk`** — do not run SDM discovery for it, and do not add
an `sdk` property to its meta.xml.

## Attribution

Forked from `tableau-next-custom-lwc` at `alaviron/tableau-skills`
(Tableau Next tooling team). Wire-format ground truth reverse-engineered
from internal reference tooling and a Sankey-diagram reference build.
This workshop fork is DF26-specific — do not reuse outside the workshop.
