---
mentions:
  - km
  - claude
id: "@km/tui/detail-pane-polish"
aliases:
  - km-tui.detail-pane-polish
  - km-tui-detail-pane-polish
created_by: claude:019d032d
created_at: 2026-04-23T03:57:35Z
closed_at: 2026-04-23T04:06:23Z
close_reason: "Shipped: commit 414d65169. Replaced $bg-cursor/$fg-cursor with
  canonical $selectionbg/$selection across DetailView (title + every DocNode
  branch) — fixes white-on-white in Nord-like themes and aligns with
  TreeNode/NodeView/CardColumn. Added paragraph marginBottom=1, paddingX on
  DocContent, maxWidth=80 for wide panes, H2 leading gap=2 with isFirst
  suppression, InlineCode variant='code' for subtle tint, stripInlineColors on
  the title cursor row. Popover inherits all changes via shared DocContent.
  Tests: 2511/2511 km-tui pass; 1595/1602 silvery (7 pre-existing fails
  unchanged); tsc 0 non-vendor errors."
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-tui.detail-pane-polish
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-22T20:57:55Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] DetailView: fix white-on-white cursor + paragraph spacing + align with selection model @km/tui #bug #P2 @claude:019d032d

blocks:: [[@km/tui]]

DetailView currently uses $bg-cursor/$fg-cursor (terminal cursor colors) for the cursor highlight — resolves to white-on-white in many themes, producing an unreadable block at the top of the pane. It also lacks paragraph spacing, right-edge padding, and H2 leading air. Fix by adopting the canonical @km/tui selection convention ($selectionbg/$selection + stripInlineColors) already used everywhere else (TreeNode, NodeView, CardColumn, Board). Same change applies to every DocNode branch so the detail pane and the link-hover popover (which reuses DocContent) both benefit. Also: paragraph marginBottom, paddingX on DocContent, height=2 above H2, skip leading gap on first child, switch InlineCode to variant='code' for a subtle tint.

