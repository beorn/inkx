---
id: "@km/tui/popover"
aliases:
  - km-tui.popover
  - km-tui-popover
created_by: claude:e31834da
created_at: 2026-03-20T00:28:50Z
closed_at: 2026-03-20T01:42:10Z
close_reason: "Implemented: prettifyUrl enhancement, popover system, URL
  metadata fetching, loading indicator, clickable links. Remaining silvery work
  tracked in km-silvery.link-arm-variant (P0)."
owner: bjorn@stabell.org
assignee: claude:e31834da
---

# [x] Popover component: hover-to-preview for links and more @km/tui #feature #P2 @claude:e31834da

General-purpose popover/tooltip system for the TUI. First use case: hovering over a link shows a preview with title, description, favicon, etc. Should be a reusable silvery component that any content can trigger (links, wikilinks, block refs, sigils).