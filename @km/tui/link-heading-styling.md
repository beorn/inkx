---
id: "@km/tui/link-heading-styling"
aliases:
  - km-tui.link-heading-styling
  - km-tui-link-heading-styling
created_by: claude:ceb7c9cb
created_at: 2026-03-30T06:56:58Z
closed_at: 2026-03-30T07:38:14Z
close_reason: "Fixed: when a card title has ownColor (heading colors),
  colorOverride is now set to null, stripping link blue. Wikilinks in heading
  titles use the heading's own color with pill bg (#404050) for visual
  distinction instead of clashing blue text."
---

# [x] Wikilink + heading color interactions — link blue clashes with heading colors @km/tui #bug #P1

## Problem
When a card title or heading contains resolved [[wikilinks]], the link color (blue underline)
clashes with the heading color (H1 yellow, H2 accent, card title white). This creates a
jarring multi-color title where parts are blue and parts are white/yellow.

Example: "2021-12-27 Weekly review, Mar 13-19, 2020"
- "2021-12-27 Weekly review" = blue underline (resolved link)
- "Mar" = white (unresolved, now plain text)
- "13-19," = white (plain text)
- "2020" = white (unresolved)

## What we want
Titles should look cohesive. Options to explore:
1. **Pill style** — once @km/silvery/virtual-text-bg is fixed, use bg color for links in titles
2. **Color override** — strip link colors in H1/H2 titles, keep them in body text
3. **Subtle distinction** — bold without color change for title links, full color in body
4. **Italic** — use italic for links in titles instead of color

## Related
- @km/silvery/virtual-text-bg (P2) — backgroundColor on virtual text is broken, blocking pill style
- The popover H1 has the same issue
- Detail view H1 has the same issue
- Body text link colors are fine (blue on white/default bg)

## Context
Card titles at depth 0 already have colorOverride support (used for search highlight).
Could add a "title mode" colorOverride that strips link colors but keeps bold/underline.