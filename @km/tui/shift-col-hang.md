---
id: "@km/tui/shift-col-hang"
aliases:
  - km-tui.shift-col-hang
  - km-tui-shift-col-hang
created_by: claude:36393b5d
created_at: 2026-02-19T14:52:25Z
closed_at: 2026-02-19T17:24:51Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] App hangs when shifting column left/right @km/tui #bug #P1 @claude:8f007ba9

User tried to shift the [Biz] NewCo > OB > MFP column to the left (likely via Shift+H or similar keybinding), and the app hung completely. This is a P1 blocking bug. Needs investigation: what does the shift-column command do, is there an infinite loop or deadlock?