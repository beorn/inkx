---
id: "@km/silvery/sel-p4-keyboard"
aliases:
  - km-silvery.sel-p4-keyboard
  - km-silvery-sel-p4-keyboard
created_by: Bjørn Stabell
created_at: 2026-04-03T21:38:42Z
closed_at: 2026-04-04T09:20:57Z
---

# [x] Selection Phase 4: Keyboard gestures @km/silvery #task #P1

Keyboard-driven selecting: j/k nav, shift-extend, Enter edit, Escape mode ladder.

## What changes
- `packages/silvery-selection/src/keyboard-gestures.ts` — NEW: keyboard event → Selecting.* dispatch
- `packages/silvery-selection/src/provider.tsx` — wire keyboard events

## Delete
Nothing — still additive.

## New tests
- `packages/silvery-selection/tests/keyboard-gestures.test.ts` — j/k, shift+j/k, Enter, Escape mode ladder, arrows in text mode

## Definition of Done
- [ ] All keyboard selecting kinds from design doc work
- [ ] Mode ladder: text → node → board via Escape
- [ ] Shift+j/k extend, Enter edit, arrow keys in text mode
- [ ] Tests pass

## /complete
- `bun vitest run packages/silvery-selection/tests/keyboard` → all pass