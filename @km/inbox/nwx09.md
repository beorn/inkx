---
mentions:
  - km
id: "@km/inbox/nwx09"
aliases:
  - km-nwx09
  - "@km/_orphan/nwx09"
created_at: 2026-02-02T18:23:37Z
closed_at: 2026-02-02T18:58:20Z
---

# [x] TUI columns: no vertical scroll indicator when column has overflow @km/_orphan #bug #P2

When a column has more items than fit vertically, there should be a visual indicator. This should be handled by inkx, not app code.

## Current Behavior

- inkx overflow='scroll' clips content but doesn't show indicators for borderless containers
- renderScrollIndicators in render-box.ts only works with borders

## Desired Behavior

```tsx
// Just works - inkx shows ▲/▼ automatically
<Box overflow='scroll' height={20}>
  {manyChildren}
</Box>

// Or with explicit control
<Box overflow='scroll' overflowIndicator>
  {children}
</Box>
```

## Solution

Part of @km/_orphan/89d2p overflow virtualization design. When overflow='scroll':

1. inkx already calculates hiddenAbove/hiddenBelow in scrollPhase
2. Render ▲/▼ indicators at content edges (not requiring borders)
3. Add overflowIndicator prop: 'auto' | 'always' | 'never' | custom render fn

This keeps app code clean - no manual indicator logic needed.

