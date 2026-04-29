---
id: "@km/tui/detail-pane-lag"
aliases:
  - km-tui.detail-pane-lag
  - km-tui-detail-pane-lag
created_by: claude:56a1fd6b
created_at: 2026-03-04T07:22:05Z
closed_at: 2026-03-04T07:43:30Z
---

# [x] Detail pane content lags 2-3s behind title on cursor change @km/tui #bug #P1 @claude:56a1fd6b

When cursor changes on main board, the detail pane title updates immediately but content stays stale for 2-3s before catching up.

**Expected**: Either content updates immediately with the title, or a loading indicator is shown until content is in sync with the pane title.

**Current**: Title changes instantly, stale content from previous node remains visible for 2-3s, then new content appears. This creates a confusing mismatch where the title says one thing and the content shows another.

**Likely cause**: Detail pane title reads from cursor state directly (synchronous), but content reads from a derived/async source (repo query, markdown parse, or debounced update). The fix should either make content synchronous or add a loading state when title !== content's source node.