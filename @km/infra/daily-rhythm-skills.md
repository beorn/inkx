---
id: "@km/infra/daily-rhythm-skills"
aliases:
  - km-infra.daily-rhythm-skills
  - km-infra-daily-rhythm-skills
created_by: claude:2405c72e
created_at: 2026-04-28T22:27:18Z
closed_at: 2026-04-28T22:27:22Z
close_reason: Skills shipped in commit (this commit). Tracked here as a record.
  /shutdown surfaces in available-skills list; /startup activates on next
  skill-list rescan.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.daily-rhythm-skills
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-28T15:27:21Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Daily-rhythm skills shipped — /shutdown + /startup @km/infra #task #P3

blocks:: [[@km/infra]]

Two skills shipped 2026-04-28:

- .claude/skills/shutdown/SKILL.md — end-of-session triage of retained agent work
- .claude/skills/startup/SKILL.md — daily morning routine: full SOP + state orientation + carry-over

Both pair with @km/infra/orphan-branch-audit (the wip-triage tool, in flight). Until that tool ships, the skills include manual recipes for triage; once it ships, they delegate to bun tools/sop.ts {scan|clean} infra wip-triage.

Closing this bead is just the record — the actual implementation is the skill files. No further code work tied to this.