---
id: "@km/rev-code-0203"
aliases:
  - km-rev-code-0203
  - "@km/_orphan/rev-code-0203"
created_at: 2026-02-03T13:47:29Z
closed_at: 2026-02-03T14:20:16Z
---

# [x] Code review: Patterns and quality (Feb 2026) @km/rev-code-0203 #epic #P2

# Code Review: Patterns and Quality

**Date**: 2026-02-03
**Focus**: Pattern compliance, documentation drift, naming conventions

## Findings

### Already Fixed (this session)
- **Docs drift**: architecture.md Board API (methods → reducer pattern)
- **Docs drift**: ref/ui.md BoardState interface (SimplifiedBoardState → BoardState, properties)
- **Naming**: @km/_orphan/repl camelCase files → kebab-case (commandParser, shellExecutor)

### Beads Created
- .1: ensureOpen() anti-pattern removal (70+ calls)
- .2: Getters → plain properties (40+ in repo.ts)
- .3: TUI layer violation (tree-node-helpers.ts imports @km/markdown)
- .4: loadRepo() deprecation removal (40 file references)

### Deferred (covered by existing beads)
- Knip unused files → @km/rev-arch-0130/11-clean-up-knip-unused-files-24-files
- Knip config → @km/rev-arch-0130/12-fix-knip-config-for-workspace-packages
- Test helper consolidation → @km/_orphan/dew1v
- CalDAV factory conversion → @km/rev-arch-0130/4-convert-caldavclient-carddavclient-to-factory-func