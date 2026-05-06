---
mentions:
  - km
id: "@km/tribe/polish-v2"
aliases:
  - km-tribe.polish-v2
  - km-tribe-polish-v2
created_by: Bjørn Stabell
created_at: 2026-04-19T17:55:28Z
closed_at: 2026-04-20T18:46:27Z
close_reason: Most items dissolve under the simpler model
  (hub/km/design/tribe-matrix.md). Any residual polish becomes specific bugs as
  they surface.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.polish-v2
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-19T10:55:28Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] tribe: pro-review polish sweep — docs, shape, naming consistency @km/tribe #task #P4

blocks:: [[@km/tribe]]

Pro review 2026-04-19 P2 residuals after the bigger fixes land:

- P2.3: tribe.join schema is inconsistent across code (role enum) / docs (permitted values) / tools-list (exposed role param). Pick one.
- P2.5: Some 'source of truth' choices still unclear in code shape — e.g., which module owns session recovery? which owns chief derivation? Directory structure + re-exports don't tell a clear story. Document or reorganize.

Effort: ~2-4 hours once the structural beads land. Do last.

