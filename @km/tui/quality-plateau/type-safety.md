---
id: "@km/tui/quality-plateau/type-safety"
aliases:
  - km-tui.quality-plateau.type-safety
  - km-tui-quality-plateau-type-safety
created_by: Bjørn Stabell
created_at: 2026-04-06T16:42:32Z
closed_at: 2026-04-09T05:07:30Z
close_reason: Absorbed into km-tui.tree.v4.p8-type-safety. All 14 as-any casts
  eliminated in commit 88005e39a.
---

# [x] Fix 'as any' casts — logger types + repo type coercion @km/tui #task #P2

17 instances of 'as any' across @km/tui:
- tui.tsx: 6 casts (createLogger, globalThis diagnostics)
- hooks/use-columns.ts: 2 casts (createLogger)
- board/board-actions.ts: 1 cast (createLogger)
- pane-signals.ts:126 + board-app-store.ts:972: repo coerced to any for computeHiddenNodeIds — fix ViewLensRepo interface mismatch
- Various @ts-expect-error in views (React internal flags)