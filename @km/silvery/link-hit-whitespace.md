---
id: "@km/silvery/link-hit-whitespace"
aliases:
  - km-silvery.link-hit-whitespace
  - km-silvery-link-hit-whitespace
created_by: Bjørn Stabell
created_at: 2026-04-09T20:11:05Z
owner: bjorn@stabell.org
---

# [ ] Hit test whitespace claim + <Link> component — surgical fix for space-between-clickables @km/silvery #feature #P1

Tier A surgical fix for the clickable-text-wraps-badly class of bugs. See @km/silvery/inline-text-segments for the full /big analysis and Tier B architectural fix.

## Problem

Claude Code example:
<Text>Press <Text color=cyan onClick=arm>arm</Text> <Text color=cyan onClick=arm>now</Text> to continue</Text>

Hovering 'arm' arms the action. Hovering 'now' arms the action. Hovering the SPACE between 'arm' and 'now' does NOT. The space belongs to the outer Text which has no handler.

## Tier A fix (this bead, ~1 day)

Extend collectTextWithBg() in render-text.ts to produce ChildSpan ranges where end extends to the start of the next sibling's span, claiming interior whitespace. The inline hit test (findNodeAtScreenPosition + inlineRects in bound-term.ts) naturally finds the owning segment.

Edge cases to handle:
- Whitespace between two inner Texts with different handlers — assign to left or right? Match nearest handler (if only one has onClick, claim by that one)
- Whitespace at the start or end of the outer Text — claimed by first/last inner span only if it has a handler
- Nested nesting — apply recursively
- Preserve existing visual rendering (no style change; only hit region expands)

Plus: ship a canonical <Link onClick={...}>{children}</Link> component in silvery/ui that packages this behavior with the right API. Under the hood uses the whitespace-claim model today; will be upgraded to full segment model when Tier B lands.

## What it does NOT fix (that's Tier B)

- Long clickable text that wraps across lines (still atomic wrap unit)
- Per-word hover visuals with wrapping (still per-atomic-inner-Text)
- Multi-style wrapping generally

## Tests

- termless repro of the arm/now case — verify space fires onClick
- case variants: single-handler, both-handlers, neither-handler
- regression: existing inline-rects tests still pass

## Parent

@km/silvery/positioning

## See also

@km/silvery/inline-text-segments (Tier B, 1-2 weeks, architectural moat)