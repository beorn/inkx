---
tags:
  - task
  - P3
mentions:
  - km
id: "@km/beads/dolt-archive"
aliases:
  - km-beads.dolt-archive
  - km-beads-dolt-archive
created_by: claude:da9990c5
created_at: 2026-04-28T06:12:33Z
closeReason: "Resolved: .beads/dolt deleted entirely (was 892MB). Snapshots at
  /tmp/km-bd-archive-20260428-193507/ +
  /tmp/km-cutover-archive-20260428-194929/. Recoverable from git history if
  needed."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.dolt-archive
    depends_on_id: km-beads.advanced-subcommands
    type: blocks
    created_at: 2026-04-28T01:15:37Z
    created_by: claude:da9990c5
    metadata: "{}"
  - issue_id: km-beads.dolt-archive
    depends_on_id: km-beads.cutover
    type: parent-child
    created_at: 2026-04-27T23:12:42Z
    created_by: claude:da9990c5
    metadata: "{}"
  - issue_id: km-beads.dolt-archive
    depends_on_id: km-beads.hooks-rewrite
    type: blocks
    created_at: 2026-04-27T23:12:43Z
    created_by: claude:da9990c5
    metadata: "{}"
  - issue_id: km-beads.dolt-archive
    depends_on_id: km-beads.pm-skill-rewrite
    type: blocks
    created_at: 2026-04-27T23:12:43Z
    created_by: claude:da9990c5
    metadata: "{}"
  - issue_id: km-beads.dolt-archive
    depends_on_id: km-beads.split-backend
    type: blocks
    created_at: 2026-04-28T01:25:03Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] Retire embedded Dolt MySQL backing the Go bd binary @km/beads #task #P3

blocks:: [[@km/beads/advanced-subcommands]], [[@km/beads/cutover]], [[@km/beads/hooks-rewrite]], [[@km/beads/pm-skill-rewrite]], [[@km/beads/split-backend]]

Once /pm and hooks have moved to km bd, nothing reads .beads/dolt/ anymore. The Dolt server (background MySQL) can shut down, the .beads/dolt-server.{log,pid,port} files can be cleaned, and the auto-start machinery for it can be deleted.

## Scope

- Verify nothing in km calls bd binary or speaks MySQL to .beads/dolt
- Stop/uninstall the Dolt server auto-start (LaunchAgent / systemd / hook)
- Decide on archival vs deletion of .beads/dolt/ data (issues already migrated to vault markdown — Dolt is the legacy mirror)
- Strip Dolt references from docs

## Acceptance

- Fresh checkout doesn't auto-start a Dolt server
- .beads/ contains only issues.jsonl + memory.jsonl (or whatever km bd writes)
- No 'dolt' process visible after a typical session

## Depends on

- @km/beads/pm-skill-rewrite
- @km/beads/hooks-rewrite

