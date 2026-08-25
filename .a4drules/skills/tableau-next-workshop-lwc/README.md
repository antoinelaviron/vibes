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

**Not for production use.** For real Tableau Next LWC work, use the canonical
`tableau-next-custom-lwc` skill at `alaviron/tableau-skills`.

See [SKILL.md](SKILL.md) for the full skill spec.
