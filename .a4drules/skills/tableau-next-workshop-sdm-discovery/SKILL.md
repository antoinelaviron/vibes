---
name: tableau-next-workshop-sdm-discovery
description: |
  Discover the Tableau Next Semantic Data Model in the attendee's workshop
  org and map attendee-provided fuzzy field names ("amount", "account",
  "stage") to real API names. Confirms the mapping with the attendee before
  handing back to tableau-next-workshop-lwc for SDK pipeline code generation.
  Triggers when tableau-next-workshop-lwc calls for field discovery, OR when
  the user asks what fields are in the SDM, OR when Vibes is about to write
  a fetchDataUsingQueryAndSource query but doesn't have field API names yet.
  Read-only. Do NOT use to create calculated fields or metrics.
license: Apache-2.0
metadata:
  author: alaviron
  version: workshop-2.4
  api_version: v66.0
---

# tableau-next-workshop-sdm-discovery

## Workflow when invoked

Every value in the hand-off JSON (see Step 8) MUST come from a live REST
call against the attendee's org in this session. Nothing in this file is a
substitute for that call.

1. **Discover the org yourself — do NOT ask the attendee for it.** Vibes
   is authorized against exactly one org for this workshop, and that
   org's username is available from the Salesforce DX MCP server. Call
   `mcp__salesforce_dx__get_username` (returns the default target-org
   username) and use that value as `<username>` in the two REST calls
   below. If the MCP tool is unavailable in this session, fall back to
   `sf config get target-org --json` and read `.result[0].value`.
   Only ask the attendee if BOTH paths fail — and phrase it as
   "which org are you logged into?", not "what's your org alias?".
2. **List the org's SDMs.** Run:
   ```
   sf api request rest /services/data/v66.0/ssot/semantic/models --target-org <username>
   ```
   If it fails (non-2xx, empty result), STOP. See "Fail-loud gate" below.
3. Confirm the SDM choice with the attendee.
   - 1 SDM → use it silently.
   - >1 → present them, ask which.
4. **Dump the chosen SDM.** Run:
   ```
   sf api request rest /services/data/v66.0/ssot/semantic/models/<apiName> --target-org <username> > /tmp/sdm.json
   ```
   If it fails, STOP.
5. **Extract the field lists you need for mapping.** The raw response is
   many KB of nested JSON with fields hidden 3 levels deep — do NOT probe
   its structure by hand. Run this exact command (works everywhere `python3`
   is on PATH, including Code Builder — no `jq` needed):
   ```
   python3 -c "
   import json
   sdm = json.load(open('/tmp/sdm.json'))
   print('=== SDM:', sdm['apiName'], '(dataspace:', sdm.get('dataspace','default'), ') ===\n')
   print('=== Objects and their object-scoped fields ===')
   for obj in sdm.get('semanticDataObjects', []):
       print(f'\n{obj[\"apiName\"]} (label: {obj.get(\"label\",\"\")}):')
       for d in obj.get('semanticDimensions', []):
           if d.get('isVisible', True):
               print(f'  dim  : {d[\"apiName\"]:<40} ({d.get(\"dataType\",\"?\")})  {d.get(\"label\",\"\")}')
       for m in obj.get('semanticMeasurements', []):
           if m.get('isVisible', True):
               print(f'  meas : {m[\"apiName\"]:<40} ({m.get(\"dataType\",\"?\")})  {m.get(\"label\",\"\")}')
   print('\n=== Model-level calc measures (bare apiName, no table_name) ===')
   for c in sdm.get('semanticCalculatedMeasurements', []):
       if c.get('isVisible', True):
           print(f'  {c[\"apiName\"]:<50}  {c.get(\"label\",\"\")}')
   print('\n=== Model-level calc dimensions (bare apiName, no table_name) ===')
   for c in sdm.get('semanticCalculatedDimensions', []):
       if c.get('isVisible', True):
           print(f'  {c[\"apiName\"]:<50}  {c.get(\"label\",\"\")}')
   print('\n=== Model-level metrics (bare apiName) ===')
   for m in sdm.get('semanticMetrics', []):
       print(f'  {m[\"apiName\"]:<50}  {m.get(\"label\",\"\")}')
   print('\n=== Relationships (which objects join to which) ===')
   for r in sdm.get('relationships', []) + sdm.get('semanticRelationships', []):
       print(f'  {r}')
   "
   ```
   The output is your source of truth for the mapping. Do NOT parse
   `/tmp/sdm.json` any other way.
