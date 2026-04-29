---
id: "@km/_orphan/zgoi8"
aliases:
  - km-zgoi8
created_at: 2026-01-29T20:49:14Z
closed_at: 2026-01-29T21:00:11Z
assignee: claude:85e4bbaf
---

# [x] batch plugin: complete monorepo restructure and verify skill discovery @km/_orphan #task #P2 @claude:85e4bbaf

## Context
Restructured batch plugin from flat layout to proper monorepo structure:
- Added `.claude-plugin/marketplace.json` at repo root
- Moved skills/, tools/, .claude-plugin/plugin.json into `batch/` subdirectory

## Remaining work
1. **Verify skill discovery** - restart Claude Code and confirm batch-refactor skill loads
2. **Update README** - remove "Flat Structure Required" note if it works
3. **Commit upstream** - push restructure changes to beorn/claude-tools
4. **Update km submodule** - commit submodule pointer in km repo
5. **Test installation** - verify `claude plugin install batch@beorn-claude-tools` works fresh

## Files changed
- `vendor/beorn-claude-tools/.claude-plugin/marketplace.json` (new)
- `vendor/beorn-claude-tools/batch/` (new directory with plugin contents)
- `vendor/beorn-claude-tools/skills/` (moved to batch/)
- `vendor/beorn-claude-tools/tools/` (moved to batch/)