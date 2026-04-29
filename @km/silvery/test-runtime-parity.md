---
id: "@km/silvery/test-runtime-parity"
aliases:
  - km-silvery.test-runtime-parity
  - km-silvery-test-runtime-parity
created_by: Bjørn Stabell
created_at: 2026-04-12T07:30:44Z
closed_at: 2026-04-12T08:16:19Z
close_reason: Deleted silvery layoutDirty tracking. Flexily isDirty() is sole
  layout gate. -90 lines, 13 files. Commit acfc7fd7.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.test-runtime-parity
    depends_on_id: km-silvery.layout-quality-plateau
    type: parent-child
    created_at: 2026-04-12T00:46:40Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Delete silvery layoutDirty — use Flexily root.isDirty() as sole gate @km/silvery #task #P0 @Bjørn Stabell

blocks:: [[@km/silvery/layout-quality-plateau]]

Silvery maintains a parallel dirty tracking system (layoutDirty + trackLayoutDirty + hasLayoutDirty) alongside Flexily's own _isDirty propagation. Every reconciler call site that sets silvery's layoutDirty also calls node.layoutNode.markDirty() — they always fire together. The two systems are redundant.

Flexily's dirty propagation is reliable: markDirty() walks up to root, calculateLayout() checks root._isDirty. This means silvery can replace hasLayoutDirty() with root.layoutNode.isDirty() and delete the entire silvery-side tracking.

Concrete bug this fixes: any code that sets a Flexily layout property via the adapter (setMaxWidth, setWidth, etc.) automatically makes the root dirty via Flexily's markDirty(). No need to separately set silvery's layoutDirty. The fitContentCorrectionPass bug (setting Flexily dirty but not silvery dirty) becomes impossible.

Changes:
1. layoutPhase: replace hasLayoutDirty() with root.layoutNode.isDirty() (keep hasScrollDirty separate — scroll doesn't affect Flexily)
2. ag.ts: same replacement
3. Delete trackLayoutDirty, hasLayoutDirty, clearLayoutDirtyTracking from dirty-tracking.ts
4. Remove layoutDirty = true assignments from host-config.ts (keep markDirty() calls)
5. Remove trackLayoutDirty() calls from host-config.ts and fitContentCorrectionPass

~-50 lines net deletion. Simplification, not addition.