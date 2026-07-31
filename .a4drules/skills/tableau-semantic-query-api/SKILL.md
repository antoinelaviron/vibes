---
name: tableau-semantic-query-api
description: |
  Send Semantic Queries to the Tableau Semantics engine and get real query
  results before writing LWC or dashboard code. Use this to SMOKE-TEST a
  query before Vibes commits to a spec — catches HTTP 400s (wrong aggregation,
  bad field qualification, unknown fields) in seconds instead of after a
  60-second deploy + a runtime spinner. Also useful for POST-DEPLOY
  verification and for ad-hoc data exploration.
  Triggers when: Vibes is about to write registerFieldsForQuery, when a
  deployed LWC returns HTTP 400 on /semantic-engine/gateway, when the user
  asks "test this query first", or when validating a semantic model change.
license: Apache-2.0
metadata:
  author: alaviron
  version: workshop-1.0
  api-version: v67.0
---

# tableau-semantic-query-api

Direct access to the Tableau Semantics engine's query gateway. Use this to
**smoke-test a semantic query before committing to it in LWC code**.

## Why this exists

`registerFieldsForQuery` in the Tableau Next SDK ultimately routes to
`POST /services/data/v67.0/semantic-engine/gateway`. The gateway rejects
malformed queries with HTTP 400 — but by then, the LWC has already been
deployed, dropped on a dashboard, and shows a **silent spinner** with the
400 buried in the browser console.

Test the query FIRST. Iterate on the JSON payload with `curl`. Only once it
returns HTTP 201 with real rows, encode the same specs into an LWC.

## The endpoint

```
POST /services/data/v67.0/semantic-engine/gateway
```

**Auth:** standard SF CLI token.

**Success response:** HTTP **201** (not 200 — this endpoint returns 201 on
success).

**Failure response:** HTTP 400 with `errorCode` + `message` in the body.

## Minimum working request

```json
{
  "structuredSemanticQuery": {
    "fields": [
      {
        "expression": { "table_field": { "name": "CustomerAccount", "table_name": "Opportunity" } },
        "grouping": "ROW_GROUPING"
      },
      {
        "expression": { "semantic_field": { "name": "Total_Amount_clc" } },
        "semantic_aggregation_method": "SEMANTIC_AGGREGATION_METHOD_USER_AGG"
      }
    ],
    "options": { "limit_options": { "limit": 5 } }
  },
  "semanticModelId": "2SMfj0000018nFtGAI"
}
```

### Envelope rules (learned the hard way)

- **`structuredSemanticQuery`** is the top-level wrapper. Not `semanticQuery`,
  not `query`, not omitted. Getting this wrong = `JSON_PARSER_ERROR`.
- **`semanticModelId`** is the **record ID** (starts with `2SM…`), NOT the
  apiName. Use `GET /services/data/v66.0/ssot/semantic/models/{apiName}` to
  resolve apiName → id.
- **Alternative to `semanticModelId`**: pass the full `semanticModel` object
  inline. Useful for on-the-fly queries. See references for shape.

### Field expression rules

**Object-scoped raw dimensions/measures** (fields owned by a specific data object):

```json
{
  "expression": { "table_field": { "name": "CustomerAccount", "table_name": "Opportunity" } },
  "grouping": "ROW_GROUPING"
}
```

