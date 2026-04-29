---
id: "@km/tui/hvl-single-col"
aliases:
  - km-tui.hvl-single-col
  - km-tui-hvl-single-col
created_by: claude:b92140a2
created_at: 2026-03-16T23:33:38Z
closed_at: 2026-03-17T03:55:26Z
close_reason: Not an HVL bug. Root cause is folder-file merge design question →
  km-storage.folder-file-merge
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] HVL single-column collapse: zoom-out to folder with many columns shows 1 full-width column @km/tui #bug #P1 @claude:b92140a2

When zooming out to early-orbit folder (24 .md files), HVL sometimes renders all cards in a single full-width column instead of 24 horizontal columns. deriveColumnsFromRepo correctly returns 24 columns. Reproduced: km view --repo imports/asana launch-academy → Z Z → h. The HVL scrollTo + computeColumnWidths interaction at certain widths produces wrong layout.