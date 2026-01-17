# Issue 002: Named Colors Render Incorrectly

## Tracking

- **Upstream**: Not yet filed
- **Status**: Confirmed (still present in 0.1.74)
- **Filed**: N/A
- **Local bead**: km-3fmv (BLOCKED)

## Summary

Named color values like `"black"` are ignored when used as text foreground colors
with a background color - text renders as white regardless of the `color` prop.

This affects selection styling where we need `backgroundColor="cyan"` with `color="black"`
for readable text, but the text renders as white instead of black.

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
// Actual: white text on cyan background (color prop ignored)
<text backgroundColor="cyan" color="black">Should be black on cyan</text>
```

## Tested Approaches (All Failed)

| Approach | Code | Result |
|----------|------|--------|
| Named color | `color="black"` | White text (ignored) |
| Variable | `color={textColor}` where `textColor = "black"` | White text (ignored) |
| Hex color | `color="#000000"` | White text (ignored) |
| Different bg | `backgroundColor="white" color="black"` | White text (ignored) |
| Other colors | `color="red"`, `color="blue"` | All render as white |

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

The `color` prop appears to be completely ignored when `backgroundColor` is set.
All text renders as white regardless of the specified foreground color.

This suggests the Zig renderer may be:
1. Not applying the foreground color when a background is set
2. Overwriting the foreground with a default (white) after setting background
3. Using incorrect ANSI sequence ordering

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
