---
mentions:
  - km
  - claude
id: "@km/tui/card-render-quality"
aliases:
  - km-tui.card-render-quality
  - km-tui-card-render-quality
created_by: claude:d697f216
created_at: 2026-02-25T11:56:51Z
closed_at: 2026-02-25T12:33:54Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Card rendering: missing links, plain-text URLs, overflow/wrapping issues @km/tui #bug #P1 @claude:d697f216

Comparing Asana vs km TUI for the same tasks shows several rendering quality issues:

1. Links in angle brackets (<url>) not rendered at all
2. URLs rendered as plain text instead of clickable links
3. Card body text overflowing with weird line wrapping
4. Overall card content formatting much worse than source (Asana)

