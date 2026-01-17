# OpenTUI Issue: Named Colors Render Incorrectly

## Status

**Filed**: Not yet (need to create minimal repro first)
**Workaround**: Use `inverse` styling instead of explicit background/foreground colors

## Environment

- OS: macOS (Apple Silicon) - Darwin arm64
- Runtime: Bun 1.3.6
- @opentui/core: 0.1.73
- @opentui/react: 0.1.73

## Description

Named color values like `"black"` render as incorrect colors (red/magenta) when used
as text foreground colors, particularly when combined with background colors.

This affects selection styling where we need `backgroundColor="cyan"` with `color="black"`
for readable text, but the black text renders as red/magenta instead.

## Reproduction

```tsx
// See vendor/opentui/repro-color.tsx
<text backgroundColor="cyan" color="black">Should be black on cyan</text>
```

**Expected**: Black text on cyan background
**Actual**: Red/magenta text on cyan background

## Tested Approaches (All Failed)

1. **Named color**: `color="black"` - renders as red/magenta
2. **Variable**: `const textColor = "black"; color={textColor}` - same issue
3. **Hex color**: `color="#000000"` - same issue
4. **Different background**: Same issue with `backgroundColor="white"`

## Workaround Applied

Use `inverse` styling which swaps foreground/background colors. This avoids the
explicit color specification bug:

```tsx
// Instead of:
<text backgroundColor="cyan" color="black">Selection</text>

// Use:
<text inverse>Selection</text>
```

This works for the header bar but doesn't solve the TreeNode selection issue where
we need colored status icons within the selection highlight.

## Affected Code

- `apps/km-tui/packages/km-opentui/src/components/TreeNode.tsx`
  - Selection state renders with wrong text color
  - Lines 276-308: Uses hex colors `#00ffff` and `#000000` as attempted workaround

- `apps/km-tui/packages/km-opentui/src/components/Header.tsx`
  - Workaround applied: Uses `inverse` styling instead of explicit colors

## Related Beads

- km-3fmv: "Fix selection text color (red→black)" - BLOCKED on this upstream issue

## Investigation Notes

The issue appears to be in OpenTUI's color rendering pipeline. Named colors are
mapped to ANSI codes, and something in that mapping or the underlying Zig renderer
is producing incorrect results for certain color combinations.

Hex colors (#000000) also fail, suggesting the issue is deeper than just the
named color lookup table.

## Searches Performed

- `gh search issues --repo anomalyco/opentui "color"` - No matching issues found
- `gh search issues --repo anomalyco/opentui "black"` - No matching issues found
- Issue #496 is about box background bleeding, not text color rendering

## Next Steps

1. [x] Create minimal reproduction (repro-color.tsx)
2. [x] Search OpenTUI GitHub for existing reports - none found
3. [ ] Run repro in real TTY to capture screenshot for bug report
4. [ ] File issue on anomalyco/opentui (need user permission)
5. [ ] Consider investigating the Zig renderer source
