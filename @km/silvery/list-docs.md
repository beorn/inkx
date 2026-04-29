---
id: "@km/silvery/list-docs"
aliases:
  - km-silvery.list-docs
  - km-silvery-list-docs
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:46:28Z
closed_at: 2026-03-11T07:49:29Z
close_reason: Added 'List Components' section to scrolling guide with comparison
  table (overflow vs VirtualList vs ScrollbackList). Cross-linked from
  scrollback page and components guide.
---

# [x] Docs: cross-link list components (SelectList, VirtualList, ScrollbackList) @km/silvery #task #P3 @claude:e4e70c9a

The scrolling guide only covers Box overflow='scroll'. It should mention specialized list components and when to use which:

- **Box overflow='scroll'** — General scrolling for any content
- **SelectList** — Small selection lists (form input, keyboard nav, maxVisible)
- **VirtualList** — Large lists (1000+ items, O(1) rendering, interactive mode)
- **ScrollbackList** — Inline mode (freeze completed items into terminal history)

Add a 'Specialized List Components' section to the scrolling guide with a comparison table and links. Also cross-link from the components guide.