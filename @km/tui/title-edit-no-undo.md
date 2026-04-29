---
id: "@km/tui/title-edit-no-undo"
aliases:
  - km-tui.title-edit-no-undo
  - km-tui-title-edit-no-undo
created_by: Bjørn Stabell
created_at: 2026-04-06T20:49:02Z
closed_at: 2026-04-21T05:26:08Z
close_reason: >-
  Fixed: RepoProvider installed the raw repo while state.repo held the
  undoable-wrapped proxy, so title/body edits routed through useRepo() bypassed
  the undo stack.


  Root cause: useRepo() returned the raw repo, so mutations via
  repo.updateNode() in tree-node-edit.tsx
  (handleInlineEditConfirm/handleTitleSave/handleBlockSave/HR conversion)
  skipped the Proxy's updateNode interceptor. Structural ops went through
  ctx.repo === state.repo (wrapped) and recorded fine, masking the gap.


  Fix (53890df31): wire the SAME undoable-wrapped repo into both the store and
  RepoProvider at every entry point (tui.tsx, driver.ts, test-app.ts,
  board-test.ts) via the new CreateBoardAppStoreParams.undoInfra field. The
  store's resolveUndoInfra() reuses the pre-wrapped repo when undoInfra is
  present, avoiding double-wrap.


  Evidence:

  - Failing journey tests (9f2a7524f):
  apps/km-tui/tests/title-edit-undo.slow.test.tsx, 4 tests — card title edit +
  Escape + u reverts; multi-edit → multi-entry; no 'nothing to undo' bell;
  column rename reverts.

  - Tests pass after fix: 4/4 in title-edit-undo.slow.test.tsx, 44/44 in
  undo-redo.spec.ts, 187/187 across adjacent domain tests (board, board-render,
  showcase).

  - npx tsc --noEmit 2>&1 | grep 'error TS' | grep -v vendor/ | wc -l → 0.
owner: bjorn@stabell.org
---

# [x] [bug] Undo stack doesn't cover title edits — 'Nothing to undo' after typo @km/tui #bug #P2

Edit a card title, save with Escape, press u → 'Nothing to undo'. Edit committed to disk but not in undo stack. Users can't recover from typos within session.