---
id: "@km/silvery/selection/7-fix-remaining-10-test-failures-from-sel-migration"
aliases:
  - km-silvery.selection.7
  - km-silvery-selection-7
  - "@km/silvery/selection/7"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:15:17Z
closed_at: 2026-04-05T08:03:02Z
owner: bjorn@stabell.org
---

# [x] Fix remaining 10 test failures from sel migration @km/silvery #bug #P2

10 test failures remain after cursorNodeId elimination. Root causes:

1. **ReactiveNodeStore cursor sync** (smart-p-toggle, 2 failures): cursor visual doesn't update — nodeStore.syncCursor() relies on the store bridge to detect cursor changes, but the bridge only bumps _selVersion without syncing reactive node state.

2. **Multi-selection extend** (clipboard, 1 failure): shift+ArrowDown extend doesn't work — likely keybinding doesn't resolve to sel.node.extend().

3. **Empty column copy** (clipboard, 1 failure): y on empty column should copy the heading but cursor may be null.

4. **Overflow indicators** (4 failures): silvery scroll indicator rendering — likely unrelated to selection but may be affected by layout cache invalidation timing.

5. **Windowing pane label** (1 failure): [1] showing in single-pane mode.

6. **Column scroll indicator** (1 failure): ▼ not showing when cards exceed viewport.

**Root fix**: Make viewTree a computed signal so sel tree source auto-updates (eliminates refreshSelTree). This is the Pattern 2 (DERIVED) approach from op-signal-boundary.md.