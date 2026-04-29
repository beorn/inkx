---
id: "@km/infra/worktree-gc"
aliases:
  - km-infra.worktree-gc
  - km-infra-worktree-gc
created_by: claude:11bf6f91
created_at: 2026-04-25T05:46:03Z
closed_at: 2026-04-25T06:18:21Z
close_reason: Implemented in commits 5faefbfce + 7d5d83071 (km) and a3229df +
  22c73c6 (bearly). All bead requirements verified via /complete audit; 9 new
  tests pass; cascade detection added in audit pass.
started_at: 2026-04-25T05:57:10Z
owner: bjorn@stabell.org
assignee: claude:11bf6f91
dependencies:
  - issue_id: km-infra.worktree-gc
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-24T22:46:19Z
    created_by: claude:11bf6f91
    metadata: "{}"
---

# [x] Add 'bun worktree gc' to auto-prune .claude/worktrees/ clones @km/infra #task #P1 @claude:11bf6f91

blocks:: [[@km/infra]]

Worktree clones in .claude/worktrees/agent-* accumulate forever — worktree-remove.sh deliberately preserves them for user-recovery. After 24-36h on this machine, 23 clones piled up; fseventsd hit 213% CPU watching them and triggered 2 system crashes plus widespread agent slowdown via I/O contention. Today (2026-04-24) we manually trashed 22 (14 broken from cancelled cps + 8 redundant with HEAD already in main).

REQUIREMENTS:
- 'bun worktree gc' command in vendor/bearly (or wherever bun worktree lives)
- Default: prune clones with no uncommitted work AND HEAD reachable from main, older than N days (suggest N=2)
- Always preserve clones with uncommitted changes
- Detect 'broken' clones (missing .git) and prune them regardless of age — they're cancelled-cp orphans
- Detect 'cascade' clones (clones inside clones — pre-2026-04-23 isolate.sh bug) and prune the inner copies
- --dry-run flag; default verbose; --force to skip prompts
- Wire into a periodic hook? Or document as part of session-end?

CONTEXT:
- worktree-remove.sh hook (line 19) explicitly mentions this gap: 'Future: a bun worktree gc command could prune clones older than N days'
- isolate.sh added _reset_to_head 2026-04-23 to prevent NEW clones inheriting source's .claude/worktrees/, but pre-fix clones still have nested cascades
- Lock-serialization in isolate.sh (mkdir lock, max 10min wait) prevents PARALLEL contention but doesn't prevent ACCUMULATION
- Spotlight exclusion (.metadata_never_index) added at .claude/worktrees/ today to stop mds_stores indexing — gc complements but doesn't replace this

VERIFICATION TARGET:
- After running gc on a vault with N>0 stale clones, fseventsd CPU should drop from elevated to baseline within ~30s