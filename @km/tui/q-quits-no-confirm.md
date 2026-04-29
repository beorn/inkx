---
id: "@km/tui/q-quits-no-confirm"
aliases:
  - km-tui.q-quits-no-confirm
  - km-tui-q-quits-no-confirm
created_by: Bjørn Stabell
created_at: 2026-04-06T20:46:35Z
closed_at: 2026-04-07T05:46:18Z
close_reason: "Fixed in 2317d0656 (cherry-picked from worktree b9cd25ab7).
  Removed bare q→quit binding from tui layer + remapped console-modal q to
  console.close. Quit reachable via Ctrl+C, command palette ':q', and contextual
  close_or_quit on Escape. New regression tests in keybindings.test.ts.
  Followups noted: Backspace/Delete delete_node confirm gating audit."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Bare q key quits without confirmation @km/tui #bug #P1 @Bjørn Stabell

Single keystroke destroys the session. Especially bad when pressing q after incomplete chord. Fix: add confirmation prompt or require :q via omnibox.