6. Map the attendee's fuzzy field names against that extract output.
   `references/field-mapping-table.md` is a **hint fallback only** — never
   a substitute for the live extract. Every apiName you propose must
   appear verbatim in the extract from Step 5.
7. Present the mapping to the attendee, wait for a "yes", then emit the
   hand-off JSON (schema in "Step 8: hand back to the LWC skill" below)
   with values from the extract.

## Fail-loud gate

If either `sf api request rest` call fails (non-2xx, empty result set, or
network error): **STOP.** Do not substitute example values from this file
or `references/`. Do not invent auth workarounds (no `curl`, no direct
token fetches, no SOQL fallbacks, no "Option A/B/C" menus back to the
attendee). Report the raw error to the attendee verbatim, wait for them
to fix org auth, then re-invoke this skill.

## Critical gates

1. **No SDK code without confirmed mapping.** Do NOT return the field
   spec to the LWC skill until the attendee has seen the proposed mapping
   and typed "yes" (or a change request). This is the only "don't create
   calc fields / don't author" rule in this skill — it appears once, on
   purpose.

2. **`_clc` / `_mtc` fields are model-scoped.** They are NOT addressable
   as `table_field` inside a specific object. In the wire query, they use
   `semantic_field: { name }` with **no `table_name`**, and their alias is
   the bare field name (no dotted prefix).

3. **Raw table fields need `table_name`.** In the wire query they use
   `table_field: { name, table_name }`, alias `${table_name}.${name}`.

4. **Cross-table joins ARE OK when the SDM has a relationship.** Build 1
   of this workshop displays `Account.Account_Name` alongside
   `Opportunity.*` — it works because the SDM defines the join. Don't
   assume all joins work — verify against `/tmp/sdm.json`'s objects and
   relationships before promising a field to the LWC skill.

## SDM JSON shape reference

The `/tmp/sdm.json` payload is deep and inconsistently keyed. Skimming it
by hand wastes turns. Use the extractor in Step 5. If you must inspect
the raw file, this is the shape (workshop-org verified, 2026-07):

```
{
  "apiName": "<sourceName>",
  "label": "...",
  "dataspace": "default",

  // Objects and their fields — nested two levels deep.
  "semanticDataObjects": [
    {
      "apiName": "Opportunity",          // ← this is the table_name
      "label": "Opportunity",
      "semanticDimensions":   [ { "apiName": "Opportunity_Stage", "dataType": "Text", "isVisible": true, ... }, ... ],
      "semanticMeasurements": [ { "apiName": "Probability",       "dataType": "Number", ... }, ... ]
    },
    { "apiName": "Account",   "semanticDimensions": [ { "apiName": "Account_Name", ... } ], ... },
    ...
  ],

  // Model-level fields — bare apiName in queries, no table_name.
  "semanticCalculatedMeasurements": [ { "apiName": "Total_Amount_clc", "label": "Total Amount", ... }, ... ],
  "semanticCalculatedDimensions":   [ { "apiName": "Deal_Size_Bucket_clc", ... }, ... ],
  "semanticMetrics":                [ { "apiName": "Total_Sales_mtc", "label": "Total Sales", ... }, ... ]
}
```

Rules of thumb:

- **Object-scoped fields live at `semanticDataObjects[i].semanticDimensions[j].apiName`** — three levels deep. They are NOT at a top-level `dataObjects` or `fields` key. Those keys do not exist.
- **Model-level fields (`_clc` / `_mtc`) live at top-level `semanticCalculatedMeasurements[]`, `semanticCalculatedDimensions[]`, `semanticMetrics[]`.** Not under any object.
- **`isVisible: false`** appears on internal-only fields (e.g. sort keys). Skip them when proposing to the attendee — they'd never ask for them by fuzzy name.
- **`label`** is the human-readable name (matches SDM authoring UI). Use it to match attendee terms. `apiName` is what goes into the wire query.

