# Agent instructions — DF26 vibe-code extension workshop

**READ THIS BEFORE WRITING ANY CODE IN THIS REPO.**

## What this repo is

A live workshop repo for Dreamforce 2026 Session 3047: "Vibe-Code Your
First Tableau Extension." Attendees write Lightning Web Components that
run as **Tableau Next dashboard extensions**. Nothing else.

## The two skills that OWN this work

Before writing any code, load and follow these skills (in `.a4drules/skills/`):

1. **`tableau-next-workshop-lwc`** — for anything involving the LWCs
   (`vibeTable`, `vibeInsight`, `vibeAction`), the Tableau Next SDK,
   Apex-backed insights, or Salesforce record actions. The skill ships
   pattern references under `references/` — read the one that matches
   the current build, then author the LWC from the attendee's prompt.

2. **`tableau-next-workshop-sdm-discovery`** — for hard-coded fallback
   builds and SDM diagnostics: finding the SDM, listing fields, mapping
   fuzzy attendee terms ("amount", "account") to real API names, and
   choosing between object-scoped and model-scoped field shapes. The
   default workshop path uses native data binding, so dashboard authors
   map semantic roles after deployment instead of baking API names into JS.

A third skill, **`tableau-semantic-query-api`**, is a helper invoked by
`tableau-next-workshop-lwc` (see its `references/smoke-test-query.md`) to
smoke-test a semantic query over HTTP before Vibes commits to LWC code, and
for post-deploy verification. It's not a top-level skill you load directly —
the LWC skill pulls it in when needed.

**If the user's message mentions any of these terms**, load the skills
FIRST, then act:

- "Tableau Next", "dashboard extension", "extension LWC"
- "vibeTable", "vibeInsight", "vibeAction"
- "analytics__Dashboard", "semantic model", "SDM"
- "top opportunities", "Insight button", "Log a Call", "record action"
- "Build 1", "Build 2", "Build 3"

## Landmines to avoid (the skills fix all of these)

- **Do NOT set the LWC target to `tableau__DashboardExtension`** — that
  target does not exist. The correct value is `<target>analytics__Dashboard</target>`.
- **Do NOT fall back to `lightning__AppPage`** if the analytics target
  errors. That produces an App Builder page, not a Tableau widget.
- **Do NOT use `fetchDataUsingQueryAndSource` just because fields are data
  bound** — data binding supplies the source and field roles; it does not
   require a one-off query. Translate bound properties into
   `registerFieldsForQuery` specs so dashboard filters and parameters flow
   into the runtime-owned query. See the LWC skill's "Critical SDK and UI
   gates" section.
- **Do NOT call `aiplatform.ModelsAPI` from JavaScript.** Always via an
  `@AuraEnabled` Apex method. `RecordInsightGenerator` is the pre-baked,
  pre-deployed workshop head-start class; attendees call it but do not build or
  modify it. Trust Layer routing is mandatory.
- **Do NOT use `NavigationMixin`** for Salesforce navigation from within
  the extension — it silently fails inside `*--analytics.<domain>`. Use
  `window.open` with an origin-rewritten URL.

If you're about to reach for any of the above because "that's how
Lightning normally works" — STOP and read the skill instead. The skill
was written after the workshop team hit each of these traps.

## Repo conventions

- **Per-build LWCs**: `lwc/vibeTable/` → `lwc/vibeInsight/` → `lwc/vibeAction/`.
  Build 1 (`vibeTable`) is scaffolded from scratch. Builds 2 and 3 each
  create a NEW LWC, starting from the attendee's deployed LWC from the
  previous build (in `force-app/main/default/lwc/`) plus the matching
  pattern reference under the skill's `references/`. Do NOT edit a
  single LWC across builds.
- **Deploy scope**: only touch `force-app/main/default/lwc/vibe<Name>/`
  for each build. Never redeploy the whole `force-app` — you'll re-deploy
  the pre-baked Apex class and waste time.
- **Class naming**: PascalCase (`VibeTable`), files camelCase
  (`vibeTable.js`), `<masterLabel>` title-case with space (`Vibe Table`).
- **Native data-binding metadata**: use API version 67.0 and
  role-oriented `SemanticModel`, `SemanticDimension`, and `SemanticMeasure`
  properties under `<targetConfig targets="analytics__Dashboard">`.
- **Binding compatibility**: property names and types are persisted in
  dashboards. Never rename, remove, or repurpose a shipped binding property;
  add a new optional property or a new component bundle instead.

## Attendee UX rule

Every build should feel like the attendee's prompt authored the code.
Do NOT copy a reference verbatim and present it as "here you go." Read
the reference to know what shape works, then generate the file from
the attendee's prompt, matching that shape.

Before Build 1, derive and confirm a semantic role contract from the prompt:
entity labels, property names and types, visible and hidden roles, display
order, formatting, sorting, insight context, and requested interactions.
Builds 2 and 3 inherit that contract unchanged and add only their requested
feature. Opportunity, Account, Amount, and Log a Call are the canonical DF26
worked example, not universal component defaults.

## When in doubt

Read the skill. If the skill contradicts something else you know about
Salesforce, the skill wins. This is a workshop-scoped context.
