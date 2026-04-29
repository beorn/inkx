---
id: "@km/_orphan/o7ayx"
aliases:
  - km-o7ayx
created_by: claude:e4d16fec
created_at: 2026-03-17T20:39:15Z
closed_at: 2026-03-19T17:31:14Z
close_reason: "Fixed: DetailView children now render through Card +
  ScrollTrackingVirtualList (same as CardColumn). Exported Card/CardProps from
  CardColumn. Children get borders, fold indicators, virtualization. Test:
  detail-pane.slow.spec.ts (105 detail tests pass)."
owner: bjorn@stabell.org
assignee: claude:21c57d63
---

# [x] Unify detail view children with column card rendering @km/_orphan #task #P2 @claude:21c57d63

DetailView renders children as bare TreeNodes with remainingDepth=Infinity, separate from CardColumn's Card+VirtualList rendering. They should be unified: detail view children should render through the same Card infrastructure with proper fold indicators, fold/unfold, and virtualization. The metadata section (title+properties) stays unique to detail view.