#!/usr/bin/env bash
# Smoke-test a semantic query against a Tableau Next SDM.
#
# Usage:
#   smoke.sh <org-alias> <sdm-api-name> <query.json>
#
# Exit codes:
#   0  → HTTP 201 (query returned rows)
#   1  → HTTP 400 (payload invalid — inspect response for cause)
#   2  → HTTP 401 (token expired — re-auth)
#   3  → HTTP 403 (permission denied)
#   4  → other HTTP status
#   5  → sf CLI or SDM lookup failed

set -euo pipefail

ORG_ALIAS="${1:-}"
SDM_APINAME="${2:-}"
QUERY_FILE="${3:-}"

if [[ -z "$ORG_ALIAS" || -z "$SDM_APINAME" || -z "$QUERY_FILE" ]]; then
  echo "Usage: smoke.sh <org-alias> <sdm-api-name> <query.json>"
  echo ""
  echo "  query.json should contain the 'structuredSemanticQuery' body only."
  echo "  This script wraps it with the correct semanticModelId envelope."
  exit 5
fi

if [[ ! -f "$QUERY_FILE" ]]; then
  echo "Query file not found: $QUERY_FILE"
  exit 5
fi

echo "→ Auth against $ORG_ALIAS"
SF_TOKEN=$(sf org auth show-access-token --target-org "$ORG_ALIAS" --json | jq -r '.result.accessToken')
SF_INSTANCE=$(sf org display --target-org "$ORG_ALIAS" --json | jq -r '.result.instanceUrl')

if [[ -z "$SF_TOKEN" || "$SF_TOKEN" == "null" ]]; then
  echo "  Failed to get access token."
  exit 5
fi

echo "→ Resolve SDM apiName → id"
SDM_ID=$(curl -sS -H "Authorization: Bearer $SF_TOKEN" \
  "$SF_INSTANCE/services/data/v67.0/ssot/semantic/models/$SDM_APINAME" \
  | jq -r '.id')

if [[ -z "$SDM_ID" || "$SDM_ID" == "null" ]]; then
  echo "  SDM '$SDM_APINAME' not found or lookup failed."
  exit 5
fi

echo "  SDM id: $SDM_ID"

# Wrap the user-provided structuredSemanticQuery with semanticModelId.
WRAPPED=$(mktemp -t smoke.XXXXXX.json)
jq --arg id "$SDM_ID" '{structuredSemanticQuery: .structuredSemanticQuery, semanticModelId: $id}' \
  "$QUERY_FILE" > "$WRAPPED"

echo "→ POST /services/data/v67.0/semantic-engine/gateway"
RESPONSE=$(mktemp -t smoke-resp.XXXXXX.json)
HTTP_CODE=$(curl -sS -o "$RESPONSE" -w "%{http_code}" -X POST \
  "$SF_INSTANCE/services/data/v67.0/semantic-engine/gateway" \
  -H "Authorization: Bearer $SF_TOKEN" \
  -H "Content-Type: application/json" \
  -d @"$WRAPPED")

echo "  HTTP $HTTP_CODE"
echo ""

case "$HTTP_CODE" in
  201)
    ROW_COUNT=$(jq '.queryResults.queryData.rows | length' "$RESPONSE")
    echo "✓ SUCCESS — $ROW_COUNT rows returned"
    echo ""
    echo "First 3 rows:"
    jq '.queryResults.queryData.rows[:3]' "$RESPONSE"
    exit 0
    ;;
  400)
    echo "✗ HTTP 400 — payload rejected"
    echo ""
    jq '.' "$RESPONSE"
    exit 1
    ;;
  401)
    echo "✗ HTTP 401 — token expired. Re-auth and retry."
    exit 2
    ;;
  403)
    echo "✗ HTTP 403 — permission denied. Check Data Cloud / Semantics permission set."
    exit 3
    ;;
  *)
    echo "✗ HTTP $HTTP_CODE (unexpected)"
    jq '.' "$RESPONSE" 2>/dev/null || cat "$RESPONSE"
    exit 4
    ;;
esac
