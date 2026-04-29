---
id: "@km/_orphan/lp0hu"
aliases:
  - km-lp0hu
created_at: 2026-01-28T13:39:43Z
closed_at: 2026-01-28T13:45:41Z
---

# [x] Consolidate term/tui: absorb chalkx→term, inkx→tui @km/_orphan #task #P2

Build @beorn/term and @beorn/tui as the canonical packages by gradually absorbing features from chalkx and inkx.

## Strategy
1. Keep term/tui as the clean, well-designed packages
2. Absorb valuable features from chalkx into term
3. Absorb valuable features from inkx into tui
4. Migrate km code to import from term/tui
5. Delete chalkx/inkx when no longer referenced
6. Decide whether to rename term→chalkx, tui→inkx (reuse popular names)

## Why additive not subtractive
It's easier to decide what to add than what to remove. Starting clean avoids inheriting legacy cruft.

## Repos
- https://github.com/beorn/term
- https://github.com/beorn/tui

## Sub-tasks
- @km/_orphan/gnpz9: chalkx→term: export detection override functions
- @km/_orphan/ve6iy: chalkx→term: port storybook demo
- @km/_orphan/4u8ai: inkx→tui: absorb core components and hooks
- @km/_orphan/wkj3l: Migrate @km/tui app to @beorn/tui imports

## Related
- @km/infra/feat-1-tui-reporter: React TUI vitest reporter

## Migration doc
docs/dev/term-tui-migration.md