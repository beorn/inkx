---
mentions:
  - km
id: "@km/infra/tdd-real-data-first"
aliases:
  - km-infra.tdd-real-data-first
  - km-infra-tdd-real-data-first
created_by: claude:8b5b9e1c
created_at: 2026-04-20T20:18:46Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.tdd-real-data-first
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-20T13:18:54Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [ ] /tdd skill: require real-vault repro step 0 for bugs reported on real data @km/infra #task #P2

blocks:: [[@km/infra]]

Why-3 from column-top-disappears retro: /tdd allowed synthetic-only fixtures, missed user-visible bug. Update .claude/skills/tdd/SKILL.md to require TTY repro against real data + screenshot as the FIRST step when bug was reported on real data. Make it a blocker, not a suggestion.

