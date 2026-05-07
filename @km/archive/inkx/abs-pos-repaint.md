---
mentions:
  - km
  - claude
id: "@km/inkx/abs-pos-repaint"
aliases:
  - km-inkx.abs-pos-repaint
  - km-inkx-abs-pos-repaint
created_at: 2026-02-09T09:17:36Z
closed_at: 2026-02-09T17:35:14Z
assignee: claude:dffe6eeb
---

# [x] Incremental rendering skips absolute-positioned elements when siblings change @km/inkx #bug #P2 @claude:dffe6eeb

When board content changes (e.g., typing in search dialog), absolute-positioned dialog elements with unchanged React content don't get repainted. All dirty flags are false on the dialog's title node, so the incremental fast-path skips it entirely.

INKX_STRICT=1 confirms: IncrementalRenderMismatchError at the dialog title position — incremental shows space, fresh shows the correct character.

Root cause: renderer.ts incremental rendering doesn't propagate dirty flags to absolute-positioned siblings when content changes in the normal flow.

Workaround: testEnv now uses incremental: false. Production still has this bug (visible when typing in search dialog — title flickers).

Blocker for enabling INKX_STRICT=1 globally in tests.

