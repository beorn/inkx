---
id: "@km/silvery/ink-focus-adapter"
aliases:
  - km-silvery.ink-focus-adapter
  - km-silvery-ink-focus-adapter
created_by: claude:474834b0
created_at: 2026-03-10T19:37:00Z
closed_at: 2026-03-10T19:49:20Z
close_reason: Created withInkFocus() thin adapter in
  @silvery/compat/with-ink-focus. ~45 lines — wraps InkFocusProvider into
  standalone composable plugin.
---

# [x] withInkFocus() — thin adapter from Ink useFocus/useFocusManager to silvery FocusManager @km/silvery #task #P2 @claude:474834b0

Replace the 200-line InkFocusProvider with a thin adapter plugin. Ink's useFocus({ id }) registers with silvery's FocusManager. Ink's useFocusManager delegates to focusManager.focusNext/focusPrev. Remove inputEmitter option — silvery's withFocus() handles Tab/Escape. This is the hard one: bridging Ink's component-registered IDs with silvery's layout-tree-based focus nodes.