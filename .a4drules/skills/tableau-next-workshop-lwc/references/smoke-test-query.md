# Smoke-testing a semantic query

Use the `tableau-semantic-query-api` skill and its gateway script instead of
duplicating a wire payload here. The canonical route is:

```text
POST /services/data/v67.0/semantic-engine/gateway
Content-Type: application/json
Query type: structuredSemanticQuery
Expected success: HTTP 201
```

For hard-coded recovery mode, smoke-test before writing the LWC. For native
data-bound mode, concrete fields are selected after deployment, so run the
same query as post-mapping verification.

The hand-off to `tableau-semantic-query-api` must include:

- Semantic model API name.
- Every dimension as a qualified object field or bare calculated dimension.
- Every measure as a qualified object measure with its aggregation, or a bare
  calculated measurement with no overriding aggregation.
- The same finite row limit used by the component.

A gateway success proves source and field compatibility. It does not prove the
dashboard runtime applies external filters to `registerFieldsForQuery`; verify
that separately in the live dashboard release gate.
