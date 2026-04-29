---
id: "@km/silvery/with-keys-convention"
aliases:
  - km-silvery.with-keys-convention
  - km-silvery-with-keys-convention
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:17:52Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.with-keys-convention
    depends_on_id: km-silvery.authoring-elegance
    type: parent-child
    created_at: 2026-04-21T02:18:07Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [ ] withKeys() — honour definePlugin 'keys:' shorthand at runtime @km/silvery #feature #P2

blocks:: [[@km/silvery/authoring-elegance]]

definePlugin({ keys: { '?': 'toggle' } }) records the shorthand on the plugin handle, but no runtime honours it yet. Build a withKeys(plugin) convention plugin (or ag-react hook) that registers the keybindings with whichever key-routing plugin sits upstream in the pipe. Gate: a second dialog cutover (SearchDialog v2) uses keys: and the keybindings work end-to-end without manual wiring.