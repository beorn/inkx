---
aliases:
  - km-tui.km-view-atkm-startup-regression
  - km-tui-km-view-atkm-startup-regression
type: bug
priority: P0
created_at: 2026-05-07T04:45:14.575Z
closed_at: 2026-05-07T05:10:32.000Z
closeReason: "Fixed cursor hot path by moving live cursor rendering to per-node NodeStore signals, removing global TreeNode cursor subscriptions, and caching the command node index. Tests: reactive-node-store, navigation-internals, showcase, column-rendering, scroll-and-cursor, tsc. Perf: steady km view @km --no-watch cursor moves ~15.7-18.7ms after first expansion vs 50-73ms before."
---

# [x] Restore km view @km cursor responsiveness ^km-view-atkm-startup-regression

Cursoring around in `km view @km` is much slower than before. Diagnose keypress latency on real `@km` data, fix the actual navigation/render hot path, and verify with key timing before closing.

Clarification: this is cursor movement sluggishness, not startup time.

## Repro

- Clean repro before this bead: five single `j` presses in `km view @km` took mean `58.0ms`, p95 `73.0ms`, max `73.0ms`.
- `silvery:perf` showed the cost was dominated by React reconcile (`35-45ms` per key) plus repeated render passes, not terminal output.

## Fix Notes

- Remove global cursor subscriptions from rendered `TreeNode`/card paths.
- Add a per-node `cursorChild` signal so nested expansion does not read the global cursor from every node.
- Move cursor-to-`NodeStore` bridging into the existing selection effect so cursor signals update in the same event turn.
- Keep board shell rendering out of vertical cursor movement; live cursor rendering now flows through per-node signals.
- Cache the command-path visible-lens node index by lens identity.

## Acceptance

- [x] Regression test for direct-parent cursor tracking and no global `TreeNode` cursor subscription.
- [x] `bun vitest run apps/km-tui/tests/reactive-node-store.test.ts`
- [x] `bun vitest run apps/km-tui/tests/navigation-internals.test.ts`
- [x] `bun vitest run apps/km-tui/tests/showcase.spec.ts`
- [x] `bun vitest run apps/km-tui/tests/column-rendering.test.ts`
- [x] `bun vitest run apps/km-tui/tests/scroll-and-cursor.test.tsx`
- [x] `npx tsc --noEmit --pretty false`
- [x] Re-measured `km view @km --no-watch`: after initial expansion, steady cursor moves are about `15.7-18.7ms` in the sampled run, down from `50-73ms` before.
