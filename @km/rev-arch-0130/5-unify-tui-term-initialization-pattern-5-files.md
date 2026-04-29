---
id: "@km/rev-arch-0130/5-unify-tui-term-initialization-pattern-5-files"
aliases:
  - km-rev-arch-0130.5
  - km-rev-arch-0130-5
  - "@km/rev-arch-0130/5"
created_at: 2026-01-30T00:35:40Z
closed_at: 2026-02-03T15:24:42Z
---

# [x] Unify TUI term initialization pattern (5 files) @km/rev-arch-0130 #task #P2 @claude:da8e4a66

High: render.ts:28, colors.ts:11, rich.ts:20, format.ts:18, board-top-bar.ts:12 all have identical `let _term: ... | null = null` singleton pattern. Create shared term initialization.