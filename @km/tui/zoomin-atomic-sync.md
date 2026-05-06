---
mentions:
  - km
  - claude
projects:
  - sel
id: "@km/tui/zoomin-atomic-sync"
aliases:
  - km-tui.zoomin-atomic-sync
  - km-tui-zoomin-atomic-sync
created_by: Bjørn Stabell
created_at: 2026-04-15T16:54:54Z
closed_at: 2026-04-21T06:01:39Z
close_reason: >-
  Fixed (option b, single-source-of-truth). Commit: 3ff062622.


  Investigation verdict: The 4 manual `dispatchBoard({ ZOOM_IN }) +
  sel.root.set(id)` pairs in use-board-dialogs.ts (2) and board-actions.ts
  handleCursorTo (2) were REDUNDANT copy-paste. syncPaneSignals() in
  board-app-store.ts:635 already mirrors pane.sel.root to pane.rootId after
  every dispatchBoard on the focused pane. Added in b99a81fa9 as a crash-fix —
  but at that time syncPaneSignals was already performing the same sync, so the
  manual calls never had anything to do.


  Approach: Option (b) — preserve syncPaneSignals as the canonical single sync
  point, delete the 4 redundant manual pairs. Callers can no longer forget the
  sync because they no longer need to know about it.


  Deletions: 4 sel.root.set() + 2 stale comments + 1 stale rationale comment
  (use-board-dialogs.ts was referencing navigateToPickedNode, a function removed
  in a later refactor).


  Kept 3 load-bearing sel.root.set sites:
    - syncPaneSignals itself (canonical mirror, board-app-store.ts:635)
    - Phase-3 invariant heal in board-app.ts (defense-in-depth for future paths that mutate pane.rootId outside dispatchBoard)
    - detailPane.sel.root.set in CURSOR_TO (detail pane isn't focused, so syncPaneSignals doesn't run on it)

  Refreshed stale comments in invariants.ts + board-app.ts (Phase-3 heal): no
  longer claim "omnibox go-to and other nav paths bypass syncPaneSignals" — that
  claim became false when the dialog paths started routing through
  dispatchBoard. Heal is now framed as defense-in-depth.


  Test (TDD): Added 3 tests to board-zoom.slow.spec.ts locking in the invariant.
  dispatchBoard({ ZOOM_IN }) alone must leave sel.root.id() === pane.rootId.
  Covers:
    1. Single ZOOM_IN
    2. Successive ZOOM_INs (level1 → level2 → level3)
    3. ZOOM_IN nodeId:null (zoom to repo root / unzoom)

  Verification:
    - typecheck: 0 errors (bunx tsc --noEmit | grep "error TS" | grep -v vendor/ | wc -l → 0)
    - km-tui fast suite: 2339 passed / 38 skipped / 0 failed (108 files)
    - Slow suites covering sel.root paths: 329 passed / 0 failed (board-zoom + search + navigation)
    - Adjacent domain slow failures (resize-garble, card-rendering date-badge, inline-edit) pre-existed and are unrelated — tracked under km-tui.nav-garble-wide and similar.

  Unblocks Phase 2 of km-all.plateau Stream A (selection-focus-plateau).
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-tui.zoomin-atomic-sync
    depends_on_id: km-silvery.selection-focus-plateau
    type: parent-child
    created_at: 2026-04-15T11:31:14Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.selection-focus-plateau
---

# [x] Verify ZOOM_IN+sel.root.set pairing is actually needed — delete pair sites if not @km/tui #task #P3 @claude:8b5b9e1c

blocks:: [[@km/silvery/selection-focus-plateau]]

Every dialog goto path pairs dispatchBoard({type: 'ZOOM_IN'}) with sel.root.set(nodeId) manually (see f84e1375a, b99a81fa9, use-board-dialogs.ts). But syncPaneSignals in board-app-store.ts already calls pane.sel.root.set(pane.rootId) after every dispatchBoard. Investigation needed: either (a) the pair sites are redundant copy-paste and can be deleted, OR (b) syncPaneSignals skips some paths and the pair is load-bearing. If (a), delete 6+ call sites. If (b), make it unconditional so callers can't forget.

