---
id: "@km/tui/checkbox-cursor-move"
aliases:
  - km-tui.checkbox-cursor-move
  - km-tui-checkbox-cursor-move
created_by: Bjørn Stabell
created_at: 2026-04-03T08:42:18Z
closed_at: 2026-04-03T15:09:42Z
close_reason: "Root cause: app-level handleMouse (board-app.ts:849) runs on
  mousedown before click, dispatching SELECT to the sub-item. Fix: onMouseDown
  preventDefault on CheckboxIcon opts out of app click-to-select. Also re-SELECT
  current cursor after toggle (mirrors keyboard path)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Checkbox click moves cursor to sub-item — reactive signal side effect @km/tui #bug #P2 @Bjørn Stabell

Clicking a checkbox toggles status correctly but moves the cursor to the clicked sub-item.

## Confirmed facts
1. stopPropagation WORKS — debug log proved card's onClick never fires
2. The cursor movement comes from repo.updateNode() triggering reactive signals (km-5's Store/withReactive migration)
3. The keyboard path (x key) works without cursor movement — it goes through handleTaskStatusCycle → runRepoEffect → repo.updateNode() → re-SELECT current cursor

## Root cause
repo.updateNode() fires a reactive node signal. Something in the signal subscription chain re-evaluates cursor state and moves the cursor to the changed node. This is a bug in the reactive signal wiring — in-place mutations (status, dates, etc.) should not move the cursor.

## What's NOT the fix
- Re-selecting current cursor after toggle (hack — timing-dependent, still moves cursor)
- Dispatching TOGGLE_TASK_STATUS via dispatchBoard (wrong type — it's BoardEditOp, not BoardAction)
- Any workaround that papers over the reactive signal bug

## What IS the fix
Find the reactive subscription that connects repo node changes to cursor movement and ensure in-place mutations don't trigger it. The keyboard path avoids this because handleTaskStatusCycle explicitly re-selects after mutation (line 559 of board-actions-edit.ts), which is also technically a workaround.

## Files to investigate
- apps/@km/tui/src/board-app-store.ts — dispatchBoard SELECT fast path (line 513+)
- apps/@km/tui/src/cursor-context.tsx — CursorStore subscriptions
- apps/@km/tui/src/cursor-store.ts — cursor state management
- The reactive Store/withReactive wiring from km-5's migration