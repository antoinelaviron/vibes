# Mapping: SDK `registerFieldsForQuery` spec ↔ StructuredSemanticQuery field

The workshop LWC skill's SDK specs and the Semantic Query API's field entries
are two representations of the same query. Use this table to translate between
them.

## Object-scoped dimensions

**SDK spec:**
```javascript
{ model: 'Orders.Region', rowGrouping: true }
```

**Semantic Query field:**
```json
{
  "expression": { "table_field": { "name": "Region", "table_name": "Orders" } },
  "grouping": "ROW_GROUPING"
}
```

## Object-scoped raw measures

**SDK spec:**
```javascript
{ model: 'Orders.Sales', rowGrouping: false, aggregationType: 'SUM' }
```

**Semantic Query field:**
```json
{
  "expression": { "table_field": { "name": "Sales", "table_name": "Orders" } },
  "semantic_aggregation_method": "SEMANTIC_AGGREGATION_METHOD_SUM"
}
```

## Model-level calc measures (`*_clc`) with UserAgg

**SDK spec:**
```javascript
{ model: 'Total_Sales_clc', rowGrouping: false }
```

**Semantic Query field:**
```json
{
  "expression": { "semantic_field": { "name": "Total_Sales_clc" } },
  "semantic_aggregation_method": "SEMANTIC_AGGREGATION_METHOD_USER_AGG"
}
```

The two transports use different aggregation contracts. SDK field registration
omits `aggregationType` so the SDM owns the calculated measurement's
aggregation. The gateway JSON makes `USER_AGG` explicit.

## Model-level metrics (`*_mtc`)

**SDK spec:**
```javascript
{ model: 'Total_Sales_mtc', rowGrouping: false }
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
