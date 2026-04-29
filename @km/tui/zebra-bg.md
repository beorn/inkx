---
id: "@km/tui/zebra-bg"
aliases:
  - km-tui.zebra-bg
  - km-tui-zebra-bg
created_by: Bjørn Stabell
created_at: 2026-04-09T06:27:54Z
closed_at: 2026-04-09T06:43:50Z
close_reason: "Root cause: cursor ID included in selection set →
  expandSelectionWithDescendants marked all card children as multi-selected →
  depth-1 items got multiSelectedBg (14%) while depth-2+ inherited selectedBg
  (6%). Fix: exclude cursor from selectedSet before hydrate/setSelection. Commit
  f4454fbe5."
---

# [x] Zebra pattern — section heading bg stacks with card selectedBg @km/tui #bug #P0

## Bug

When cursor is on a card, the card gets selectedBg (6% primary blend). But section headings (§) within the card render with a different bg than leaf items — creating alternating tinted/untinted rows (zebra pattern).

## Reproduction

Termless tests in apps/@km/tui/tests/card-bg-inheritance.test.ts (3 failing):
- Section1 bg: {r:72, g:73, b:75}
- sub-item bg: {r:57, g:61, b:69}

User sees this in real km with Floating Shelves vault.

## Root Cause (suspected)

Section heading nodes (type "h", §) render with their own bg that stacks on top of the card container's selectedBg. Regular items (type "li") inherit the card bg transparently. The double-blend on sections vs single-blend on items creates the zebra.

## Related

- Card bg priority fix: cursor cards now get selectedBg (6%) not multiSelectedBg (14%) — commit 20eb2a303
- CardColumn cursorInDescendant tint — commit e86c66642

## /complete

\`\`\`bash
bun vitest run apps/km-tui/tests/card-bg-inheritance.test.ts  # all 4 pass (0 failures)
\`\`\`