---
id: "@km/_orphan/sync-1"
aliases:
  - km-sync-1
created_at: 2026-01-26T15:09:46Z
closed_at: 2026-01-27T17:28:40Z
---

# [x] vendor/beorn-watcher-chaos repo structure investigation @km/_orphan #task #P2 @claude:279f285c

Investigation: Why is beorn-watcher-chaos part of the km repo instead of a separate submodule?

Observations:
1. vendor/beorn-watcher-chaos has no .git directory (not a submodule)
2. It's not listed in .gitmodules
3. It contained @km/_orphan/specific "vault" terminology that was renamed to "repo"
4. The name suggests it should be a standalone FOSS library

Questions:
- Should this be extracted to a separate repo like beorn-claude-tools?
- Are there other dependents that would benefit from this as a library?
- What's the history here - was it always part of km or was there a merge?

Next steps:
- Review git log for vendor/beorn-watcher-chaos to understand history
- Decide if extraction to separate repo is warranted
- If yes, follow vendor package checklist from CLAUDE.md