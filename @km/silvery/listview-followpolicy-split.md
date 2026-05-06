---
mentions:
  - km
  - claude
id: "@km/silvery/listview-followpolicy-split"
aliases:
  - km-silvery.listview-followpolicy-split
  - km-silvery-listview-followpolicy-split
created_by: claude:2405c72e
created_at: 2026-04-26T07:48:08Z
closed_at: 2026-04-26T08:42:01Z
close_reason: 'Shipped: silvery a238a0b1 + km f94f59079. follow="none"|"end"
  prop; atEnd computed in VISUAL ROW space (not item-based). silvercode
  MessageList migrated — dropped cursorKey={lastKey} pin. stickyBottom kept as
  one-cycle alias. 8 follow-end tests. Session: km-session.0425-evening'
started_at: 2026-04-26T08:11:44Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.listview-followpolicy-split
    depends_on_id: km-silvery.architectural-plateau
    type: parent-child
    created_at: 2026-04-26T00:48:08Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.architectural-plateau
---

# [x] ListView: split chat-follow policy from cursor (drop cursorKey={last} for stickyBottom-only) @km/silvery #feature #P2 @claude:2405c72e

blocks:: [[@km/silvery/architectural-plateau]]

Per /pro review 2026-04-26. Currently silvercode MessageList sets BOTH cursorKey={lastKey} AND stickyBottom={true}. Two scroll authorities (cursor ensure-visible + stickyBottom on grow) compete. atBottom logic uses item-based comparison (cursor === lastIdx) which is wrong — at-bottom should mean last visual ROW visible. Fix: introduce follow="none"|"end" prop; cursor stays selection-only (not scroll authority). silvercode adopts follow="end" and drops cursorKey pin. Depends on @km/silvery/listview-heightmodel-unify for accurate at-bottom detection.

