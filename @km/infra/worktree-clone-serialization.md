---
mentions:
  - km
id: "@km/infra/worktree-clone-serialization"
aliases:
  - km-infra.worktree-clone-serialization
  - km-infra-worktree-clone-serialization
created_by: claude:2aefb4b6
created_at: 2026-04-24T23:19:02Z
closed_at: 2026-04-24T23:30:40Z
close_reason: Shipped @ km 4eaf34c38. .claude/lib/isolate.sh now wraps cp -c -R
  / tar fallback in a subshell with mkdir-based lock at
  $TMPDIR/silvery-clone.lock. Subshell EXIT trap releases on any path; 600s
  timeout surfaces wedged locks with rmdir hint. Verified single clone unchanged
  + 3 parallel clones serialize correctly + lockdir cleans up after each.
  Skipped pid-based staleness reaping (race windows) — wedged-process case is
  rare and surfaces via timeout.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.worktree-clone-serialization
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-24T16:19:05Z
    created_by: claude:2aefb4b6
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Serialize concurrent worktree clones — avoid Hook cancelled under tribe-cp pressure @km/infra #task #P2

blocks:: [[@km/infra]]

When two or more tribe sessions both invoke isolation: 'worktree' on the km repo (~13G, ~500K files) at the same time, multiple cp -c -R operations contend for I/O + CPU, the per-clone wall time grows past the harness hook timeout, and the spawning Agent receives 'Hook cancelled'. Observed 2026-04-24 across two separate batches in the lifecycle-scope work session: testfix-2 + vault tribe members were running their own cp -c -R loops while my session attempted to spawn 3 agents with isolation: 'worktree' — all 3 cancelled. Workaround: spawn agents sequentially or work in main repo. Permanent fix: add a global mutex (e.g. flock on a shared lockfile under ~/.local/share/claude/worktree.lock) in .claude/lib/isolate.sh so only N concurrent cp clones run at once. Alternative: a CPU-load gate that defers cloning when 1m load > N×cores. Either keeps p99 clone time below the harness hook timeout. Files to touch: .claude/lib/isolate.sh, possibly .claude/hooks/worktree-create.sh.

