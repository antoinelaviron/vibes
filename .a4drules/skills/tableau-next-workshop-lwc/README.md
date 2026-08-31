# tableau-next-workshop-lwc

Fork of `tableau-next-custom-lwc`, narrowed for the DF26 vibe-coding workshop.
Three builds, one LWC each: `vibeTable` → `vibeInsight` → `vibeAction`.
Native Tableau Next data binding is the default; hard-coded SDM fields remain
available as the basic/recovery path.

The skill derives each component's semantic roles, visible fields, labels,
formatting, insight payload, and Salesforce action from the attendee's prompt.
The Top Opportunities scenario is a worked example, not a fixed schema.
`RecordInsightGenerator` is supplied as pre-baked workshop infrastructure;
attendees call it from Build 2 but do not write or deploy Apex.

## Validated native-binding foundation

The native-binding lifecycle in this skill was validated end to end in
`26213playground`. Fourteen data-binding workshop bundles passed their unit
tests, deployed together successfully, and were then tested successfully in
live Tableau Next dashboards on August 31, 2026.

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

**Not for production use.** For real Tableau Next LWC work, use the canonical
`tableau-next-custom-lwc` skill at `alaviron/tableau-skills`.

See [SKILL.md](SKILL.md) for the full skill spec.
