---
id: "@km/infra/verified-definition"
aliases:
  - km-infra.verified-definition
  - km-infra-verified-definition
created_by: claude:8b5b9e1c
created_at: 2026-04-20T20:18:55Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.verified-definition
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-20T13:19:06Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [ ] /complete skill: encode "verified" = user-visible symptom gone, not "tests pass" @km/infra #task #P2

blocks:: [[@km/infra]]

Why-4 from column-top-disappears retro. Define: verified = (a) failing test at user-visible symptom level, (b) fix lands, (c) real-scenario re-reproduction shows symptom gone. No credit for 'all tests pass' alone. Update .claude/skills/complete/SKILL.md to enforce c).