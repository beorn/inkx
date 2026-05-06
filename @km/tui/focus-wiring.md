---
mentions:
  - km
  - claude
id: "@km/tui/focus-wiring"
aliases:
  - km-tui.focus-wiring
  - km-tui-focus-wiring
created_by: claude:d3a7049b
created_at: 2026-02-21T16:18:55Z
closed_at: 2026-02-21T16:33:00Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Wire focusable/testID into render tree, remove fallbacks @km/tui #task #P1 @claude:d3a7049b

The focus system infrastructure is 100% complete in inkx, but the @km/tui render tree hasn't been decorated with focus props. Everything operates in fallback/compatibility mode.

## Current state (transitional shims)

1. **Virtual focus with fake nodes** (driver.ts:286-300) — ctx.focus('board-area') creates fake {props:{testID}, children:[], parent:null} objects and passes them with `as any`. No real DOM node is focused.
2. **DetailPane `|| focused` prop fallback** (DetailPane.tsx:54) — `hookFocused || focused` where hookFocused is always false because no testID='detail-pane' focusable Box exists. The prop drives the UI.
3. **CardColumn `|| activeId \!== 'detail-pane'` fallback** (CardColumn.tsx:171,610) — useFocusWithin('board-area') always returns false. Falls back to string comparison.
4. **No focusable/testID props** in the render tree — zero occurrences of `focusable` in views/.

## Tasks

1. Add `testID='board-area' focusable` to board area Box in Board.tsx
2. Add `testID='detail-pane' focusable` to detail pane wrapper Box
3. Remove `focused` prop from DetailPane — let useFocusable() be sole source
4. Remove `|| fallback` patterns in CardColumn
5. Remove getFakeNode / virtual focus hack in driver.ts — use focusManager.focusById() instead
6. Update tests that pass focused prop or check focusedPane
7. InputLayerProvider stays (different concern from focusScope — see notes)

## InputLayerProvider analysis

InputLayerProvider is NOT redundant with focusScope. They solve different problems:

- **focusScope** = Tab traversal boundary (where can Tab go next?)
- **InputLayerProvider** = key handler isolation stack (who processes this keypress?)

The command system operates at the `term:key` level (before DOM event dispatch). InputLayerProvider intercepts keys at that level. For focusScope/onKeyDown to replace it, the entire command system would need to migrate from term:key to component-level onKeyDown — that's a separate, larger migration (future phase).

