---
mentions:
  - km
id: "@km/infra/test-system/p6-api"
aliases:
  - @km/infra/test-system.p6-api
  - @km/infra/test-system-p6-api
created_by: Bjørn Stabell
created_at: 2026-04-18T07:45:31Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: @km/infra/test-system.p6-api
    depends_on_id: @km/infra/test-system
    type: parent-child
    created_at: 2026-04-18T00:46:13Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/infra/test-system"
---

# [ ] Phase 6: TestApp API refinement — shrink surface, improve ergonomics @km/all #task #P2

blocks:: [[@km/infra/test-system]]

## Goal

Refine the TestApp API based on Pro review findings. Less surface area, sharper signals, better failure messages.

## Items (from parent bead @km/infra/test-system Phase 6 + Pro review)

1. Structured UI-tree snapshots (like Playwright ARIA snapshots)
  - Snapshot the semantic tree (board > column > card [cursor]), not raw terminal cells
  - Raw snapshots only for renderer-specific tests
  - Format:
     view=cards focus=board overlay=null
    > column: col1
    > task: task1 [cursor]
    > task: task2
2. Locator strictness: single-target ops throw on multiple matches (Playwright model)
3. Shrink TestApp surface:
  - Cut aliases
  - Move expect* methods to vitest matchers
  - Demote dispatch() (prefer press/command which route through the real kb handler)
4. Vitest test.extend for typed fixtures + cleanup hooks
5. bell as counter → toBell() matcher (Pro finding #15)
6. Distinguish command() from press() semantically (Pro finding #16)
7. app.card(title) → app.node(id) for stable refs, card(title) convenience only (Pro finding #17)

## /complete criteria

- Structured UI-tree snapshot API shipped with tests
- Locator count>1 throws for single-target ops
- TestApp.dispatch() demoted (removed or marked internal)
- Vitest test.extend fixture pattern documented
- toBell() matcher shipped

blocks:: [[@km/infra/test-system]]

