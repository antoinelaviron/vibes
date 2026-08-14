---
name: tableau-next-workshop-lwc
description: |
  Builds and evolves Tableau Next dashboard-extension LWCs for the DF26 workshop.
  Use for workshop requests involving analytics__Dashboard, vibeTable, vibeInsight,
  vibeAction, vibeChart, vibeChord, vibeSparkline, vibeSearch, vibeKanban,
  vibeTheme, vibeVideo, Tableau Next dashboard extensions, or the workshop's
  Tableau SDK, AI insight, and Salesforce-action patterns. Do not use for generic
  Lightning pages, Tableau Cloud .trex extensions, or semantic-model authoring.
license: Apache-2.0
metadata:
  author: alaviron
  version: workshop-4.0
  fork_of: tableau-next-custom-lwc
  api-version: v66.0
---

# tableau-next-workshop-lwc

This skill owns the DF26 workshop's Tableau Next dashboard-extension LWCs.
It has three core builds for the one-hour path and optional menu patterns that
are loaded only when requested. Use the production `tableau-next-custom-lwc`
skill for non-workshop work.

## Routing

| Request | Starting point | Read before writing code |
| --- | --- | --- |
| Build 1: `vibeTable` | New bundle | `sdk-query-lifecycle.md`, `sdm-table.md` |
| Build 2: `vibeInsight` | Attendee's `vibeTable` | Core references, `apex-insight-panel.md` |
| Build 3: `vibeAction` | Attendee's `vibeInsight` | Core references, `salesforce-action-link.md` |
| `vibeChart` | Purpose-built aggregate visualization | `sdk-query-lifecycle.md`, `d3-in-lwc.md`, matching `d3-*.md` |
| `vibeChord` | Purpose-built aggregate visualization | `sdk-query-lifecycle.md`, `d3-in-lwc.md`, `d3-chord.md` |
| `vibeSparkline` | Preserve `vibeAction`; add a column | Core references, `d3-in-lwc.md`, `sparkline-column.md` |
| `vibeSearch`, `vibeKanban`, `vibeTheme` | Preserve `vibeAction` behavior | Core references and the attendee prompt |
| `vibeVideo` | Independent media tile | `video-player.md`; skip SDM discovery and SDK code |

The optional aggregate visualizations replace the table and do not need the
Insight or Log a Call surface. `vibeVideo` is the only pure-media exception.

## Critical Gates

1. **Read the routed references before writing code.** References are patterns,
   not starters. Author from the attendee's prompt; never paste a reference
   unchanged.
2. **Use live discovery for every data-backed Build 1.** First invoke
   `tableau-next-workshop-sdm-discovery`. Require its current-session live
   hand-off and explicit attendee confirmation before generating code. Never
   copy source names, object API names, or field names from an example.
3. **Preserve the Tableau target.** Use `<target>analytics__Dashboard</target>`.
   Never substitute `lightning__AppPage` or `tableau__DashboardExtension`.
4. **Use the canonical SDK lifecycle.** Data-backed components must follow
   `references/sdk-query-lifecycle.md`. It preserves Tableau filtering and
   avoids the startup and reconnect races discovered in workshop testing.
5. **Use `registerFieldsForQuery`, never `fetchDataUsingQueryAndSource`.** The
   registered path lets the dashboard runtime inject active filters and
   parameters. Do not call `fetchData()` after registration or from filter and
   parameter handlers because the SDK owns that refresh.
6. **Declare all dimensions before measures.** The SDK returns grouped
   dimensions before measures even if specs are interleaved. Keep
   `rowGrouping: true` specs first, then `rowGrouping: false` specs, and build
   `IDX` in that returned order. This prevents an amount from being used as a
   record ID.
7. **Use `Object.field` for raw fields and bare names for model-level calcs.**
   Raw dimensions are qualified and grouped. Raw measures are qualified with an
   appropriate aggregation. `_clc` and `_mtc` fields are bare model names with
   no `aggregationType` because the SDM owns their aggregation.
8. **Use `OBJ_` terminology.** The workshop model has objects, not SDOs. Use
   `OBJ_OPPORTUNITY`, never `SDO_OPPORTUNITY`, in code and prose.
9. **Keep Build 2 AI calls in Apex.** Read
   `force-app/main/default/classes/OpportunityInsightGenerator.cls` before
   importing it. Use its exact `@AuraEnabled` method and parameter shape; never
   call the Models API from browser JavaScript.
10. **Rewrite Salesforce action origins.** `NavigationMixin` does not work from
    the analytics iframe. Use the validated URL pattern in
    `salesforce-action-link.md`.
11. **Use SLDS first.** Prefer SLDS utilities and tokens. Small CSS files are
    appropriate for iframe-safe layout and visualizations. Do not use inline
    layout styles.

## Core Builds

### Build 1: Data table

