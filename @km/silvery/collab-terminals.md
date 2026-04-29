---
id: "@km/silvery/collab-terminals"
aliases:
  - km-silvery.collab-terminals
  - km-silvery-collab-terminals
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:32:09Z
owner: bjorn@stabell.org
---

# [ ] Collaborative/multiplayer terminal sessions @km/silvery #feature #P4

Explore shared-state terminal sessions where multiple users (or AI + human) co-control a TUI:

- Runtime syncs state and events over network
- Input events broadcast to multiple terminals
- Shared cursor / shared model state
- Use case: pair programming in TUI, AI+human shared control

Far-future feature. Built on Silvery's runtime/app separation — the runtime could broadcast updates. Warp (terminal) has some collaborative features, but no open framework provides this.

Low priority — explore when runtime architecture stabilizes.