- Use `table_field` with `name` + `table_name` (the object's `apiName`).
- Add `"grouping": "ROW_GROUPING"` for dimensions you want to group by.
- Do NOT add `semantic_aggregation_method` unless you want to override the field's default.

**Model-level calculated fields** (`*_clc`) and **metrics** (`*_mtc`):

```json
{
  "expression": { "semantic_field": { "name": "Total_Amount_clc" } },
  "semantic_aggregation_method": "SEMANTIC_AGGREGATION_METHOD_USER_AGG"
}
```

- Use `semantic_field` (NOT `table_field`).
- Use `name` only — no `table_name` (they're top-level, not object-scoped).
- Use `SEMANTIC_AGGREGATION_METHOD_USER_AGG` for `*_clc` measures with
  `function: "UserAgg"` (aggregation baked in). Or `SEMANTIC_AGGREGATION_METHOD_AUTO`
  to let the SDM's declared aggregation type apply.

**Never use `SUM`/`AVG`/`MAX` etc. on `*_clc`/`*_mtc` — the aggregation is
already inside the expression. Overriding causes HTTP 400.**

### Common aggregation methods

| Method | When to use |
|---|---|
| `SEMANTIC_AGGREGATION_METHOD_AUTO` | Default — respects the field's declared aggregation type. Safe for most cases. |
| `SEMANTIC_AGGREGATION_METHOD_USER_AGG` | For `*_clc` fields with `function: "UserAgg"` (aggregation already in the expression). |
| `SEMANTIC_AGGREGATION_METHOD_SUM` / `_AVG` / `_MIN` / `_MAX` | Only for raw object-scoped measures where you want a specific aggregation. Never on `*_clc`/`*_mtc`. |
| `SEMANTIC_AGGREGATION_METHOD_NONE` | Detail rows, no aggregation. |

### Sorting

```json
{
  "options": {
    "sort_orders": [
      {
        "simple_sort_order": {
          "sort_by_field": { "semantic_field": { "name": "Total_Amount_clc" } },
          "sorting_order": "DESC"
        }
      }
    ],
    "limit_options": { "limit": 25 }
  }
}
```

## Recommended workflow

**Step 1 — resolve SDM apiName → id (once per session):**

```bash
export SF_ORG=<alias>
export SF_TOKEN=$(sf org auth show-access-token --target-org $SF_ORG --json | jq -r '.result.accessToken')
export SF_INSTANCE=$(sf org display --target-org $SF_ORG --json | jq -r '.result.instanceUrl')

SDM_APINAME="Sales_Cloud_00Dfj00000VRQK1EAP"
SDM_ID=$(curl -s -H "Authorization: Bearer $SF_TOKEN" \
  "$SF_INSTANCE/services/data/v66.0/ssot/semantic/models/$SDM_APINAME" \
  | jq -r '.id')
echo "SDM ID: $SDM_ID"
```

**Step 2 — write query to `/tmp/q.json`, POST, inspect:**

```bash
curl -sw "\nHTTP: %{http_code}\n" -X POST \
  "$SF_INSTANCE/services/data/v67.0/semantic-engine/gateway" \
  -H "Authorization: Bearer $SF_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/q.json | jq '.'
```

**Step 3 — grade the response:**

- `HTTP 201` + `queryData.rows[].values` → the query works, encode into LWC.
- `HTTP 400` → read `message`, adjust payload, retry.

**Step 4 — encode the working query into `registerFieldsForQuery`:**

The SDK's spec array maps to `structuredSemanticQuery.fields[]` — each spec
becomes one field entry. The mapping:

- `table_field` name + `table_name` → SDK spec `model: "TableName.fieldName"`
- `semantic_field` name → SDK spec `model: "fieldName"` (bare)
- `grouping: "ROW_GROUPING"` → SDK spec `rowGrouping: true`
- `semantic_aggregation_method: "..._USER_AGG"` → SDK spec **omits** `aggregationType`

## Response shape

**HTTP 201:**

```json
{
  "queryResults": {
    "queryMetadata": {
      "fields": {
        "CustomerAccount": { "placeInOrder": 0, "type": "VARCHAR" },
        "User agg Total_Amount_clc": { "placeInOrder": 1, "type": "NUMERIC" }
      }
    },
    "queryData": {
      "rows": [
        { "values": ["001fj00001Qeey1AAB", 141990.9] },
        { "values": ["001fj00001Qef2MAAR", 64402.63] }
      ]
    }
  },
  "status": "SUCCESS"
}
```

Notice `values` is a **positional array** matching `placeInOrder`. Same shape
as the SDK's row Proxy tuples — that's why `normalizeRows(rows, specKeys)` in
the LWC skill works.

## Common HTTP 400 causes

| Symptom | Cause | Fix |
|---|---|---|
| `Unrecognized field "semanticQuery"` | Wrong envelope key | Use `structuredSemanticQuery` |
| `Unrecognized field "aggregationType"` | Old-style key | Use `semantic_aggregation_method` |
| `unknown column '<X>'` | Field name typo or wrong casing | Re-check via SDM discovery |
| `table "<X>" does not exist` | Used SDM apiName as table_name | Use the object's apiName (e.g. `Opportunity`, not `Sales_Cloud_…`) |
| `Aggregation not allowed` | Passed `SUM` etc. on a `*_clc`/`*_mtc` | Use `SEMANTIC_AGGREGATION_METHOD_USER_AGG` or omit |
| `Cannot resolve identifier` | Field doesn't exist on this SDM | Check SDM payload via `GET /ssot/semantic/models/{apiName}` |

## Scripts

- `scripts/smoke.sh` — auth + resolve SDM id + POST a query file + pretty-print
  the response.

## Reference files

- `references/query-shapes.md` — full JSON shapes: filters, aggregations,
  totals, sorting, on-the-fly calc fields, relative dates.
- `references/spec-to-query.md` — bidirectional mapping between SDK
  `registerFieldsForQuery` specs and StructuredSemanticQuery `fields[]`.

## Non-goals

- Not for creating SDMs, calc fields, or metrics — use `tableau-semantic-authoring`.
- Not for querying DLOs directly with SQL — use `/ssot/query-sql` with DMO
  table names instead. Different endpoint, different semantics.
- Not for embedding queries in an LWC — this is a smoke-test tool that runs
  from the CLI or Apex, not from browser JS.
