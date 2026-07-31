# Smoke-testing a semantic query before writing LWC code

The Tableau Next SDK's `registerFieldsForQuery` ultimately calls
`POST /services/data/v67.0/ssot/query-sql`. That endpoint fails **HTTP 400
silently** at runtime — the extension shows a spinner forever, the browser
console shows one 400 line and hundreds of noise lines. Not a good debug UX.

**Rule:** for every Build 2+ query, smoke-test the semantic query with `curl`
BEFORE writing the LWC. If 400, iterate on specs. Only write LWC once 200.

## Auth

```bash
export SF_ORG=<alias>
export SF_TOKEN=$(sf org auth show-access-token --target-org $SF_ORG --json | jq -r '.result.accessToken')
export SF_INSTANCE=$(sf org display --target-org $SF_ORG --json | jq -r '.result.instanceUrl')
```

## Payload shape

The `POST /ssot/query-sql` endpoint takes a `StructuredSemanticQuery` body.
Save as `/tmp/smoke-query.json`.

**Every string in `sources[].name` and `fields[].expression.modelField.name`
below is a placeholder. Fill them from your discovery hand-off JSON. Do
NOT copy the tokens verbatim — they will fail on any attendee org.**

```json
{
  "semanticQuery": {
    "sources": [{ "type": "SemanticModel", "name": "<sourceName from discovery hand-off — do NOT use this literal>" }],
    "fields": [
      { "expression": { "modelField": { "name": "<sdo>.<dim-apiName>" } }, "rowGrouping": true },
      { "expression": { "modelField": { "name": "<sdo>.<dim-apiName>" } }, "rowGrouping": true },
      { "expression": { "modelField": { "name": "<calc-measure-apiName>_clc" } } }
    ],
    "options": {
      "limit": 25,
      "orderBy": [
        { "expression": { "modelField": { "name": "<calc-measure-apiName>_clc" } }, "direction": "DESC" }
      ]
    }
  }
}
```

**Note on aggregation:** for `*_clc` and `*_mtc` fields, do NOT emit an
`aggregation` field at all — their aggregation is baked into the expression
(`function: "UserAgg"` in the SDM payload). Adding one causes HTTP 400.

For object-scoped raw measures (e.g. `Opportunity.Probability`), add
`"aggregation": "SUM"` (or the appropriate type).

## Run

```bash
curl -sw "\n%{http_code}\n" -X POST \
  "$SF_INSTANCE/services/data/v67.0/ssot/query-sql?dataspace=default" \
  -H "Authorization: Bearer $SF_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/smoke-query.json
```

## Response interpretation

**HTTP 200:** the response body looks like:

```json
{
  "queryId": "...",
  "data": [ [ ...row1... ], [ ...row2... ] ],
  "metadata": [ { "name": "...", "type": "..." }, ... ],
  "rowCount": 25,
  "done": true
}
```

Confirm `rowCount > 0` and that `metadata` matches your expected fields in
order. If both check out, proceed to write the LWC using the exact same
specs (ordered).

**HTTP 400:** the response body includes an error message. Common causes:

| Error snippet | Cause | Fix |
|---|---|---|
| `Cannot resolve identifier` or `Invalid field` | Field name typo or wrong casing | Re-run SDM discovery |
| `Aggregation not allowed` or `Unexpected aggregation` | `aggregationType` set on a `*_clc` or `*_mtc` field | Remove `aggregation` from that spec |
| `Object <X> does not contain field <Y>` | `*_clc`/`*_mtc` prefixed with an object name | Strip the object prefix; keep the field bare |
| `USER_ILLEGAL_ARGUMENT_INVALID_QUERY` | One of the above, with less detail | Same fixes |

**HTTP 401:** token expired. Refresh via
`sf org auth show-access-token --target-org $SF_ORG --json | jq -r '.result.accessToken'`.

**HTTP 403:** user lacks Data Cloud query permission. Bucket C (org config).

## Why this matters for the workshop

Without smoke-testing:
- Vibes writes LWC → deploys (30-60s) → attendee drops widget → spinner forever.
- Attendee opens DevTools, sees a wall of noise, one 400 line.
- Attendee spends 10 minutes debugging with the presenter's help.
- Room falls behind. Workshop timing collapses.

With smoke-testing:
- Vibes writes specs → smoke-tests → sees 400 → adjusts specs → sees 200.
- Only THEN writes LWC and deploys.
- Widget renders first try.
- Attendee gets the render moment on schedule.

Cost: 2-3 extra `curl` calls per Build 2. Value: catches every semantic-engine
rejection before it becomes a workshop-day incident.
