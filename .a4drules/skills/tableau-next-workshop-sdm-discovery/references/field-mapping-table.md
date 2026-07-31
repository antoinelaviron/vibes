# Field mapping — hint fallback ONLY

> **This is a hint fallback. Every value below MUST be verified against
> `/tmp/sdm.json` from a live discovery run against the attendee's org.
> Never hand these values back to the LWC skill without verification.**
> Attendee orgs are provisioned from the workshop template but the SDM's
> apiName is org-specific, and field naming can drift. If a term below
> doesn't appear verbatim in `/tmp/sdm.json`, treat it as absent.

Fuzzy attendee terms → likely API names in a Sales-Cloud-flavored SDM.
Use as a first-pass hint; then confirm each proposal against
`/tmp/sdm.json`. If the term isn't listed, substring-match across the
SDM's field names and labels.

**Reminder on bare vs qualified names:**
- Object-scoped fields (dimensions on `Opportunity`, `Account`, `Case_*`):
  always dotted (`Opportunity.Close_Date`).
- `*_clc` calc measures / calc dims and `*_mtc` metrics: always bare
  (`Total_Amount_clc`, `Total_Sales_mtc`).

## Common dimensions

| Attendee says | Likely apiName (verify!) | Alternatives |
|---|---|---|
| opportunity, opp id | `Opportunity.Opportunity_Id` (Text — record ID) | — |
| account | `Account.Account_Name` (Text — via SDM join to Account) | `Opportunity.CustomerAccount` if the SDM's Opportunity↔Account join isn't defined; that field IS the account record ID despite the name |
| account id (hidden, for Log a Call URL) | `Opportunity.CustomerAccount` (Text — the Account record ID) | Do NOT try `Account.Account_Id` — it does not resolve reliably against Opportunity in the workshop template SDM |
| account type | `Account.Account_Type` (Text) | — |
| industry | `Account.Primary_Industry` (Text) | — |
| stage | `Opportunity.Opportunity_Stage` (Text) | — |
| close date, date | `Opportunity.Close_Date` (DateTime) | `Opportunity.Created_Date` if attendee says "created" |
| type | `Opportunity.Opportunity_Type` (Text) | — |
| owner | `Opportunity.OwnerUser` (Text) | — |
| case type | `Case_Cloud_Kicks.Case_Type` (Text) | — |
| case priority | `Case_Cloud_Kicks.Case_Priority` (Text) | — |
| case status | `Case_Cloud_Kicks.Case_Status` (Text) | — |
| case origin | `Case_Cloud_Kicks.Case_Origin` (Text) | — |

## Common calc measures (`_clc` — bare)

| Attendee says | Likely apiName (verify!) | Alternatives |
|---|---|---|
| amount, revenue, sales | `Total_Amount_clc` | `Total_Sales_clc`, `Weighted_Pipeline_Value_clc` |
| deal size | `Avg_Deal_Size_clc` | `Avg_Deal_Size_Won_clc` |
| pipeline | `Pipeline_Generation_clc` | `Weighted_Pipeline_Value_clc`, `Pipeline_Coverage_clc` |
| # of opportunities, count | `Number_of_Opportunities_clc` | `Number_of_Open_Opportunities_clc`, `Number_of_Won_Opportunities_clc` |
| # of closed | `Number_of_Closed_Opportunities_clc` | — |
| win rate | `Win_Rate_clc` | (or metric `Win_Rate_mtc`) |
| conversion rate | `Conversion_Rate_clc` | — |
| sales cycle | `Sales_Cycle_clc` | `Sales_Cycle_Won_clc` |
| CSAT | `Customer_Satisfaction_Score_clc` | — |
| NPS | `Average_Net_Promoter_Score_clc` | — |
| cases | `Total_Cases_clc` | `Open_Cases_clc`, `Closed_Cases_clc`, `Escalated_Cases_clc` |
| resolution time | `Resolution_Time_clc` | — |

## Metrics (`_mtc` — bare, top-level) — last-resort fallback

Metrics are semantic-layer KPIs designed for dashboard widgets. **Prefer
the underlying `_clc` — `_mtc` often fails to resolve from LWC extensions.**
Use these only if the attendee explicitly asks for a metric AND the `_clc`
alternative doesn't exist in `/tmp/sdm.json`.

| Attendee says | Likely apiName (verify!) |
|---|---|
| total sales metric | `Total_Sales_mtc` (label "Total Sales") |
| win rate metric | `Win_Rate_mtc` (label "Win Rate") |
| avg deal size metric | `Avg_Deal_Size_Won_mtc` (label "Avg Deal Size (Won)") |
| pipeline metric | `Pipeline_Generation_mtc` (label "Pipeline Generation") |
| # of opps metric | look up under `metrics[]` in `/tmp/sdm.json` — the workshop template's apiName has been observed as `of_Opportunities_mtc` (leading `#` stripped by the platform) but this varies; DO NOT hardcode |
| open opps metric | look up under `metrics[]` — the workshop template's apiName has been observed as `Open_Opportunities` (no `_mtc` suffix, unlike its siblings); verify |
| CSAT metric | `Customer_Satisfaction_mtc` (label "Average CSAT") |
| NPS metric | `Net_Promoter_Score_mtc` (label "Average NPS") |
| resolution time metric | `Resolution_Time_mtc` (label "Resolution Time") |

## Common dim-flags (calc — bare)

| Attendee says | Likely apiName (verify!) |
|---|---|
| closed | `Opportunity_Status_clc` (dim) |
| won | `Is_Won_Opportunity_clc` (Boolean) |
| open | `Is_Open_Opportunity_clc` (Boolean) |
| deal size bucket | `Deal_Size_Bucket_clc` |
| days to close | `Days_to_Close_clc` |
| current year | `Is_Current_Year_clc` |

## Fallback rule

If the attendee's term doesn't match any row above, do a substring match
against `/tmp/sdm.json`:

1. Against `metrics[].label` (case-insensitive)
2. Against `metrics[].apiName`
3. Against `calculatedMeasures[].fieldName`
4. Against `objects[].dimensions[].fieldName` (per object)

Present the top 2-3 candidates to the attendee. If nothing matches, say
"No field matches '<term>' in this SDM. Available fields include: <top 10
apiNames from /tmp/sdm.json>."
