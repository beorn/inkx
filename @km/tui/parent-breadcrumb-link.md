---
mentions:
  - km
id: "@km/tui/parent-breadcrumb-link"
aliases:
  - km-tui.parent-breadcrumb-link
  - km-tui-parent-breadcrumb-link
created_by: claude:656602a3
created_at: 2026-03-17T06:45:13Z
closed_at: 2026-03-17T07:01:22Z
close_reason: "Implemented navigable parent breadcrumb links. Changes: (1) Added
  nodeId to ParentContextResult in km-tree/display.ts, (2) TreeNode.tsx computes
  parentNodeId alongside parentContext and wraps in <Link href='km://node/{id}'>
  for both multiline and oneliner variants, (3) NodeView.tsx NodeCardView
  accepts parentNodeId prop and wraps parent context in Link, (4) BoardApp wires
  useLinkOpen with onInternalLink handler that parses km://node/ URLs and
  dispatches navigateToNode (SELECT/ZOOM_IN/DETAIL_VIEW). All existing tests
  pass, no new type errors."
owner: bjorn@stabell.org
---

# [x] Make all embedded node references navigable Links (parent breadcrumb, block refs, wiki links) @km/tui #feature #P2

All references to other nodes in card content should be <Link href='km://node/nodeId'>:

- Parent breadcrumb above embedded nodes → navigate to parent
- Block references → navigate to referenced block
- Wiki links → navigate to linked node
- Any node title shown as cross-reference

On Cmd+hover: underline + pointer cursor. On Cmd+click: navigate to that node (zoom/select).

Uses existing Link infrastructure (inline rects, modifier tracking, link:open event). The useLinkOpen hook handles km:// URLs by dispatching navigation actions.

