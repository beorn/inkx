---
id: "@km/silvery/plugin-authoring-doc"
aliases:
  - km-silvery.plugin-authoring-doc
  - km-silvery-plugin-authoring-doc
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:06:20Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.plugin-authoring-doc
    depends_on_id: km-silvery.authoring-elegance
    type: parent-child
    created_at: 2026-04-21T02:06:44Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [ ] Public plugin-authoring doc — walk external dev through HelpOverlay @km/silvery #task #P2

blocks:: [[@km/silvery/authoring-elegance]]

Target: external developer builds a working plugin from docs in <2h. Non-goal: reference any @km/_orphan/internal concept. Goal: definePlugin factory, useStore hook, one full example (help overlay) with keybindings. Gate depends on @km/silvery.definePlugin landing first. Filed from 2026-04-21 elegance review (cycle 1).