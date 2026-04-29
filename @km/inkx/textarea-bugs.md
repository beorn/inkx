---
id: "@km/inkx/textarea-bugs"
aliases:
  - km-inkx.textarea-bugs
  - km-inkx-textarea-bugs
created_by: claude:2f3fc9d8
created_at: 2026-02-11T20:14:11Z
closed_at: 2026-02-12T07:28:11Z
owner: bjorn@stabell.org
assignee: claude:2f3fc9d8
---

# [x] TextArea component: sluggish input, eaten keypresses, cursor position issues @km/inkx #bug #P2 @claude:2f3fc9d8

TextArea component has multiple UX issues reported during examples testing:

1. **Eaten keypresses** — some key presses don't register, making input unreliable
2. **Sluggish** — noticeable lag when typing
3. **Cursor jump on first type** — cursor jumps when you start typing; should show help text centered in the area instead
4. **Cursor stuck at pos 0** — sometimes cursor stays at position 0 but text still appears when typing

These may be related to input layer handling, render cycle latency, or cursor position tracking in the TextArea implementation.