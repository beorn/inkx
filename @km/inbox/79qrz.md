---
id: "@km/_orphan/79qrz"
aliases:
  - km-79qrz
created_by: claude:c9beade3
created_at: 2026-03-13T23:21:14Z
closed_at: 2026-03-13T23:31:14Z
close_reason: "Fixed in feat/cell-type-unification branch: all views made lazy
  (screen, scrollback, viewport, range use inner getRange()/getBase() that
  recalculate per access)"
owner: bjorn@stabell.org
---

# [x] termless: selectors snapshot too early, not live like Playwright locators @km/_orphan #bug #P1

Found by GPT 5.4 Pro review (2026-03-13).

Files: src/views.ts:54-176, src/terminal.ts:245-266
Classification: P1

term.screen, term.scrollback, term.viewport, term.row(), term.range(), and term.cell() resolve rows immediately. If output scrolls after selector creation, saved selector points at stale rows. term.cell() snapshots cell contents, not just address. Opposite of Playwright locator semantics — will undermine polling/auto-waiting.

Suggested fix: Make all selectors lazy. Store logical intent and resolve against current scrollback state on every read/assertion.