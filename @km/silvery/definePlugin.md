---
mentions:
  - km
id: "@km/silvery/definePlugin"
aliases:
  - km-silvery.definePlugin
  - km-silvery-definePlugin
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:06:13Z
closed_at: 2026-04-21T19:06:16Z
close_reason: "Superseded by the pipe() + with*() + createSlice pattern
  validated in the aichat composition prototype
  (hub/silvery/pipe-with-composition-prototype.md). Feature plugins should be
  authored as with*() functions in the same shape as capability plugins
  (withFocus, withTerminal, withInput), using createSlice for typed state — NOT
  a parallel factory/registry. HelpOverlay v3 spike
  (hub/silvery/help-overlay.v3.ts, 56 code LOC) demonstrates the target shape.
  Next: migrate apps/km-tui/src/plugins/with-help-overlay.ts to v3 shape (see
  km-silvery.authoring-elegance follow-ups)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.definePlugin
    depends_on_id: km-silvery.authoring-elegance
    type: parent-child
    created_at: 2026-04-21T02:06:43Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.authoring-elegance
---

# [x] definePlugin() factory + useStore hook — the elegance unlock @km/silvery #feature #P1

blocks:: [[@km/silvery/authoring-elegance]]

Ship definePlugin({ name, state, ops, keys, effects? }) + useStore(plugin). Re-cutover HelpOverlay against it. Gate: HelpOverlay total LOC <= 50 across all files. Filed from 2026-04-21 elegance review (cycle 1) as the single highest-leverage change to reach Zustand/Solid-parity ergonomics. Blocks cycle-2 elegance review.

