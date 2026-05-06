---
mentions:
  - km
id: "@km/all/substrate-phasing-convention"
aliases:
  - km-all.substrate-phasing-convention
  - km-all-substrate-phasing-convention
created_by: claude:cc081a9a
created_at: 2026-04-27T15:34:13Z
closed_at: 2026-04-27T18:16:26Z
close_reason: "Documented in /refactor SKILL.md (commit pending). Convention:
  file BOTH substrate bead AND cleanup bead at planning time; substrate
  /complete criteria includes 'L5 cleanup bead exists in open state, blocked by
  this'. Acceptance: skill section added at .claude/skills/refactor/SKILL.md
  before Tribe Coordination section."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.substrate-phasing-convention
    depends_on_id: km-all.plateau-90
    type: parent-child
    created_at: 2026-04-27T11:00:55Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.plateau-90
---

# [x] Substrate-phasing convention: file L5 cleanup bead at the same time as L4 substrate @km/all #task #P2

blocks:: [[@km/all/plateau-90]]

Plateau-90 epic phased C1, C2, C3a as 'Phase 1 substrate, Phase 2/3 in notes'. Result: each substrate bead closed at L4 with workaround fossils still in code as planned residue. The cleanup beads (@km/silvery/lifecycle-leak-detection-fossil, @km/silvery/paint-clear-l5-final) were filed AFTER the substrate shipped, when residue was rediscovered during /complete. Convention to encode in /refactor and /pm skills: when planning a substrate-then-cleanup migration, file BOTH beads at planning time. Substrate bead /complete criterion includes: 'L5 cleanup bead exists in open state, blocked by this'. This makes L4-but-not-L5 fossils tracked from day 0 instead of surface-of-discovery. Touches: /refactor SKILL.md, /pm SKILL.md, .claude/skills/refactor/migrate.md. Acceptance: skills updated; convention applied retroactively to plateau-90 follow-on beads (already done — feedback-trace-v31-integration, lifecycle-leak-detection-fossil, paint-clear-l5-final exist).

