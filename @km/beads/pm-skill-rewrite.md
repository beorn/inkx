---
id: "@km/beads/pm-skill-rewrite"
aliases:
  - km-beads.pm-skill-rewrite
  - km-beads-pm-skill-rewrite
created_by: claude:da9990c5
created_at: 2026-04-28T06:12:14Z
closed_at: 2026-04-28T08:14:09Z
close_reason: Shipped in fa1858976 (commit message bundled mine with concurrent
  agent's docs change due to lock race). All .claude/skills/pm/*.md files (14
  files) bulk-renamed bd → km bd for the common path (ready, show, claim,
  update, close, create, list, dep, children, blocked, migrate, export,
  remember, memories, prime, rename, config, info). Advanced subcommands not yet
  ported to km bd
  (defer/undefer/delete/comments/count/epic/formula/mol/gate/slot/swarm/promote/lint/validate/search/dolt/find-duplicates/graph/label)
  stay as bare 'bd <cmd>' so the cutover gap remains visible. Top of SKILL.md
  notes the 'bd' vs 'km bd' compatibility status. Lock-race meant my staged
  commit got absorbed into another agent's commit.
---

# [x] Rewrite /pm skill to use km bd commands instead of bd binary @km/beads #task #P2 @claude:da9990c5

blocks:: [[@km/beads/cutover]]

The /pm skill at .claude/skills/pm/ currently shells out to the Go bd binary (bd ready, bd show, bd update --claim, bd close, etc.). With km bd shipped as a drop-in CLI, the skill should call km bd instead so it works in environments without the Go binary installed.

## Scope
- Audit .claude/skills/pm/SKILL.md, .claude/skills/pm/workflows/*.md
- Replace 'bd <subcommand>' with 'bun km bd <subcommand>' (or alias 'kmbd')
- Verify the bug-fix workflow (auto-/tdd trigger) still threads through
- Update example outputs in docs to match km bd's formatting

## Acceptance
- /pm bug X works end-to-end without bd binary in PATH
- All workflow docs reference km bd
- Smoke: claim → close cycle on a fresh bead exits clean