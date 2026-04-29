---
id: "@km/tui2/2-file-opentui-upstream-issue-for-color-rendering-bu"
aliases:
  - km-tui2.2
  - km-tui2-2
  - "@km/tui2/2"
created_at: 2026-01-16T22:07:58Z
closed_at: 2026-01-17T00:07:25Z
---

# [x] File OpenTUI upstream issue for color rendering bug @km/tui2 #task #P1

**Blocker for TUI2 migration**

OpenTUI has a bug where text `color` prop is ignored when `backgroundColor` is set. All text renders as white.

**Reproduction**:
```tsx
<text backgroundColor="cyan" color="black">Should be black</text>
// Expected: black text on cyan background
// Actual: white text on cyan background
```

**Impact**: Blocks selection highlighting (@km/tui2/1-fix-selection-text-color-black-on-cyan)

**Action**: File issue on anomalyco/opentui GitHub repo

**Details**: vendor/opentui/issues/002-color-rendering.md