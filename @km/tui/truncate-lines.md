---
mentions:
  - km
id: "@km/tui/truncate-lines"
aliases:
  - km-tui.truncate-lines
  - km-tui-truncate-lines
created_by: claude:5f0aee02
created_at: 2026-02-18T10:09:32Z
closed_at: 2026-02-19T10:54:31Z
owner: bjorn@stabell.org
---

# [x] Card truncation leaves partial lines — ellipsis should end full lines @km/tui #bug #P3

In cards view, multiline text wrapping + truncation can leave partial lines. E.g., 'https://www.t' on one line then 'i…' on the next. User wants the ellipsis to appear at the end of the last full line with no partial lines after it. truncateText comes from inkx — may need to fix in vendor/beorn-inkx. See screenshot ~/Desktop/Screenshot 2026-02-18 at 10.04.08.png

