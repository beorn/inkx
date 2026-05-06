---
mentions:
  - km
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
6. Locator strictness: single-target ops throw on multiple matches (Playwright model)
7. Shrink TestApp surface:
- Cut aliases
- Move expect* methods to vitest matchers
- Demote dispatch() (prefer press/command which route through the real kb handler)
13. Vitest test.extend for typed fixtures + cleanup hooks
14. bell as counter → toBell() matcher (Pro finding #15)
15. Distinguish command() from press() semantically (Pro finding #16)
16. app.card(title) → app.node(id) for stable refs, card(title) convenience only (Pro finding #17)

## /complete criteria

- Structured UI-tree snapshot API shipped with tests
- Locator count>1 throws for single-target ops
- TestApp.dispatch() demoted (removed or marked internal)
- Vitest test.extend fixture pattern documented
- toBell() matcher shipped

blocks:: [[@km/infra/test-system]]

