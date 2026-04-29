---
id: "@km/silvery/osc66-emoji"
aliases:
  - km-silvery.osc66-emoji
  - km-silvery-osc66-emoji
created_by: claude:55df8ef1
created_at: 2026-03-10T05:16:01Z
closed_at: 2026-03-10T15:36:57Z
close_reason: Extended OSC 66 to text-presentation emoji. Exported
  isTextPresentationEmoji, extended wrapTextSizing in output-phase.ts.
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Extend OSC 66 text sizing to cover emoji width discrepancies @km/silvery #task #P2 @claude:55df8ef1

OSC 66 currently only handles PUA characters (nerdfont icons). Standard emoji (📖, ✏️, ⚡) can have ambiguous width between string-width and terminal renderers (especially xterm.js). displayWidth() should be the single source of truth, and OSC 66 should enforce width for ANY character where the terminal might disagree — not just PUA. This eliminates the need for ASCII workarounds in web showcases.