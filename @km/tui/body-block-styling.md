---
id: "@km/tui/body-block-styling"
aliases:
  - km-tui.body-block-styling
  - km-tui-body-block-styling
created_by: Bjørn Stabell
created_at: 2026-04-13T23:07:05Z
closed_at: 2026-04-14T05:11:18Z
close_reason: Shipped in 7ecea1808. Body blocks render flat with outline on
  cursor. Uses the silvery decoration phase.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.body-block-styling
    depends_on_id: km-silvery.outline-outside
    type: blocks
    created_at: 2026-04-13T16:07:05Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.body-block-styling
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-13T16:07:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Body blocks: borderless rendering with outside outline on cursor @km/tui #feature #P1

blocks:: [[@km/silvery/outline-outside]], [[@km/tui]]

Body blocks should render as flat text (no border) with text aligned to card content. On cursor/hover: outside outline appears in gap space (no layout shift). On edit: outline shows edit bounds. Depends on @km/silvery/outline-outside. Also needs: yieldTop/isPrevBodyBlock/isLastBodyBlock cleanup (old padding dance).