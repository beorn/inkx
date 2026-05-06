---
mentions:
  - silvery
  - km
id: "@km/silvery/web-platform-gap"
aliases:
  - km-silvery.web-platform-gap
  - km-silvery-web-platform-gap
created_by: claude:e4e70c9a
created_at: 2026-03-15T07:21:15Z
closed_at: 2026-03-19T16:43:58Z
close_reason: "Grooming: empty epic with 0 children, no defined scope. Recreate
  with actual tasks when work materializes."
owner: bjorn@stabell.org
---

# [x] Close @silvery/web platform gap: abstract model must cover web capabilities @km/silvery #epic #P3

The abstract silvery component model (Box, Text, etc.) currently lacks several capabilities that native web provides. Each gap should be closed by extending the abstract model — not by adding platform-specific escape hatches.

## Gaps (by severity)

### High

- **CSS Grid**: Box only supports flexbox. Add grid layout props. @silvery/term emulates via flexily; @silvery/web passes through to native CSS Grid.
- **Animations/Transitions**: No transition/animation props. Add animation system. @silvery/term implements frame-by-frame; @silvery/web uses CSS transitions.
- **Accessibility**: No ARIA roles, labels, live regions. Add role/aria-* props. @silvery/term ignores; @silvery/web passes through.

### Medium

- **Form elements**: TextInput/SelectList exist but are custom. On web, could delegate to native elements for a11y + mobile keyboard.
- **SVG/Vector**: No SVG primitives. @silvery/term renders as box-drawing/braille; @silvery/web renders real SVG.
- **Rich text**: Text is flat — no inline formatting (em, strong, a). Add inline formatting nodes.
- **Images**: No image component. @silvery/term renders sixel/kitty/ASCII; @silvery/web renders <img>.

### Low

- **CSS escape hatch**: Can't apply arbitrary CSS on web. Add className/style for web platform.
- **Responsive breakpoints**: useContentRect() exists but no media queries.
- **Scroll snap/smooth**: No CSS scroll-snap support.
- **Pointer events**: Limited abstract pointer event vocabulary.

## Design Principle

Every gap is closed by extending the abstract component model. If a capability can't be reasonably abstracted, it belongs in platform-specific code. The abstract model is the floor, not the ceiling — platforms can always enhance (progressive enhancement).

