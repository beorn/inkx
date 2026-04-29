---
id: "@km/_orphan/fhzx"
aliases:
  - km-fhzx
created_at: 2026-01-15T12:39:44Z
closed_at: 2026-01-16T08:00:23Z
---

# [x] Phase 5: Add mouse support (DEFERRED - keyboard-focused user) @km/_orphan #feature #P4

# Phase 5: Add mouse support (DEFERRED)

**User is keyboard-focused, so this is low priority.**

## Design Challenge: Drag Semantics

Terminal mouse drag has TWO possible meanings:
1. **Text selection** - drag to select text (copy-paste)
2. **Card drag-drop** - drag to reorder/move cards

### Current TUI1 Approach
Uses SGR extended mouse mode with SelectionManager class:
- Left-click-drag = select cards (range selection by row)
- Selection based on Y coordinates (rows), not actual text
- Does NOT support text copy-paste (cards are selected, not text)

### Implementation Options for TUI2

**Option A: Card-centric (like TUI1)**
- Drag = select cards in range
- No text selection support
- Simpler to implement

**Option B: Mode-based**
- Normal drag = card selection
- Shift+drag = text selection (if OpenTUI supports)
- More complex

**Option C: Click-target detection**
- Drag on card = move card
- Drag on text = select text
- Requires hit-testing which card/element was clicked

### OpenTUI Mouse Capabilities
From docs: onMouseDown, onMouseUp, onMouse, onMouseDrag, onMouseDragEnd, onMouseDrop

Likely supports Option A natively. Need to test if text selection is possible.

## Tasks (when prioritized)
1. Test OpenTUI mouse event capabilities
2. Decide on drag semantics (A, B, or C)
3. Implement click to select card
4. Implement drag to select range
5. Implement scroll wheel
6. (Optional) Implement card drag-drop reordering