---
mentions:
  - km
  - Bjørn
id: "@km/silvery/vt-naming"
aliases:
  - km-silvery.vt-naming
  - km-silvery-vt-naming
created_by: Bjørn Stabell
created_at: 2026-04-02T21:07:47Z
closed_at: 2026-04-02T22:55:12Z
close_reason: |-
  Phase 0 complete — unified naming, deletions, and migration.

  Phase 0a: Renamed props (nav/cache/search/getKey/cursorKey/onCursor/unmounted/isCacheable/capacity/getText).
  Deleted 6 thin components (ScrollbackList, VirtualView, ScrollbackView, useScrollback, useScrollbackItem, SurfaceRegistry).

  Phase 0b: Migrated km-tui from VirtualList → ListView (5 view files).

  Phase 0c: Migrated all silvery examples/tests to ListView, deleted VirtualList.

  Quality: frozenCount→cachedCount, isFrozen→isCached, nearScrollback→nearCache, deprecated aliases deleted, SearchProvider rewritten with pluggable Searchable registration.

  Stats: ~6,500 lines removed, ~600 added, ~70 files touched across silvery + km-tui.
  Remaining: comment/docstring references to old names (cosmetic), PickerList/PickerDialog still use keyExtractor (deferred to km-silvery.pickerlist-v2).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Phase 0: Naming audit — unified glossary across ListView/cache/search @km/silvery #task #P1 @Bjørn Stabell

Apply unified naming glossary across all virtual terminal APIs. Phase 0 — do BEFORE building more API surface.

## Phase 0a: Rename props + delete thin wrappers (DONE)

### Renames

- history prop → cache (ListView)
- keyExtractor → getKey (VirtualList, HVList, ListView)
- isFrozen/freezeWhen/frozen → isCacheable
- maxHistory/maxRows → capacity
- navigable (bool) → nav (3-tier prop: bool/config/object)
- cursorIndex → cursorKey
- onCursorIndexChange → onCursor
- textAdapter.getItemText → search.getText (config tier) / auto (boolean tier)
- ListViewHistoryConfig → ListViewCacheConfig
- ListTextAdapter → ListViewSearchConfig
- interactive → nav (VirtualList)
- selectedIndex → cursorKey (VirtualList)
- onSelectionChange → onCursor (VirtualList)
- isSelected → isCursor (ItemMeta)
- onSelect stays (no rename)

### Deletions (components too thin / replaced)

- ScrollbackList (was literally return <ScrollbackView />)
- VirtualView (thin deprecated wrapper)
- ScrollbackView (replaced by ListView + TerminalCache)
- useScrollback (replaced by TerminalCache)
- useScrollbackItem (replaced by cache lifecycle)
- SurfaceRegistry (absorbed into SearchProvider → future search-machine)

### Glossary

- Live = items in React tree
- Cached = items in ListCache (ANSI snapshots)
- History = stored cached content
- Scrollback = native terminal scrollback only
- nav/cache/search = the three ListView prop names

## Phase 0b: Migrate @km/tui from VirtualList → ListView

@km/tui currently uses VirtualList (deprecated wrapper). Migrate all usages to ListView directly:

### Files to migrate

- apps/@km/tui/src/views/CardColumn.tsx — VirtualList → ListView
- apps/@km/tui/src/views/ColumnsView.tsx — VirtualList → ListView
- apps/@km/tui/src/views/ListView.tsx — VirtualList → ListView
- apps/@km/tui/src/views/TabsView.tsx — VirtualList → ListView
- apps/@km/tui/src/views/ScrollTracker.tsx — wraps VirtualList → wraps ListView
- apps/@km/tui/src/views/Board.tsx — HVList (keep, just uses getKey now)

### Key differences VirtualList → ListView

- itemHeight → estimateHeight (number or function signature changes)
- ItemMeta.isSelected → ListItemMeta.isCursor
- renderItem 3rd arg is optional in VL, required in LV
- VirtualList's interactive/selectedIndex/onSelectionChange already renamed to nav/cursorKey/onCursor

### Verify

- bunx tsc --noEmit | grep @km/tui → 0 errors
- bun vitest run apps/@km/tui/tests/ → all pass

## Phase 0c: Migrate silvery examples + delete VirtualList

### Migrate examples from ScrollbackList/VirtualList → ListView

- examples/apps/aichat/index.tsx — ScrollbackList → ListView + cache
- examples/scrollback-perf.tsx — ScrollbackList → ListView + cache
- examples/inline/scrollback.tsx — useScrollback → ListView + cache
- examples/viewer.tsx — check and update
- packages/examples/examples/apps/aichat/ — same as above
- examples/apps/panes/index.tsx — already migrated (Phase 0a)

### Delete VirtualList

After all consumers migrated to ListView, delete VirtualList.tsx. Only keeps its name if it has marketing value (it doesn't — ListView is the better name).

### Delete remaining old exports

- Remove VirtualList, VirtualListProps, VirtualListHandle, ItemMeta from exports.ts and components.ts
- Remove from silvery/ui barrel

### Update docs

- vendor/silvery/CLAUDE.md — update component references
- vendor/silvery/docs/ — update any guides referencing deleted components
- examples/CLAUDE.md — update example descriptions
- examples/index.md — update example registry

### Verify (complete)

grep for ALL old names → 0 hits:
  ScrollbackList, ScrollbackView, VirtualView, VirtualList (as component),
  useScrollback, useScrollbackItem, SurfaceRegistryProvider,
  keyExtractor, navigable (as prop), cursorIndex (as prop),
  onCursorIndexChange, ListViewHistoryConfig, ListTextAdapter,
  interactive (as prop on list), selectedIndex (as prop on list),
  onSelectionChange (as prop on list), isSelected (as ItemMeta field)

### Not deleted (has value)

- HorizontalVirtualList — no ListView equivalent yet, stays
- SearchBar — external component, stays
- SearchProvider — stays (future: absorbed by search-machine)

Estimate: ~2 days total across 0a/0b/0c. ~1,500 lines removed, ~100 lines added, ~60 files touched.

