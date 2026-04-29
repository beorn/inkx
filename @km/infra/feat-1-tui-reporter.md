---
id: "@km/infra/feat-1-tui-reporter"
aliases:
  - km-infra.feat-1-tui-reporter
  - km-infra-feat-1-tui-reporter
created_at: 2026-01-28T13:25:09Z
closed_at: 2026-01-28T17:48:20Z
---

# [x] React TUI vitest reporter with live updates and keyboard controls @km/infra #feature #P2 @claude:18380d7e

## Delivered (inline mode with keyboard controls)

### Features
- ✅ Live streaming dots as tests complete
- ✅ TestStore with subscription API (infra/vitest-dotz/store.ts)
- ✅ Summary with pass/fail/skip counts and timing
- ✅ Per-package stats table
- ✅ Slow tests list with duration legend
- ✅ Failure details with stack traces
- ✅ Works with vitest 4.x (fixed hook timing bug)
- ✅ Keyboard controls (a/p/f/q) with stdin raw mode
- ✅ Grouping modes: auto, packages, files
- ✅ Package/file headers before grouped dots

### Keyboard Controls
- `a` = auto grouping (shows package headers, default)
- `p` = packages mode (same as auto)
- `f` = files mode (package + file headers)
- `q` or Ctrl+C = quit

### Files
- infra/vitest-dotz/index.tsx - main reporter
- infra/vitest-dotz/store.ts - external state store

### Usage
```
bun run test:fast2  # uses DotzReporter
```