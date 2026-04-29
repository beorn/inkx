---
id: "@km/inkx/vertical-filler"
aliases:
  - km-inkx.vertical-filler
  - km-inkx-vertical-filler
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:37:59Z
closed_at: 2026-03-07T02:12:20Z
close_reason: "Grooming: merged into km-inkx.viewport-fill — same goal (pad
  inline mode to terminal bottom)"
---

# [x] VerticalFiller component — pad cursor to terminal bottom for inline scrollback @km/inkx #feature #P2

A component (or output-phase feature) that fills remaining rows between content bottom and terminal bottom with empty lines. This ensures the cursor is always at the last viewport row after each render, so useScrollback writes cause real terminal scrolling.

Replaces the need for height={termRows} on the root Box in inline mode. Content auto-sizes naturally, status bar sits right below content, and VerticalFiller pads the rest.

Usage:
```tsx
<Box flexDirection="column">
  <Header />
  <Content />
  <StatusBar />
  <VerticalFiller />  {/* pads to terminal bottom */}
</Box>
```

Alternative: implement as an output-phase option (e.g. mode: 'inline-pinned') that auto-pads after rendering.

Depends on: @km/silvery-legacy/cursor-query (to know initial cursor position for first render)