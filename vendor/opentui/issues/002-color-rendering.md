# Issue 002: Text Color Ignored When backgroundColor Is Set

## Tracking

- **Upstream**: Not yet filed
- **Status**: Confirmed (still present in 0.1.74)
- **Filed**: N/A
- **Local bead**: km-3fmv (BLOCKED)

## Summary

When both `color` and `backgroundColor` props are set on a `<text>` element, the
`color` prop is completely ignored. All text renders as white regardless of the
specified foreground color.

**Key observation**: Colors work correctly when used alone (without backgroundColor).
The bug only manifests when both foreground and background colors are specified together.

See [002-screenshot.png](./002-screenshot.png) for visual evidence showing:

- WORKING: `<text color="red">` renders red text correctly
- BUG: `<text backgroundColor="cyan" color="black">` renders white text (not black)

## Environment

- macOS (Apple Silicon) - Darwin arm64
- Bun 1.3.6
- @opentui/core 0.1.74 (updated 2026-01-16)
- @opentui/react 0.1.74
- Terminal: Ghostty (true color support confirmed)

## Reproduction

```bash
bun run ./002-repro.tsx
```

```tsx
// Expected: black text on cyan background
// Actual: white text on cyan background (color prop ignored)
<text backgroundColor="cyan" color="black">
  Should be black on cyan
</text>
```

## Tested Approaches (All Failed)

| Approach     | Code                                            | Result               |
| ------------ | ----------------------------------------------- | -------------------- |
| Named color  | `color="black"`                                 | White text (ignored) |
| Variable     | `color={textColor}` where `textColor = "black"` | White text (ignored) |
| Hex color    | `color="#000000"`                               | White text (ignored) |
| Different bg | `backgroundColor="white" color="black"`         | White text (ignored) |
| Other colors | `color="red"`, `color="blue"`                   | All render as white  |

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

### Terminal Color Support Requirements

OpenTUI requires **true color (24-bit)** terminal support. From upstream documentation
and issue discussions:

- The Zig renderer outputs true color ANSI sequences (24-bit RGB)
- No graceful degradation for 256-color or 16-color terminals
- Using ANSI color indexes (0-15 palette) can cause crashes in some versions
- Web-based terminals (like ttyd) may not render OpenTUI properly

**This bug occurs even in true color terminals** (tested in Ghostty with full 24-bit
color support), so it's not a terminal capability issue.

### Related Upstream Issues

| Issue | Title                        | Relevance                                       |
| ----- | ---------------------------- | ----------------------------------------------- |
| #496  | Box background bleeding      | Different issue - about borders, not text color |
| #543  | Invalid borderStyle segfault | Related renderer bug (our issue 001)            |

No existing issues found matching this exact bug (foreground color ignored when
background is set).

### Web Terminal Compatibility (Updated 2026-01-16)

**ttyd/xterm.js DOES work with OpenTUI** when configured correctly:

```bash
COLORTERM=truecolor \
OTUI_USE_ALTERNATE_SCREEN=false \
ttyd -W -p 7681 bun km view -r /tmp/vault @next.md &
```

The key is `OTUI_USE_ALTERNATE_SCREEN=false` - xterm.js handles the alternate
screen buffer differently than native terminals. With this setting, OpenTUI
renders correctly in ttyd with full 24-bit color support.

See `.claude/skills/visual-test.md` for full documentation on headless TUI capture.

## Upstream Search

- `gh search issues --repo anomalyco/opentui "color"` - No matching issues
- `gh search issues --repo anomalyco/opentui "black"` - No matching issues
- `gh search issues --repo anomalyco/opentui "foreground"` - No matching issues
- `gh search issues --repo anomalyco/opentui "text color"` - No matching issues

## Root Cause Hypothesis

Based on investigation, the most likely cause is in the Zig renderer's ANSI sequence
generation. When both foreground and background colors are specified, the renderer
may be:

1. Setting background color correctly
2. Either skipping the foreground color entirely, OR
3. Setting foreground to default/white after setting background

The ANSI sequence for colored text with background should be:

```
\x1b[38;2;R;G;Bm  # Set foreground to RGB
\x1b[48;2;R;G;Bm  # Set background to RGB
```

If the renderer is outputting these in wrong order or omitting the foreground
sequence when background is present, it would explain the observed behavior.

## Next Steps

1. [x] Create minimal reproduction
2. [x] Search upstream for existing reports - none found
3. [x] Update to latest (0.1.74) and verify bug persists - confirmed
4. [x] Capture screenshot evidence
5. [x] Document terminal requirements and limitations
6. [ ] File issue on anomalyco/opentui (need user permission)
7. [ ] Consider investigating the Zig renderer source (`src/render/` in opentui repo)
