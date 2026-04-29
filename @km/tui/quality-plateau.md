---
id: "@km/tui/quality-plateau"
aliases:
  - km-tui.quality-plateau
  - km-tui-quality-plateau
created_by: Bjørn Stabell
created_at: 2026-04-05T17:48:04Z
owner: bjorn@stabell.org
---

# [ ] Quality plateau: reduce 5 state containers to 2 (signals + repo) @km/tui #epic #P2

Ongoing quality improvement for @km/tui. Originally: reduce state containers. Now expanded to cover type safety, test coverage, and architectural debt.

## Completed
- Signals migration (alien-signals replacing Zustand)
- ViewTree/ViewNode lens architecture (tree-lenses)
- Legacy ViewSnapshot elimination

## Remaining areas
1. Type safety: 17 'as any' casts (logger types, repo type coercion in hidden node computation)
2. Test gaps: hidden.ts (226 LOC), invariants.ts (347 LOC), undo-stack.ts (152 LOC), action-handlers.ts, dialog-guard.ts — all untested
3. Architectural TODOs: pipe() composition migration in driver.ts, board-app.ts, tui.tsx
4. Mixed state: React useState (229 instances) coexisting with alien-signals — potential sync issues