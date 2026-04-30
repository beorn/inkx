---
id: "@km/inbox/nyxsp"
aliases:
  - km-nyxsp
  - "@km/_orphan/nyxsp"
created_by: claude:34ba82b6
created_at: 2026-02-15T18:39:58Z
closed_at: 2026-02-15T18:51:17Z
owner: bjorn@stabell.org
assignee: claude:34ba82b6
---

# [x] TUI: l from body column after zoom goes to board root instead of next column @km/_orphan #bug #P2 @claude:34ba82b6

After zooming into a node with body content (paragraphs, code blocks), horizontal navigation (l) from the body column does not work correctly:

1. l from body column header after zoom goes to the board root instead of the first structural column
2. l from body card after zoom stays in place instead of navigating to the structural column

Key sequence: item('board', item('root', item.paragraph('body'), item('sub1', item('t1')), item('sub2', item('t2')))) → press e (zoom into root) → press k (go to body column header) → press l → cursor goes to 'root' (board root) instead of 'sub1'.

Without zoom (baseline): l from body column header works correctly.

Confirmed across variants: single paragraph, multiple paragraphs, code blocks, mixed body content.