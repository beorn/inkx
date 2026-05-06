---
mentions:
  - km
id: "@km/silvery/scrollback-v2"
aliases:
  - km-silvery.scrollback-v2
  - km-silvery-scrollback-v2
created_by: claude:da227cf4
created_at: 2026-03-12T20:47:25Z
closed_at: 2026-03-27T19:02:21Z
close_reason: "Grooming: superseded by km-silvery.virtual-terminal — ListView v5
  design explicitly replaces ScrollbackView"
owner: bjorn@stabell.org
---

# [x] ScrollbackView v2: virtual viewport with dynamic scrollback @km/silvery #feature #P2

Reimplement ScrollbackView to match the original viewport architecture design (recovered from deleted docs/design/viewport-architecture.md, commit fff9add).

## Original Design (What We Had)

The original architecture defined three zones:

```
Static scrollback  ← rendered final, data dropped (terminal owns)
─ ─ ─ ─ ─ ─ ─ ─ ─ ← static boundary (maxHistory)
Dynamic scrollback ← virtualized, data retained (silvery tracks, clear+redraw)
───────────────────
Screen/live        ← mounted React components
```

Three item lifecycle states: Live → Virtualized → Static

- **Live**: Mounted in React tree, normal rendering
- **Virtualized (Dynamic Scrollback)**: Rendered to string, data retained, can re-render on resize
- **Static**: Data dropped, terminal owns the scrollback

The viewport is LARGER than the screen. maxHeight controls dynamic scrollback size.

## Current Implementation (What We Ended Up With)

Simpler model: live or frozen. Frozen = permanent stdout write. No dynamic zone. Resize = nuke-and-redraw all. No viewport > screen. No "clear to" boundary.

## What's Missing

1. **Dynamic scrollback zone**: app-managed off-screen items, clear+redraw on change
2. **Freeze as optimization, not lifecycle**: pre-render for faster redraw, thaw on resize
3. **"Clear to" concept**: boundary — above is static, below can be cleared+redrawn
4. **Viewport > screen**: virtual viewport extends above visible screen
5. **Automatic freezing**: auto-freeze items that scroll off screen

## Reference

Original doc: git show fff9add -- docs/design/viewport-architecture.md (302 lines)
See vendor/silvery/docs/design/dynamic-scrollback.md for the new design doc.

