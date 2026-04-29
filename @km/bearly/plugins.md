---
id: "@km/bearly/plugins"
aliases:
  - km-bearly.plugins
  - km-bearly-plugins
created_by: claude:19080504
created_at: 2026-03-25T05:12:16Z
closed_at: 2026-03-25T17:25:27Z
close_reason: 5 plugins created (tribe, tty, llm, recall, batch-refactor).
  Marketplace registered and tribe install verified. tribe-wire published on
  npm. Type errors fixed, 12 tests pass.
---

# [x] Restructure tools repo as multi-plugin Claude Code marketplace @km/bearly #feature #P2 @claude:19080504

Rename beorn/tools → beorn/claude-plugins. Restructure into plugins/ subdirectories (tribe, tty, llm, recall, batch-refactor) each with .claude-plugin/plugin.json, .mcp.json, skills. Keep non-plugin tools (worktree.ts, refactor.ts CLI) at repo root. Update marketplace.json. Verify skill discovery works (previous attempt never confirmed this).