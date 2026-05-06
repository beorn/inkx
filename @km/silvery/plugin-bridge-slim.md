---
mentions:
  - km
id: "@km/silvery/plugin-bridge-slim"
aliases:
  - km-silvery.plugin-bridge-slim
  - km-silvery-plugin-bridge-slim
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:06:35Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.plugin-bridge-slim
    depends_on_id: km-silvery.authoring-elegance
    type: parent-child
    created_at: 2026-04-21T02:06:44Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.authoring-elegance
---

# [ ] Strip SearchDialogBridge of migration-only code; separate chrome from boilerplate @km/silvery #task #P2

blocks:: [[@km/silvery/authoring-elegance]]

After SearchDialog becomes source-of-truth (no dual-write), strip the legacy-prop branch from SearchDialogBridge.tsx (~70 of 172 LOC). Document the remaining ~100 LOC as legitimate dialog-chrome (focusScope, CenterDialog positioning) that is an app concern, not plugin boilerplate. This clarifies what definePlugin should collapse and what it shouldn't. Filed from 2026-04-21 elegance review (cycle 1).

