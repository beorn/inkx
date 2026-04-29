---
id: "@km/silvery/examples-explorer"
aliases:
  - km-silvery.examples-explorer
  - km-silvery-examples-explorer
created_by: claude:73d7a332
created_at: 2026-03-12T16:33:36Z
---

# [ ] Example: explorer (log viewer, VirtualList 2000+ rows, search) @km/silvery #task #P3

Example: explorer — Log viewer with VirtualList, search, filtering

## What It Demonstrates
- VirtualList with 2000+ rows (virtualized scrolling)
- Real-time search/filter with TextInput
- Severity-level coloring (INFO/WARN/ERROR/DEBUG)
- Responsive column layout
- Live data updates (simulated log stream)

## Status: NEW (combine data-explorer + dev-tools)

## Source Material
Combine features from existing examples:
- interactive/dev-tools.tsx (Log Viewer — severity levels, VirtualList, keyboard-driven log injection)
- interactive/data-explorer.tsx (Process Explorer — search, VirtualList, responsive columns, useDeferredValue)
- interactive/search-filter.tsx (Search Filter — useTransition + useDeferredValue for concurrent search)

## Tabs
1. Logs — streaming log viewer with level filtering (from dev-tools.tsx)
2. Processes — sortable data table with live metrics (from data-explorer.tsx)

## Key Components
- VirtualList (interactive=true, 2000+ items)
- TextInput (search/filter)
- useContentRect() (responsive columns)
- useDeferredValue (non-blocking search)
- useInput (keyboard navigation)

## Implementation Notes
- ExampleMeta: name="Explorer", description="Log viewer and process explorer with VirtualList search"
- features: ["VirtualList", "TextInput", "useContentRect()", "useDeferredValue", "2000+ rows"]
- File: examples/interactive/explorer.tsx
- Generate realistic fake log data (timestamps, levels, service names, messages)
- Tab 1: ~2000 log lines, filter by level (INFO/WARN/ERROR) and text search
- Tab 2: ~50 processes with CPU/MEM jitter, sortable columns
- Both tabs share the search TextInput at top