---
id: "@km/inkx/no-globals"
aliases:
  - km-inkx.no-globals
  - km-inkx-no-globals
created_by: claude:d697f216
created_at: 2026-02-26T12:55:06Z
closed_at: 2026-03-01T07:58:24Z
---

# [x] Refactor inkx: eliminate module-level globals, pass config through create* factory functions @km/inkx #task #P2

Module-level globals to refactor into create* factory config:
- _caps in output-phase.ts (setOutputCaps)
- _textEmojiWide in unicode.ts (setTextEmojiWide)
- _textSizingEnabled in unicode.ts (setTextSizingEnabled)
- displayWidthCache in unicode.ts
- textPresentationEmojiCache in unicode.ts

These should be configuration on the renderer/app instance, not module-level state. Pass through createApp/createRuntime/render options.