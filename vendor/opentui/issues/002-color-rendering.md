# Issue 002: Named Colors Render Incorrectly

## Tracking

- **Upstream**: Not yet filed
- **Status**: Confirmed (still present in 0.1.74)
- **Filed**: N/A
- **Local bead**: km-3fmv (BLOCKED)

## Summary

Named color values like `"black"` render as incorrect colors (red/magenta) when used
as text foreground colors, particularly when combined with background colors.

This affects selection styling where we need `backgroundColor="cyan"` with `color="black"`
for readable text, but the black text renders as red/magenta instead.

## Environment

- macOS (Apple Silicon) - Darwin arm64
- Bun 1.3.6
- @opentui/core 0.1.74 (updated 2026-01-16)
- @opentui/react 0.1.74

## Reproduction

```bash
bun run ./002-repro.tsx
```

```tsx
// Expected: black text on cyan background
// Actual: red/magenta text on cyan background
<text backgroundColor="cyan" color="black">Should be black on cyan</text>
```

## Tested Approaches (All Failed)

| Approach | Code | Result |
|----------|------|--------|
| Named color | `color="black"` | Red/magenta text |
| Variable | `color={textColor}` where `textColor = "black"` | Red/magenta text |
| Hex color | `color="#000000"` | Red/magenta text |
| Different bg | `backgroundColor="white" color="black"` | Same issue |

## Workaround

Use `inverse` styling which swaps foreground/background colors:

```tsx
// Instead of:
<text backgroundColor="cyan" color="black">Selection</text>

// Use:
<text inverse>Selection</text>
```

**Limitation**: This doesn't solve cases where we need colored elements (like status
icons) within a selection highlight. The TreeNode component still has incorrect
selection text color.

## Affected Code

- `apps/km-tui/packages/km-opentui/src/components/TreeNode.tsx`
  - Selection state renders with wrong text color
  - Lines 276-308: Uses hex colors as attempted workaround (still broken)

- `apps/km-tui/packages/km-opentui/src/components/Header.tsx`
  - Workaround applied: Uses `inverse` styling instead of explicit colors

## Investigation Notes

The issue appears to be in OpenTUI's color rendering pipeline. Named colors are
mapped to ANSI codes, and something in that mapping or the underlying Zig renderer
is producing incorrect results for certain color combinations.

Hex colors (#000000) also fail, suggesting the issue is deeper than just the
named color lookup table.

## Upstream Search

- `gh search issues --repo anomalyco/opentui "color"` - No matching issues
- `gh search issues --repo anomalyco/opentui "black"` - No matching issues
- Issue #496 is about box background bleeding, not text color rendering

## Next Steps

1. [x] Create minimal reproduction
2. [x] Search upstream for existing reports - none found
3. [x] Update to latest (0.1.74) and verify bug persists - confirmed
4. [ ] File issue on anomalyco/opentui (need user permission)
5. [ ] Consider investigating the Zig renderer source
