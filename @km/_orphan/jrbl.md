---
id: "@km/_orphan/jrbl"
aliases:
  - km-jrbl
created_at: 2026-01-20T10:30:13Z
closed_at: 2026-01-20T10:47:33Z
---

# [x] Bottom bar content bleeding from cards @km/_orphan #bug #P1

## Description
In cards view, the first card's text ('✓ Review PR #123') bleeds onto the bottom bar line after the left content ('MEM REPO /tmp/test-vault').

## Symptoms
- Bottom bar shows: "MEM REPO /tmp/test-vault" + "iew PR #123" (remainder of card text)
- The card text appears dimmed (normal card style) on the bottom bar line
- Right side of bottom bar (" CARDS VIEW ") sometimes doesn't appear

## Investigation Notes
- Not a padding issue - tried full-width string rendering, backgroundColor, flexGrow spacer
- Not a diff algorithm issue - cells are compared correctly
- Suspicion: Card content is being rendered at y=termHeight-1 due to layout issue
- The content area has overflow="hidden" but clipping may not be working
- Manual height calculations (termHeight - 2) throughout the view code

## Related to
- @km/_orphan/pii3: Layout jumping (both may be caused by manual dimension calculations)
- User request to audit all manual size/dimension adjustments

## Reproduction
1. Run: `bun km view -r /tmp/test-vault @next.md --tui inkx`
2. Look at the bottom bar line
3. Card text from first column appears after the yellow "MEM REPO" text

## Technical Details
- Board.tsx uses `height={termHeight - 2}` for content area
- Column gets `height={termHeight - 2}`, then subtracts 2 more for header
- Cards have `flexShrink={0}` preventing size reduction
- inkx clips children with overflow="hidden" but not at layout level