1. Invoke discovery, present the confirmed mapping, and wait for confirmation.
2. Before writing a new semantic query, follow `smoke-test-query.md`. The smoke
   test proves field validity, not runtime ordering.
3. Create `force-app/main/default/lwc/vibeTable/` with `.js`, `.html`, and
   `.js-meta.xml` files. Use source API version `66.0` or the project's matching
   version.
4. Follow `sdk-query-lifecycle.md` for delayed SDK injection, bounded hydration,
   subscription, loading, terminal timeout, and reconnect behavior.
5. Follow `sdm-table.md` for row mapping, date display, and bounded result copy.

### Build 2: Per-row AI insight

1. Read the attendee's deployed `force-app/main/default/lwc/vibeTable/` first.
   Preserve its confirmed query shape and `IDX` map in a new `vibeInsight`
   bundle.
2. Read `OpportunityInsightGenerator.cls` and
   `references/apex-insight-panel.md` before adding the Apex import, request
   token, panel swap, or focus management.
3. Keep the table and panel mutually exclusive. Invalidate pending insight work
   on close, query refresh, and disconnect.

### Build 3: Per-row Log a Call

1. Read the attendee's deployed `vibeInsight` bundle first and create a separate
   `vibeAction` bundle.
2. Read `salesforce-action-link.md`. Add the hidden Account ID dimension before
   all measures, map it as `row.accountId`, and do not render the ID.
3. Omit or disable the action when its Account ID is missing or invalid. Do not
   silently open a malformed URL.

## Result Limits

The 25-row limit is a workshop presentation budget, not a Tableau data limit.
Without supported server-side ordering in the dashboard SDK, client sorting can
only order the returned set. Say "Up to 25 returned opportunities, sorted by
displayed amount" or use wording appropriate to the query grain. Do not claim
global "Top 25" results.

## Deployment And Verification

Deploy only the changed bundle:

```bash
sf project deploy start --source-dir force-app/main/default/lwc/<bundle-name>
```

After a data-backed deploy, verify initial rendering or a visible terminal error,
then change one relevant dashboard filter and verify updated content. Also run
the feature-specific interaction for Insight, Log a Call, a selected chart, or
video. `test-contract.md` separates this quick workshop check from maintainer
regression coverage.

After every successful deploy, use this exact attendee wording:

> Deploy succeeded - `<lwc-name>` is live in your org.
>
> **How to add it to your dashboard:**
>
> 1. Open your Tableau Next dashboard **in edit mode** (from the Tableau tab in your org).
> 2. In the **toolbar across the top of the dashboard**, click the **lightning-bolt icon** (tooltip: "Extension") - it's toward the right end of the icon row.
> 3. The extensions picker opens with a list of your custom LWC extensions. Find **`Vibe <Name>`** in that list.
> 4. Drag it onto your dashboard canvas.
>
> That's it. The widget renders on drop.

Substitute the bundle name and the `<masterLabel>` only.

## Troubleshooting

| Symptom | Read | Likely correction |
| --- | --- | --- |
| SDK is undefined during connect | `sdk-query-lifecycle.md` | Retry from `renderedCallback`; do not start twice. |
| Spinner never resolves | `sdk-query-lifecycle.md` | Confirm loading starts before registration and timeout becomes visible. |
| Calc field query returns 400 | `sdm-table.md` | Use bare `_clc`/`_mtc` model with no aggregation. |
| IDs or labels become amounts | `sdk-query-lifecycle.md` | Put every dimension before every measure and rebuild `IDX`. |
| Insight overwrites a newer panel | `apex-insight-panel.md` | Use a request token and invalidate stale work. |
| Action does nothing | `salesforce-action-link.md` | Validate the ID and rewritten Lightning origin. |
| D3 chart is empty or disappears | `d3-in-lwc.md` | Check manual DOM, D3 readiness, buffer, and lifecycle generation. |
| Video tile is blank | `video-player.md` | Check URL policy and the org's YouTube CSP Trusted Site. |

## Skill Files

```text
.a4drules/skills/tableau-next-workshop-lwc/
├── SKILL.md
├── IMPROVEMENTS.md                 # historical findings and dispositions
└── references/
    ├── sdk-query-lifecycle.md      # authoritative SDK lifecycle
    ├── sdm-table.md                # Build 1 table details
    ├── smoke-test-query.md         # query validation before code
    ├── apex-insight-panel.md       # Build 2 details
    ├── salesforce-action-link.md   # Build 3 details
    ├── d3-in-lwc.md                # D3 lifecycle overlay
    ├── d3-*.md                     # chart-specific algorithms
    ├── sparkline-column.md
    ├── video-player.md
    ├── test-contract.md            # maintainer and workshop verification
    └── skill-evals.md              # focused skill-output evaluation cases
```

`IMPROVEMENTS.md` records why these rules exist. It is not an additional source
of canonical code; the routed references above are authoritative.
