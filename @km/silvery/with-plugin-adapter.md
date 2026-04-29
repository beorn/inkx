---
id: "@km/silvery/with-plugin-adapter"
aliases:
  - km-silvery.with-plugin-adapter
  - km-silvery-with-plugin-adapter
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:17:57Z
closed_at: 2026-04-21T19:06:17Z
close_reason: Killed with parent km-silvery.definePlugin. pipe() + with*()
  composition already IS the app chain integration — no separate adapter needed.
  See hub/silvery/pipe-with-composition-prototype.md.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.with-plugin-adapter
    depends_on_id: km-silvery.authoring-elegance
    type: parent-child
    created_at: 2026-04-21T02:18:08Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] withPlugin(plugin) — wire definePlugin handle into the pipe() apply chain @km/silvery #feature #P2

blocks:: [[@km/silvery/authoring-elegance]]

definePlugin returns a zustand-shape handle today; consumers dispatch directly. Add a withPlugin(plugin) AppPlugin adapter so plugins compose via pipe() alongside withCommands/withKeybindings/etc. The adapter routes the plugin's apply into the BaseApp apply chain and drains returned effects (after @km/silvery/tea-apply-helpers lands). Gate: two plugins composed via pipe() with explicit precedence.