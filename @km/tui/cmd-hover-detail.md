---
id: "@km/tui/cmd-hover-detail"
aliases:
  - km-tui.cmd-hover-detail
  - km-tui-cmd-hover-detail
created_by: claude:f8196c1c
created_at: 2026-03-28T15:14:17Z
closed_at: 2026-03-28T15:49:39Z
close_reason: Cmd+hover shows detail popover via singleton PopoverProvider.
  nodeDetailPopoverContent builds lines from node metadata/children/backlinks.
  Uses existing 400ms SHOW_DELAY. Link hover takes precedence naturally (last
  show wins).
---

# [x] Cmd+hover detail popup — hold Cmd to preview any item inline @km/tui #feature #P2 @claude:f8196c1c

Hold Cmd over any card title to show a detail preview popup after 0.5s delay. Renders the item like a doc (metadata + body + children) similar to DetailView, but in a floating overlay.

## Behavior
- Cmd held + cursor on card title → 0.5s delay → popup appears
- Popup shows: metadata rows, body content, children (like detail view)
- Release Cmd or move cursor away → popup dismisses
- Link hover-over takes precedence (natural stack order — link popups render on top)

## Design notes
- Could reuse the singleton hover-over system already used for wikilink previews
- Singleton pattern: only one popup at a time, new hover replaces previous
- Render content using existing NodeDetailView or similar doc-style layout
- Cmd modifier detection via terminal key reporting (kitty keyboard protocol or similar)

## Open questions
- Is Cmd the right modifier? (try it, might need Alt as fallback for non-Mac)
- Should the popup be fixed-position or follow the cursor card?
- Max popup height before scrolling?