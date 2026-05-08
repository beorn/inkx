---
aliases:
  - km-tui.scroll-focused-card-child-cursor
  - km-tui-scroll-focused-card-child-cursor
created_at: 2026-05-07T22:46:55.425Z
closed_at: 2026-05-07T22:47:00.694Z
closeReason: "Fixed focused-card child cursor windowing and card/tabs/list-level
  scroll follow through cursor-owned lists. Tests: bun vitest run
  apps/km-tui/tests/reactive-node-store.test.ts
  apps/km-tui/tests/scroll-and-cursor.test.tsx
  apps/km-tui/tests/cursor-render-scope.test.ts; bun vitest run --project slow
  apps/km-tui/tests/scroll.slow.test.ts -t \"list view\". Lint: bun run
  lint:errors. Repo-wide test:fast reaches Vitest after typecheck, but is blocked
  by unrelated silvercode test failures."
---

# [x] Scroll focused-card and tall-card cursors into view #bug #P2

In km view, cursor movement could advance semantically while the rendered viewport stayed pinned above the cursor:

- Moving down through tall sibling cards left `card2+` below the terminal viewport because visible-content anchoring fought the cursor-driven card-list `scrollTo`.
- The same cursor-driven `ListView scrollTo` shape existed in tabs and list view.
- Moving down through children inside a tall focused card left the child window pinned to the first children.

Keep both the card-level viewport and focused-card child window following the cursor without reintroducing broad global cursor subscriptions.
