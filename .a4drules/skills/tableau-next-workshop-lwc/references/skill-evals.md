# skill-evals - Focused authoring checks

These are maintainer review cases for this production-impact skill. They are
documentation-level checks rather than a full local eval runner because the
starter repository is a workshop template, not an agent-evaluation package.

| Case | Prompt shape | Required evidence | Forbidden output |
| --- | --- | --- | --- |
| Build 1 | Create `vibeTable` after a confirmed live hand-off. | `analytics__Dashboard`, discovery values, dimensions before measures, canonical lifecycle, visible bounded result copy. | Static example source name, `fetchDataUsingQueryAndSource`, explicit `fetchData()`, `<property name="sdk">`, `SDO_`. |
| Build 2 | Create `vibeInsight` from an existing `vibeTable`. | Reads prior bundle and Apex signature; uses request token, panel swap, Back focus, and trigger restoration. | Browser Models API call, modal/fixed overlay, stale async state. |
| Build 3 | Create `vibeAction` from `vibeInsight`. | Hidden Account ID dimension before measures; valid-ID and origin validation; encoded `Global.LogACall` URL. | `NavigationMixin`, numeric measure as record ID, always-enabled invalid action. |
| Chord | Create a Type-to-Stage chord chart. | Shared SDK/D3 lifecycle, `typeValues.length` offset, symmetric matrix, textual Type/Stage semantics. | `stageValues.length` offset, one-sided matrix, color-only category distinction. |
| Video | Create a media-only `vibeVideo` tile. | No SDK/discovery/Apex, strict URL policy, blocked-autoplay recovery. | Generic `?v=` detection, unsafe native URL assignment, swallowed play rejection. |
| Negative trigger | Create a generic Record Page LWC or Tableau Cloud `.trex` extension. | Does not use this workshop skill. | `analytics__Dashboard` workshop pipeline. |

Review every generated bundle against two to five relevant required and forbidden
tokens above. Pair static checks with the workshop-time verification in
`test-contract.md`; static checks cannot prove a live dashboard query.
