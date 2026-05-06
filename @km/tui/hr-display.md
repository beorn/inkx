---
mentions:
  - km
  - claude
id: "@km/tui/hr-display"
aliases:
  - km-tui.hr-display
  - km-tui-hr-display
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:32:58Z
closed_at: 2026-02-15T09:07:10Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] HR nodes (---) show ID instead of horizontal rule on board @km/tui #bug #P2 @claude:a5c7f7de

HR nodes (---) should render as visual horizontal lines.

**Design (refined):**

- In normal/node mode: show as a single horizontal line WITHOUT any border — like the underline under column titles. Just a bare line of ─ characters.
  - Dimmed when not selected
  - Yellow when cursor is on it
- In edit mode: show as a normal block/item with padding and the actual text content (e.g., '---') as editable content
- Any valid markdown HR (---, ***, ___) stored as content triggers this visual rendering
- If edited to no longer be a valid HR, it reverts to normal node rendering

**Current state:** hr-display-fixer implemented basic version with ─ chars. Need to verify it renders without a border (no card border around it).

