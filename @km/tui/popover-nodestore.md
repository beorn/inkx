---
mentions:
  - km
  - Bjørn
id: "@km/tui/popover-nodestore"
aliases:
  - km-tui.popover-nodestore
  - km-tui-popover-nodestore
created_by: Bjørn Stabell
created_at: 2026-04-14T06:30:12Z
closed_at: 2026-04-14T06:37:23Z
close_reason: "Wrapped buildNodePopoverContent's lazy render() in
  NodeStoreContext.Provider when callers supply a nodeStore.
  use-card-interaction grabs the pane store via useNodeStore() and passes it;
  useTreeInlineContext captures it for buildLinkPopover. PopoverNodeBody hoisted
  to a function component so the lazy DetailView require defers until React
  mounts. Test: apps/km-tui/tests/text/popover.test.ts (verified failing without
  the wrap, passing with). Commit ad1a1c7aa."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tui.popover-nodestore
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-13T23:30:15Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Popover render missing NodeStoreProvider → useNodeStore throws @km/tui #bug #P2 @Bjørn Stabell

blocks:: [[@km/tui]]

