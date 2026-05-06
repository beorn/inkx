---
mentions:
  - km
  - claude
id: "@km/beads/cutover"
aliases:
  - km-beads.cutover
  - km-beads-cutover
created_by: claude:da9990c5
created_at: 2026-04-27T22:03:05Z
closeReason: "Phase A+B+C complete: bd→km bd skill rewrite (e39e49710), Go bd
  archived, .beads/ deleted (77f9e2bd9), 4754 beads migrated into root @km/
  scope. .gitignore adjusted to allow imports/km-bd-cutover-*. km bd is sole
  tracker; live data at @km/<scope>/<slug>.md + mem/<key>.md."
started_at: 2026-04-27T22:03:34Z
owner: bjorn@stabell.org
assignee: claude:da9990c5
dependencies:
  - issue_id: km-beads.cutover
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-27T15:03:33Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-beads
---

# [x] km bd cutover — fix migrate parser, validate dry-run on full issues.jsonl @km/beads #task #P1 @claude:da9990c5

blocks:: [[@km/beads]]

Replace bd with km bd. Steps: (1) Dolt healthy [done]. (2) Fix km bd migrate parser — currently reports 4634 malformed lines on real issues.jsonl despite valid JSON. (3) Migrate tagged subset (open,in_progress) into tasks/ as proof. (4) Eventually: bd remember equivalent, /pm rewrite, hook updates.

