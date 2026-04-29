---
id: "@km/tui1/5-improve-scroll-indicator-visibility"
aliases:
  - km-tui1.5
  - km-tui1-5
  - "@km/tui1/5"
created_at: 2026-01-16T23:46:21Z
closed_at: 2026-01-17T00:34:39Z
---

# [x] Improve scroll indicator visibility @km/tui1 #feature #P2

Improve the scroll indicator to make it more visible when content overflows.

## Current Behavior

TUI1 shows '--' at bottom-right of columns when more content exists below.

## Improvements

- [ ] Consider using a more visible indicator (e.g., ▼ or ↓)
- [ ] Add scroll percentage or position indicator
- [ ] Show indicator at top when scrolled down

## Files

- apps/@km/tui/packages/@km/_orphan/ink/src/views/ListView.tsx
- apps/@km/tui/packages/@km/_orphan/ink/src/views/ColumnsView.tsx