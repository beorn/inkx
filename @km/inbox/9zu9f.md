---
id: "@km/inbox/9zu9f"
aliases:
  - km-9zu9f
  - "@km/_orphan/9zu9f"
created_by: claude:ea392ebd
created_at: 2026-02-11T13:12:30Z
closed_at: 2026-02-11T13:42:08Z
owner: bjorn@stabell.org
assignee: claude:ea392ebd
---

# [x] Screen blanks when log toast appears after opt-j shift @km/_orphan #bug #P2 @claude:ea392ebd

Repro steps:
1. bun km view -v /tmp/vt
2. opt-j to shift a card down
3. Wait for the verbose log message toast to appear
4. Screen goes blank before/when the toast shows — only the toast is visible, rest of screen is empty

Likely a re-render triggered by the toast that clears the screen content. May be related to prior blank screen bugs (@km/_orphan/a6ti, @km/_orphan/ykx3) which were fixed but this is a new variant triggered specifically by the log toast timing.