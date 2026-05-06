---
mentions:
  - km
  - claude
id: "@km/inbox/jtze2"
aliases:
  - km-jtze2
  - "@km/_orphan/jtze2"
created_by: claude:8f007ba9
created_at: 2026-02-20T11:25:30Z
closed_at: 2026-02-20T15:26:10Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Unified km.collapse for any node — columns, cards, sections @km/_orphan #feature #P3 @claude:d3a7049b

Following the 'Structural, Not Physical' principle: km.collapse:: true should work on any node, with visual rendering adapting to context:

- **Column**: narrow collapsed strip (current behavior)
- **Card**: shown but folded — dotted border or ··· indicator
- **Section in column**: hidden from outline
- **Section in detail pane**: shown, visually muted

Currently km.collapse is column-only (section rule). Unifying it means Comments/Attachments/Activity nodes in imports can use km.collapse:: true and render appropriately everywhere.

Search should still index collapsed nodes — collapse is a display preference, not a relevance filter.

Ref: docs/principles.md § Structural, Not Physical

