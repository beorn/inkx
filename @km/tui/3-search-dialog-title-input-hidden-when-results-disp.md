---
mentions:
  - km
  - claude
id: "@km/tui/3-search-dialog-title-input-hidden-when-results-disp"
aliases:
  - km-tui.3
  - km-tui-3
  - "@km/tui/3"
created_at: 2026-02-04T15:56:04Z
closed_at: 2026-02-04T17:38:30Z
assignee: claude:44a381e0
---

# [x] Search dialog: title/input hidden when results displayed @km/tui #task #P2 @claude:44a381e0

When search results are displayed in the Search dialog, the title ('Search') and input box disappear during loading and reappear when loading completes.

**Investigation (2026-02-04):**

- The Suspense boundary only wraps the results area, NOT the title/input
- flexShrink={0} was added to InputBox wrapper to prevent shrinking
- But the bug persists - title/input disappear during Suspense loading state

**Root cause:** Likely an inkx rendering issue related to how Suspense transitions are handled. The React tree structure is correct but the visual output during loading is wrong.

**Repro:** Type 2+ chars in search to trigger loading - title/input disappear briefly.

