---
id: "@km/tui/doc-view"
aliases:
  - km-tui.doc-view
  - km-tui-doc-view
created_by: claude:ceb7c9cb
created_at: 2026-03-29T04:41:29Z
closed_at: 2026-03-29T04:46:50Z
close_reason: "Detail view now renders as doc-style: headings with # markers,
  body paragraphs inline, task items with markers, nested indentation up to 4
  levels, code/quote styling, cursor highlighting."
owner: bjorn@stabell.org
assignee: claude:ceb7c9cb
---

# [x] Doc view — render node as markdown document in TUI @km/tui #feature #P2 @claude:ceb7c9cb

## Vision
Render a node like a markdown document in the TUI. Rather than a new view mode, repurpose/expand the existing detail pane.

## Approach: Detail Pane → Doc Mode
The detail pane already renders metadata + body + children for one node. Two modes:
- **Side pane** (current): narrow panel alongside board columns
- **Doc mode** (new): full-width, replaces the board columns temporarily

Toggle with a keybinding (e.g., `Enter` on detail pane, or a chord). `q`/`Escape` returns to board.

## Doc Mode Rendering
- Full-width rendering of the node's content tree
- Headings with markdown-style hierarchy (## Title)
- Body paragraphs inline (not collapsed behind a badge)
- Task items with checkboxes and status
- Code blocks, quotes preserved
- Nested list indentation matching depth
- Scrollable via j/k

## Reuse
- DetailView.tsx already has the metadata rendering
- TreeNode already renders individual nodes with proper icons
- The popover's nodeDetailPopoverContent is a mini version
- A shared DocRenderer could power: detail pane, doc mode, popover preview

## Why Not a New View Mode
Detail pane is already the "look at one node" UI. Making it expandable to full-width is simpler than adding a 6th view mode with its own state machine, keybindings, and mode transitions.