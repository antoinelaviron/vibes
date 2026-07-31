# tableau-semantic-query-api

Direct-access skill for the Tableau Semantics query gateway
(`POST /services/data/v67.0/semantic-engine/gateway`).

**Primary use case:** smoke-test a semantic query before Vibes commits to a
`registerFieldsForQuery` spec — catches HTTP 400s (wrong aggregation, bad
field qualification, unknown fields) in seconds instead of after a 60-second
deploy cycle.

See [SKILL.md](SKILL.md) for the full API surface and rules.

## Quick smoke test

```bash
export SF_ORG=tmp-df26-workshop
./scripts/smoke.sh $SF_ORG Sales_Cloud_00Dfj00000VRQK1EAP /tmp/q.json
```

Exit code 0 = query works, encode into LWC. Non-zero = HTTP 400, iterate.
