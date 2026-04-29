---
id: "@km/tui/search-truncate"
aliases:
  - km-tui.search-truncate
  - km-tui-search-truncate
created_at: 2026-02-04T14:16:07Z
closed_at: 2026-02-04T14:40:20Z
---

# [x] Search results truncated prematurely @km/tui #bug #P3 @claude:44a381e0

Search results in the search dialog are truncated even with available space.

Example: 'China domicile < [[2022-07-25]] #PwC/China Call w Steven, Diana, El'

The parent context and tags consume space before the title can fully display. Consider:
- Prioritizing title display
- Truncating parent context instead of title
- Multi-line format for results