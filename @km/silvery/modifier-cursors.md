---
mentions:
  - km
id: "@km/silvery/modifier-cursors"
aliases:
  - km-silvery.modifier-cursors
  - km-silvery-modifier-cursors
created_by: claude:656602a3
created_at: 2026-03-16T21:40:27Z
closed_at: 2026-03-16T22:00:25Z
close_reason: useMouseCursor hook + Link pointer cursor on Cmd+hover. 8 tests. Docs updated.
owner: bjorn@stabell.org
---

# [x] Modifier-aware mouse cursors (Cmd=pointer, Alt=crosshair) @km/silvery #feature #P2

With useModifierKeys, components can change mouse cursor shape based on held modifiers. E.g., Cmd+hover shows pointer cursor over links, Alt+hover shows crosshair for selection. Uses setMouseCursorShape() already exported from silvery.

