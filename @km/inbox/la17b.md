---
mentions:
  - km
  - claude
id: "@km/inbox/la17b"
aliases:
  - km-la17b
  - "@km/_orphan/la17b"
created_by: claude:84903949
created_at: 2026-02-23T23:56:34Z
closed_at: 2026-03-04T12:44:43Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Web viewer: resize bug, layout shift, mouse events, source pane @km/_orphan #bug #P3 @claude:ee8efc0f

## Issues found in inkx web viewer (examples/web/viewer-app.tsx)

### 1. Layout Feedback doesn't update on resize (BUG)

`renderToXterm()` captures `cols`/`rows` once at creation time (xterm/index.ts:137-138). When `fitAddon.fit()` resizes the xterm terminal on window resize, `doRender()` still uses the stale captured values. Fix: read `terminal.cols`/`terminal.rows` in `doRender()` instead of captured const.

### 2. Focus Panels layout shifts on tab

Text content changes between panels: '● focused' (9 chars) vs '○' (1 char). With `flexGrow={1}`, flexx should distribute space equally, but the different min-content sizes cause the flex basis to shift. Investigate whether this is a flexx layout instability or expected behavior. May need explicit `flexBasis={0}` or fixed widths.

### 3. Scroll list should support mouse wheel

The simple ScrollShowcase doesn't use VirtualList — just manual `slice()`. VirtualList has built-in `onWheel` (interactive mode), but the xterm web adapter needs to forward browser wheel events through to inkx via SGR mouse protocol. Two sub-tasks: (a) replace ScrollShowcase with VirtualList, (b) wire wheel events in the xterm adapter.

### 4. Source pane not resizable

Source pane is fixed at 380px (CSS). No drag handle implemented. Should add a draggable resize divider between the terminal and source panes.

