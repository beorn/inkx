---
mentions:
  - km
  - Bjørn
id: "@km/tui/actiontype-namespace"
aliases:
  - km-tui.actiontype-namespace
  - km-tui-actiontype-namespace
created_by: Bjørn Stabell
created_at: 2026-04-02T23:19:39Z
closed_at: 2026-04-02T23:23:16Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Extract ActionType namespace — unify 7 type guard sets into ActionType.is() @km/tui #task #P2 @Bjørn Stabell

7 bare ReadonlySet type guards (isVerbOp, isNavOp, etc.) not discoverable. Extract ActionType.is('verb', action). ~30 min.

