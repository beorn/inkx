---
mentions:
  - km
id: "@km/tui/body-linebreaks"
aliases:
  - km-tui.body-linebreaks
  - km-tui-body-linebreaks
created_by: claude:36393b5d
created_at: 2026-02-19T15:11:12Z
closed_at: 2026-02-19T15:11:22Z
owner: bjorn@stabell.org
---

# [x] Body text: hard line breaks lost — text runs together @km/tui #bug #P2

Parser's nodeToText() didn't handle mdast 'break' nodes, causing hard line breaks (markdown trailing spaces) to be lost. Text like 'Filer: Delei Shi\nCompany Name: Mama Muse LLC' rendered as 'Filer: Delei ShiCompany Name: Mama Muse LLC'. Fix: added break node handler in parser.ts. Needs re-import to regenerate vault.

