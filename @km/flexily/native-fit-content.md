---
mentions:
  - km
id: "@km/flexily/native-fit-content"
aliases:
  - km-flexily.native-fit-content
  - km-flexily-native-fit-content
created_by: Bjørn Stabell
created_at: 2026-04-12T07:31:04Z
closed_at: 2026-04-12T08:51:24Z
close_reason: Flexily native fit-content/snug-content (UNIT_FIT_CONTENT,
  UNIT_SNUG_CONTENT). 10 new tests, 1572+1215 pass. Silvery measure-phase
  simplified (correction pass now no-op). Flexily commit 4752c6f, silvery commit
  f695b6b2.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-flexily.native-fit-content
    depends_on_id: km-silvery.layout-quality-plateau
    type: parent-child
    created_at: 2026-04-12T00:46:43Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-flexily.native-fit-content
    depends_on_id: km-silvery.strict-layout-overflow
    type: blocks
    created_at: 2026-04-12T00:46:39Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.layout-quality-plateau
      - type: link
        target: km-silvery.strict-layout-overflow
---

# [x] Flexily native fit-content width mode — eliminate measure/correction passes @km/flexily #feature #P2

blocks:: [[@km/silvery/layout-quality-plateau]], [[@km/silvery/strict-layout-overflow]]

Move fit-content/snug-content into Flexily as native width modes. This is the quality plateau — eliminates the entire measure-phase polyfill (measureIntrinsicSize, computeSnugContentWidth, fitContentCorrectionPass, findAncestorDefiniteWidth), the correction pass, and the dirty-flag sync issue that caused this session's main bug.

When Flexily handles fit-content natively:

- min(max-content, available) computed during flex pass with real parent width
- No pre-layout measurement needed
- No post-layout correction pass
- No dirty-flag sync between silvery and Flexily
- snug-content binary search runs inside the layout engine with correct constraints
- Text re-wrapping at allocated width happens via existing measure function

~200 lines in vendor/flexily/src/classic/layout.ts. Add SIZING_FIT_CONTENT and SIZING_SNUG_CONTENT modes. The measure-phase polyfill (~290 lines) gets deleted.

Real consumers: Toast, ModalDialog, Tooltip (silvery components), text-layout demo.

Prior art: CSS fit-content = min(max-content, max(min-content, stretch-fit-size)). Chromium LayoutNG computes intrinsic sizes lazily during layout traversal.

