---
mentions:
  - km
id: "@km/silvery/color-level-unused"
aliases:
  - km-silvery.color-level-unused
  - km-silvery-color-level-unused
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:12Z
closed_at: 2026-03-13T05:18:38Z
close_reason: "Deferred: Missing feature (color downgrading), not a bug. Modern
  terminals universally support truecolor. Would need RGB→ANSI256→ANSI16
  conversion functions. Low value for current use cases."
owner: bjorn@stabell.org
---

# [x] Bug: colorLevel capability declared but never used — color downgrading broken @km/silvery #bug #P3

OutputCaps includes colorLevel but it's never checked in fgColorCode, bgColorCode, styleToAnsi, or styleTransition. Docs/caps imply color downgrading support that doesn't exist.

