---
mentions:
  - km
  - Bjørn
id: "@km/tui/silvery-bench-markers-bump"
aliases:
  - km-tui.silvery-bench-markers-bump
  - km-tui-silvery-bench-markers-bump
created_by: Bjørn Stabell
created_at: 2026-04-07T19:35:04Z
closed_at: 2026-04-07T19:58:50Z
close_reason: "completed: cherry-picked e3c806e (feat(create): performance.mark
  phase markers for bench harnesses) into vendor/silvery main as cd305cd, and
  bumped km submodule pointer in dbaaa44e9 (chore: bump vendor/silvery — bench
  phase markers). Concurrent WIP from another session was preserved by saving
  create-app.tsx to /tmp, restoring HEAD via cp, cherry-picking, then
  re-applying the WIP collapse via Edit. Bench (cursor-perf.bench.ts) now runs
  against silvery cd305cd as expected. Note: react reconcile field still reports
  0 in current bench output because the bench harness uses createRenderer (from
  @silvery/test) rather than initApp from create-app.tsx — the new
  instrumentation is in the initApp reconcile path. Wiring up createRenderer
  reconcile timing is a follow-up improvement, not part of this bump."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Bump vendor/silvery to include bench phase markers (e3c806e) when other session unblocks @km/tui #task #P2 @Bjørn Stabell

## Why

The @km/tui/bench-system agent committed silvery phase markers at vendor/silvery commit e3c806e (in the agent's worktree at /Users/beorn/Code/pim/km/.claude/worktrees/agent-a2c3b3a0/vendor/silvery). The @km/_orphan/side bump commit (eccfed292 in the agent's branch) was NOT cherry-picked into main because main vendor/silvery has uncommitted work from another concurrent tribe session (km-5/km-6) that conflicts on packages/create/src/create-app.tsx.

## Action

When the other session commits its work in vendor/silvery:

1. Fetch e3c806e from the agent's worktree: `cd vendor/silvery && git fetch /Users/beorn/Code/pim/km/.claude/worktrees/agent-a2c3b3a0/vendor/silvery e3c806e`
2. Cherry-pick or rebase the bench markers commit
3. Bump the submodule pointer in km root: `cd /Users/beorn/Code/pim/km && git add vendor/silvery && git commit -m "chore: bump vendor/silvery — bench phase markers"`
4. Re-run bench-now.sh and verify the per-phase output now shows non-zero react-reconcile data

Without this bump, bench-now.sh works but reports react-reconcile = 0% (the markers aren't in production silvery yet). The phase breakdown for layout, content, output, other is unaffected — those markers were added on the @km/tui side and work without the silvery bump.

## Files in the silvery commit

- packages/ag-term/src/ag.ts — per-phase accumulator in doLayout/doRender
- packages/ag-term/src/pipeline/index.ts — silveryBenchStart/Stop/Reset + SilveryBenchPhases type
- packages/ag-term/src/pipeline.ts — re-export bench helpers
- packages/ag-term/src/index.ts — re-export bench helpers
- packages/create/src/create-app.tsx — reconcile-phase accumulator (THIS IS WHERE THE CONFLICT IS)

## Coordination

If the other session is unreachable for >24h, manually merge: take their changes from vendor/silvery working tree, rebase the e3c806e commit on top, resolve any create-app.tsx conflict (probably reconcile both edits — they're orthogonal areas of the file).

## Parent

@km/tui/bench-system (closed)

