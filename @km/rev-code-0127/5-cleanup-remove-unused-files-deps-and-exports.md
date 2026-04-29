---
id: "@km/rev-code-0127/5-cleanup-remove-unused-files-deps-and-exports"
aliases:
  - km-rev-code-0127.5
  - km-rev-code-0127-5
  - "@km/rev-code-0127/5"
created_at: 2026-01-27T14:28:39Z
closed_at: 2026-01-27T20:38:07Z
---

# [x] Cleanup: Remove unused files, deps, and exports @km/rev-code-0127 #task #P3 @claude:cacac722

**Medium**: Large cleanup pass for unused code

Unused files (12 production files):
- apps/@km/_orphan/cli/src/execute.ts
- apps/@km/tui/src/views/Toast.tsx
- apps/@km/_orphan/cli/tests/@km/repl/ts
- apps/@km/_orphan/cli/tests/mdtest-sh-plugin.ts
- tests/fail-on-console.ts
- Plus 7 more (see full review)

Unused dependencies (17):
- @beorn/chalkx, @km/board, @km/markdown (@km/_orphan/cli)
- inkx, react (@km/_orphan/repl)
- @beorn/inkx-ui, ink, wrap-ansi (@km/tui)
- Plus 8 more

Unused exports (264): See knip output

Actions:
1. Verify files are truly unused (grep codebase)
2. Delete unused files
3. Remove unused dependencies
4. Consider removing unused exports (type-only may be OK)