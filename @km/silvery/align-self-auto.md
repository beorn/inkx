---
id: "@km/silvery/align-self-auto"
aliases:
  - km-silvery.align-self-auto
  - km-silvery-align-self-auto
created_by: claude:c9beade3
created_at: 2026-03-13T05:01:14Z
closed_at: 2026-03-13T05:16:49Z
close_reason: "Fixed: alignSelf=auto now explicitly calls
  layoutNode.setAlignSelf(c.ALIGN_AUTO) instead of being filtered out by the !==
  auto condition."
---

# [x] Bug: alignSelf=auto explicit prop doesn't reset in applyBoxProps() @km/silvery #bug #P1 @claude:65d845d9

In reconciler/nodes.ts applyBoxProps(), the alignSelf block checks props.alignSelf \!== 'auto' before setting. If new prop is explicitly 'auto' (not removed), it doesn't trigger the wasRemoved branch either. Leaves stale non-auto align-self.