---
mentions:
  - km
  - claude
id: "@km/inbox/tui-scroll-cursor"
aliases:
  - km-tui-scroll-cursor
  - "@km/_orphan/tui-scroll-cursor"
created_at: 2026-01-31T21:54:43Z
closed_at: 2026-02-02T10:38:45Z
assignee: claude:227cdc41
---

# [x] Cursor jumps to top bar when scrolling down past screen in columns view @km/_orphan #bug #P2 @claude:227cdc41

## Steps to Reproduce

1. Open `km view /tmp/tst-vault1` (or any vault with many items)
2. Navigate to the journals column
3. Press down arrow to navigate through items
4. Continue pressing down past the visible screen (triggering scroll)

## Expected Behavior

Cursor should remain on the item in the scrolled content

## Actual Behavior

Cursor jumps to the top bar when scrolling occurs

## Context

This may be related to the scroll offset calculation or focus management during scroll events.

