---
id: "@km/inkx/layered-arch"
aliases:
  - km-inkx.layered-arch
  - km-inkx-layered-arch
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:23Z
closed_at: 2026-02-23T11:42:08Z
---

# [x] Restructure inkx into layered entry points (minimal core + extensions) @km/inkx #task #P2 @claude:ee8efc0f

Restructure inkx into layered entry points: minimal Ink-compatible core + opt-in extensions.

## Motivation
inkx currently exports 161 symbols from a single entry point. For someone who just wants "ink but faster", this is overwhelming. A layered architecture makes the core approachable (just Box, Text, render — like Ink) while keeping advanced features available as explicit imports.

## Proposed layers (from architecture analysis, Feb 2026)

### Tier 1: Core (19 files) — "inkx" entry point
Ink-compatible surface: Box, Text, Newline, Spacer, Static, Transform, render, useInput, useApp, useStdin, useStdout, useStderr, measureElement (alias for useContentRect)
Goal: drop-in Ink replacement, nothing more.

### Tier 2: Layout Feedback — "inkx/layout"
useContentRect, useScreenRect — the key differentiator over Ink.

### Tier 3: Components — "inkx/components"
VirtualList, Table, SelectList, TextInput, ReadlineInput, ProgressBar, Spinner, StatusBar, Scrollbar, Fill, Indent, OverflowContainer, HorizontalRule

### Tier 4: Focus — "inkx/focus"
FocusManager, useFocusable, InputLayer, FocusContext

### Tier 5: Input Protocols — "inkx/input"
Mouse, Clipboard, Kitty keyboard, Bracketed paste

### Tier 6+: Optional extensions
- "inkx/theme" — ThemeProvider, useTheme
- "inkx/animation" — useAnimation, AnimatedText, spring/lerp
- "inkx/images" — Image (Kitty/Sixel)
- "inkx/testing" — createRenderer, locator, buffer assertions
- "inkx/plugins" — plugin system, command registry

## Breaking changes needed
1. Theme tokens in Box/Text — currently Box reads theme for default styles. Core should work without theme.
2. Inspector/devtools — currently always available. Move to extension.
3. ErrorBoundary — currently auto-wraps. Make optional or keep in core.

## Key constraint
Main "inkx" entry should still re-export everything for backwards compatibility. Layered imports are additive — they don't remove the flat import path.

## Bundle impact
Tree-shakeable layers mean consumers who only use core get a much smaller bundle. Currently the full 2.2MB dist ships even if you only use Box and Text.

## Related
- @km/silvery-legacy/bundle-audit (measure before/after)
- @km/silvery-legacy/npm-publish (exports map depends on this)