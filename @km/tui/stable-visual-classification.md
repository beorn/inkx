---
mentions:
  - km
  - Bjørn
id: "@km/tui/stable-visual-classification"
aliases:
  - km-tui.stable-visual-classification
  - km-tui-stable-visual-classification
created_by: Bjørn Stabell
created_at: 2026-04-06T19:53:19Z
closed_at: 2026-04-07T01:31:32Z
close_reason: "Grooming: landed in commit ed99dec6d 'fix(tui): stable body
  classification immune to cursor expansion' per session 0406a notes."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Stable visual classification — data-derived, not cursor-derived @km/tui #feature #P3 @Bjørn Stabell

Root cause from /big analysis (2026-04-06): body/structural classification, expand state, and isCardChild all depend on cursor position. Moving cursor changes how NON-cursor items render (style flickering, checkbox appearing/disappearing).

Current: extractBody, shouldExpand, isCardChild re-derive visual classification on every cursor move.

Design: Node visual identity (body vs structural, expanded vs collapsed, checkbox vs plain) should be stable — determined by data model, not cursor position. Expansion for editing should ADD nodes to the visible set without reclassifying existing nodes.

