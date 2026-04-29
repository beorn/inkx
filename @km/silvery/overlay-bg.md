---
id: "@km/silvery/overlay-bg"
aliases:
  - km-silvery.overlay-bg
  - km-silvery-overlay-bg
created_by: claude:d697f216
created_at: 2026-02-25T20:30:04Z
closed_at: 2026-03-10T01:53:56Z
close_reason: "Implemented $default bg token (SGR 49). Changes: buffer.ts
  (DEFAULT_BG sentinel, isDefaultBg), render-helpers.ts (parseColor),
  output-phase.ts (styleToAnsi), buffer.ts CSS export. 7 tests in
  default-bg.test.tsx. Documented in reference/theming.md."
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Support default-bg for overlay elements (opaque dialogs without hardcoded color) @km/silvery #feature #P2 @claude:474834b0

When a dialog/popup uses position=absolute to overlay content, setting no backgroundColor makes the overlay transparent (underlying content shows through). Currently the only workaround is hardcoding backgroundColor='black' (km's overlayBg constant), which breaks on light terminal backgrounds.

hightea should provide a way to use the terminal's actual default background color for overlay elements so they appear opaque without hardcoding a color. Options:
1. OSC 11 query to detect terminal bg color at startup (see @km/silvery-legacy/osc11-bg)
2. A special token like 'default' or '' that resolves to the terminal's actual bg
3. An opaque={true} prop on Box that fills with the default bg
4. A layer/z-index system where position=absolute elements auto-fill their bg

Related: @km/silvery-legacy/osc11-bg (detect terminal bg), theme.ts overlayBg workaround