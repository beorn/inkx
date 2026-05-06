---
mentions:
  - km
id: "@km/tribe/hub"
aliases:
  - km-tribe.hub
  - km-tribe-hub
created_by: claude:19080504
created_at: 2026-03-23T07:02:06Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.hub
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T11:00:14Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [ ] Phase 4: Hub integration — bridge tribe with km agent system @km/tribe #feature #P4

blocks:: [[@km/tribe]]

Bridge tribe with km agent system: km agents register as tribe members, Hub TUI shows tribe sessions alongside km agents, unified work queue view.

