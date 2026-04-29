---
id: "@km/_orphan/inkx-keys"
aliases:
  - km-inkx-keys
created_at: 2026-02-01T23:18:59Z
closed_at: 2026-02-01T23:29:22Z
---

# [x] inkx-loop: Port key parsing from old useInput @km/_orphan #task #P1 @claude:5fa2decc

The new useInput hook only provides raw key strings and basic modifiers (ctrl, meta, shift).

The old useInput has rich Key interface with:
- upArrow, downArrow, leftArrow, rightArrow
- pageDown, pageUp, home, end
- return, escape, tab, backspace, delete

Port the key parsing logic from src/hooks/useInput.ts to the new runtime.

Parent: @km/_orphan/silvery-legacy-loop