## Step 8: hand back to the LWC skill

**Every value below MUST come from `/tmp/sdm.json` for the attendee's org.
If you are copying any string from this file into the JSON, you are doing
it wrong.**

```json
{
  "sourceName": "<apiName from `sf api request rest /services/data/v66.0/ssot/semantic/models` — do NOT copy from this file>",
  "fields": [
    { "key": "<local key>",   "role": "dim",     "apiName": "<from /tmp/sdm.json>", "tableName": "<object apiName from /tmp/sdm.json>" },
    { "key": "<local key>",   "role": "measure", "apiName": "<from /tmp/sdm.json>", "isCalc": true }
  ],
  "limit": 25
}
```

Rules for populating the JSON:

- `sourceName` = the SDM's `apiName` field from the list-SDMs response.
- Object-scoped dimension/raw measure → `apiName` + `tableName` (both from
  `/tmp/sdm.json`'s `semanticDataObjects[]`), `isCalc` omitted.
- Model-level calc measure (`*_clc`) → `apiName` only, `isCalc: true`,
  `tableName` omitted.
- Model-level metric (`*_mtc`) → `apiName` only, `isCalc: true`,
  `tableName` omitted. Prefer the underlying `_clc` — `_mtc` often fails
  to resolve from LWC extensions.

**Field metadata rule** (HAR-verified against `tmp-df26-workshop`,
2026-07-10):

| Field kind | `isCalc` | `tableName` | Wire expression | `rowGrouping` |
|---|---|---|---|---|
| Object-scoped dimension | omit | required | `table_field: { name, table_name }` | `true` |
| Object-scoped raw measure | omit | required | `table_field: { name, table_name }` | `false` |
| Model-level calc measure (`*_clc`) | `true` | omit | `semantic_field: { name }` | `false` |
| Model-level metric (`*_mtc`) | `true` | omit | `semantic_field: { name }` — prefer the underlying `_clc`; `_mtc` often fails to resolve from LWC extensions | `false` |

**NO `aggregationType` or `semanticAggregationMethod` on any field** —
aggregation lives in the SDM.

**Wire-format reminder:** `expression` internals are snake_case
(`table_field`, `table_name`, `semantic_field`); query-level keys are
camelCase (`rowGrouping`, `limitOptions`). See the workshop LWC skill's
Build 1 section for the full canonical query shape.

## Presenting the mapping (Step 7 detail)

Format:

```
Semantic model: <apiName from Step 2 response>

Field mapping (all apiNames verified against /tmp/sdm.json):
  - <fuzzy term>  → <table>.<apiName>   (<role>, <dataType>)
  - <fuzzy term>  → <apiName_clc>       (calc measure, BARE)
  ...

Confirm before I generate the query? (yes / change X to Y)
```

Do NOT proceed until the attendee types "yes". If they say "change amount
to Total_Sales_mtc", update, re-verify against `/tmp/sdm.json`, re-present.

## Build-specific field additions

Builds 1, 2, and 3 all use the same set of dimensions + one calc measure
from the SDM. Do NOT add or remove fields between builds — the LWC
starter for each next build already expects the shape returned in Step 8.

Build 3 also uses a hidden `accountId` in the LWC (for the Log a Call
URL). That comes from an Opportunity field that IS the Account record ID
in the SDM (name varies by org — check `/tmp/sdm.json`). The LWC skill's
Build 3 starter includes the placeholder for it; you do NOT add
`accountId` to the field spec here unless the starter is missing it.

## Files in this skill

```
.a4drules/skills/tableau-next-workshop-sdm-discovery/
├── SKILL.md                     ← this file
├── README.md                    ← short overview
└── references/
    └── field-mapping-table.md   ← hint fallback ONLY; verify every entry against /tmp/sdm.json
```
