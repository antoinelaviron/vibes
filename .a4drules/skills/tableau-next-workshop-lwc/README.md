# tableau-next-workshop-lwc

Attendee-facing skill for the DF26 vibe-coding workshop.

Three core builds, one LWC each: `vibeTable` -> `vibeInsight` -> `vibeAction`.
Native Tableau Next data binding is the default; hard-coded SDM fields remain
available as the basic/recovery path.

Each build uses a new bundle so attendees can validate it immediately instead
of waiting about two minutes for a redeployed LWC to leave the dashboard cache.

The skill derives each component's semantic roles, visible fields, labels,
formatting, insight payload, and Salesforce action from the attendee's prompt.
The Top Opportunities scenario is a worked example, not a fixed schema.
`RecordInsightGenerator` is supplied as pre-baked workshop infrastructure;
attendees call it from Build 2 but do not write or deploy Apex.

## Validated native-binding foundation

The native-binding lifecycle in this skill was validated end to end in
a test org. Fourteen data-binding workshop bundles passed their unit tests,
deployed together successfully, and were then tested successfully in live
Tableau Next dashboards on August 31, 2026.

The validated default is intentionally small:

1. Each `@api` setter schedules one startup microtask.
2. Startup runs once after the component is connected and all required roles
   are mapped.
3. The query places dimensions before measures and uses uppercase SDK
   aggregation enums.
4. The component subscribes to `dataUpdate` before
   `registerFieldsForQuery` and accepts direct or wrapped row payloads.
5. An eight-second watchdog prevents an indefinite loading state.
6. Materially changed mappings require the dashboard runtime to remount the
   component.

Query limit and display limit are separate generation choices. The validated
table-derived examples request up to 5,000 rows, sort the returned set locally,
and render every returned row. They do not use `slice()` or a separate display
limit. This improves coverage but does not claim a global top-N when more rows
match than the query limit.

When a showcase combines Build 2 and Build 3 behavior, expose one
`Insights & Actions` view rather than separate duplicate Insight and Action
tabs. Keep both row controls in that view and preserve the insight-panel focus
contract.

Do not add source hydration, `renderedCallback` query synchronization, binding
signatures, or in-place re-registration to the default pattern. Those
mechanisms caused a live host-spinner failure in the earlier implementation and
are unnecessary for the validated contract.

Optional routes cover D3 visualizations, local search, Kanban, themes, and a
media-only video tile. `SKILL.md` routes each request to focused
references, including D3, video, and test contracts. For every data-backed
component, `references/sdk-query-lifecycle.md` and
`references/sdm-data-binding.md` express the same August 31 live-gated
lifecycle contract.

See [SKILL.md](SKILL.md) for the full skill spec.

Created by Antoine Laviron. Built on Salesforce's
[dashboard extension development guide](https://developer.salesforce.com/docs/analytics/tableau-next-isv-dev/guide/tn-development-dashboard-extensions.html),
published August 31, 2026.
