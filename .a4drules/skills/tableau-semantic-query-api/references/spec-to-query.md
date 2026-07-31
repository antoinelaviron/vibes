# Mapping: SDK `registerFieldsForQuery` spec ↔ StructuredSemanticQuery field

The workshop LWC skill's SDK specs and the Semantic Query API's field entries
are two representations of the same query. Use this table to translate between
them.

## Object-scoped dimensions (e.g. `Opportunity.CustomerAccount`)

**SDK spec:**
```javascript
{ model: 'Opportunity.CustomerAccount', rowGrouping: true }
```

**Semantic Query field:**
```json
{
  "expression": { "table_field": { "name": "CustomerAccount", "table_name": "Opportunity" } },
  "grouping": "ROW_GROUPING"
}
```

## Object-scoped raw measures (e.g. `Opportunity.Probability`)

**SDK spec:**
```javascript
{ model: 'Opportunity.Probability', aggregationType: 'SUM' }
```

**Semantic Query field:**
```json
{
  "expression": { "table_field": { "name": "Probability", "table_name": "Opportunity" } },
  "semantic_aggregation_method": "SEMANTIC_AGGREGATION_METHOD_SUM"
}
```

## Model-level calc measures (`*_clc`) with UserAgg

**SDK spec:**
```javascript
{ model: 'Total_Amount_clc', aggregationType: 'USER_AGG' }
```

**Semantic Query field:**
```json
{
  "expression": { "semantic_field": { "name": "Total_Amount_clc" } },
  "semantic_aggregation_method": "SEMANTIC_AGGREGATION_METHOD_USER_AGG"
}
```

**Why not omit `aggregationType`?** The SDK doesn't default to `USER_AGG`
when the property is missing — it applies a different aggregation that
mismatches the SDM's `function: "UserAgg"`, causing HTTP 400 at the semantic
engine. Always pass `aggregationType: 'USER_AGG'` explicitly for these fields.

## Model-level metrics (`*_mtc`)

**SDK spec:**
```javascript
{ model: 'Total_Sales_mtc', aggregationType: 'USER_AGG' }
```

**Semantic Query field:**
```json
{
  "expression": { "semantic_field": { "name": "Total_Sales_mtc" } },
  "semantic_aggregation_method": "SEMANTIC_AGGREGATION_METHOD_AUTO"
}
```

## Model-level calc dimensions (`*_clc` boolean/text)

**SDK spec:**
```javascript
{ model: 'Is_Won_Opportunity_clc', rowGrouping: true }
```

**Semantic Query field:**
```json
{
  "expression": { "semantic_field": { "name": "Is_Won_Opportunity_clc" } },
  "grouping": "ROW_GROUPING"
}
```

## Row shape

Both endpoints return rows as positional arrays matching the order of the
fields in the request. The SDK returns them as `Proxy` tuples; the Semantic
Query API returns them as JSON arrays under `queryResults.queryData.rows[].values`.

The workshop LWC skill's `normalizeRows(rows, specKeys)` helper handles the SDK
side. When smoke-testing via curl, the values are already positional — inspect
directly:

```bash
jq '.queryResults.queryData.rows[0].values' /tmp/response.json
```

The order matches `queryResults.queryMetadata.fields.<name>.placeInOrder`.
