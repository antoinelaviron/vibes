# Smoke-test a semantic query before writing LWC code

Smoke-test every new data-backed query before generating its LWC. This catches
field and aggregation errors before the attendee deploys a tile that can only
show a generic runtime error. The smoke test validates field shape; it does not
prove that `registerFieldsForQuery` uses equivalent server-side ordering.

## Authenticate

```bash
export SF_ORG=<alias>
export SF_TOKEN=$(sf org auth show-access-token --target-org "$SF_ORG" --json | jq -r '.result.accessToken')
export SF_INSTANCE=$(sf org display --target-org "$SF_ORG" --json | jq -r '.result.instanceUrl')
```

## Query Payload

Create `/tmp/smoke-query.json`. Every source, object, and field value must come
from the live discovery hand-off. Use object terminology, not `sdo` placeholders.

```json
{
  "semanticQuery": {
    "sources": [{ "type": "SemanticModel", "name": "<source-name>" }],
    "fields": [
      { "expression": { "modelField": { "name": "<object-api-name>.<dimension-api-name>" } }, "rowGrouping": true },
      { "expression": { "modelField": { "name": "<object-api-name>.<dimension-api-name>" } }, "rowGrouping": true },
      { "expression": { "modelField": { "name": "<calc-measure-api-name>_clc" } } }
    ],
    "options": { "limit": 25 }
  }
}
```

For raw object-scoped measures, add the appropriate aggregation. For model-level
`_clc` and `_mtc` fields, do not add aggregation and do not add an object prefix.

## Run

```bash
curl -sw "\n%{http_code}\n" -X POST \
  "$SF_INSTANCE/services/data/v66.0/ssot/query-sql?dataspace=default" \
  -H "Authorization: Bearer $SF_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/smoke-query.json
```

On HTTP 200, confirm the returned metadata order matches the LWC `IDX` map and
the query grain. The response proves the field mapping is valid. It does not
prove global top-N ordering, so keep component copy bounded to returned rows.

On HTTP 400, rerun discovery for invalid fields, remove aggregation from
model-level calculations, or qualify a raw field as `Object.field`. On HTTP 401,
refresh the token; on HTTP 403, treat missing Data Cloud permission as an org
configuration issue.
