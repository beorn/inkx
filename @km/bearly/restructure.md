---
id: "@km/bearly/restructure"
aliases:
  - km-bearly.restructure
  - km-bearly-restructure
created_by: claude:19080504
created_at: 2026-03-25T17:58:58Z
closed_at: 2026-03-25T20:17:02Z
close_reason: Renamed beorn/tools → beorn/bearly on GitHub, absorbed bearlymade
  packages, updated all km references, archived bearlymade
---

# [x] Restructure tools+bearlymade into beorn/bearly monorepo @km/bearly #task #P2 @claude:19080504

Merge beorn/tools + beorn/bearlymade into beorn/bearly monorepo. Plan at ~/.claude/plans/functional-crunching-valiant.md. Steps: 1) Create beorn/bearly GitHub repo, 2) Move packages into packages/ (tribe, tty, llm, recall, refactor, worktree from tools; alien-projections, alien-resources, vitest-silvery-dots from bearlymade), 3) Set up marketplace.json name='bearly', 4) Update km atomically (.gitmodules, .mcp.json, package.json scripts/workspaces/overrides, .claude/hooks/*.sh, skills, vendor/CLAUDE.md, apps/@km/_orphan/cli), 5) Verify typecheck+tests+tribe smoke test, 6) Deprecate tribe-wire on npm, archive old repos.