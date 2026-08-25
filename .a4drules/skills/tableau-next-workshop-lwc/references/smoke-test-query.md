# Smoke-test a prompt-derived semantic query

Use the `tableau-semantic-query-api` skill to translate the confirmed role
mapping into a `structuredSemanticQuery`, then run its gateway script. For
hard-coded recovery, do this before LWC generation. For native binding, do it
after the dashboard author maps every semantic role.

## Contents

- [Role handoff](#role-handoff)
- [Translate roles to gateway fields](#translate-roles-to-gateway-fields)
- [Run the smoke script](#run-the-smoke-script)
- [Preflight checks](#preflight-checks)
- [Response checks](#response-checks)

## Role handoff

Start from the same canonical handoff consumed by the recovery LWC:

```json
{
  "sourceName": "verified model API name",
  "limit": 25,
  "roles": [
    {
      "key": "recordNumber",
      "kind": "dimension",
      "model": "Object.Verified_Number",
      "visible": true
    },
    {
      "key": "ageDays",
      "kind": "measure",
      "model": "Object.Verified_Age",
      "aggregationType": "Max",
      "visible": true
    }
  ],
  "displayOrder": ["recordNumber", "ageDays"],
  "identityRoleKey": "recordNumber",
  "actionTargetRoleKey": null
}
```

The values show structure only. Use the live mapped model and fields.

## Translate roles to gateway fields

Read `../tableau-semantic-query-api/references/spec-to-query.md` and preserve
the role order used by the LWC: every dimension first, then every measure.

| Role model | Gateway expression | Other keys |
|---|---|---|
| Qualified dimension `Object.field` | `table_field: { name: "field", table_name: "Object" }` | `grouping: "ROW_GROUPING"` |
| Bare calculated dimension | `semantic_field: { name: "field" }` | `grouping: "ROW_GROUPING"` |
| Qualified raw measure | `table_field: { name: "field", table_name: "Object" }` | `semantic_aggregation_method` matching the verified aggregation |
| Bare calculated measurement | `semantic_field: { name: "field" }` | `semantic_aggregation_method: "SEMANTIC_AGGREGATION_METHOD_USER_AGG"` |
| Bare metric | `semantic_field: { name: "field" }` | `semantic_aggregation_method: "SEMANTIC_AGGREGATION_METHOD_AUTO"` |

Write a temporary query file shaped like:

```json
{
  "structuredSemanticQuery": {
    "fields": [
      {
        "expression": {
          "table_field": {
            "name": "<verified dimension field>",
            "table_name": "<verified object>"
          }
        },
        "grouping": "ROW_GROUPING"
      },
      {
        "expression": {
          "table_field": {
            "name": "<verified raw measure>",
            "table_name": "<verified object>"
          }
        },
        "semantic_aggregation_method": "SEMANTIC_AGGREGATION_METHOD_MAX"
      }
    ],
    "options": {
      "limit_options": {
        "limit": 25
      }
    }
  }
}
```

Use the exact query schema produced by `tableau-semantic-query-api`; the block
above illustrates role translation and is not a field source.

## Run the smoke script

```bash
.a4drules/skills/tableau-semantic-query-api/scripts/smoke.sh \
  <org-alias> <sdm-api-name> /tmp/query.json
```

The script expects the query file to contain the
`structuredSemanticQuery` body and resolves the model ID itself.

## Preflight checks

1. Every role maps to a field present in the selected model.
2. Object fields use `Object.field`; model-level calculated fields remain bare.
3. Every dimension precedes every measure.
4. Qualified raw measures include the confirmed aggregation.
5. Bare calculated measurements omit aggregation in the LWC spec but translate
   to gateway `USER_AGG`.
6. The query limit matches the generated component.
7. Expected returned column count equals role count.
8. The identity role or deterministic composite is present.
9. An action target is a dimension and does not change the intended row grain.

## Response checks

HTTP 201 proves that the source and field query is accepted. Also verify:

- Returned metadata and positional values follow the ordered roles.
- An empty result is valid for the current filters rather than a mapping error.
- Representative values match each role's expected value kind.
- Salesforce action values are string IDs and match a confirmed prefix only
  when the target object has one.
- When Build 3 adds an action target, row count and grouping match Build 2.

Gateway success does not prove dashboard filters flow into
`registerFieldsForQuery`. Apply one relevant external filter separately in the
live dashboard release gate.
