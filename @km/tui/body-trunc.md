---
mentions:
  - km
id: "@km/tui/body-trunc"
aliases:
  - km-tui.body-trunc
  - km-tui-body-trunc
created_by: claude:ee8efc0f
created_at: 2026-02-22T00:46:45Z
owner: bjorn@stabell.org
---

# [ ] Body truncation: independent from fold, hide overflow paragraphs @km/tui #feature #P3

Decker has two independent visibility controls: fold (hide subitems/children) and trunc (hide body overflow paragraphs). A card can be folded but not truncated, or truncated but not folded, or both.

In km, this would mean: a card with a long body (multiple paragraphs) can show just the first paragraph with a '...' indicator, independently of whether its children are folded. This keeps the board compact without hiding structural information.

Reference: decker-dragaboard/src/utils/get-hidden-range.ts

