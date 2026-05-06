---
mentions:
  - km
id: "@km/tui/slow-folder-discovery"
aliases:
  - km-tui.slow-folder-discovery
  - km-tui-slow-folder-discovery
created_by: Bjørn Stabell
created_at: 2026-04-14T17:40:20Z
closed_at: 2026-04-14T19:31:45Z
close_reason: "User confirmed 2026-04-14: seems fixed after 27db42fcf
  (computeColumnChildren expansion fix). If it resurfaces, reopen with
  DEBUG=km:storage:parse-worker log."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.slow-folder-discovery
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T10:40:21Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Folder loading indicator stuck 10+ seconds for a single-file folder @km/tui #bug #P3

blocks:: [[@km/tui]]

Creating ~/Bear/Vault/tst2/tst2.md shows a column full of skeleton loading cards for 10+ seconds before resolving. A single-file folder should load near-instantly.

May be partially resolved by 27db42fcf (computeColumnChildren expansion fix) since the previous bug caused empty column + repeated recomputation. Needs user verification after the view-lens fixes are tested.

If still slow after verification, likely causes:

1. Storage parse queue serializes all files in the vault (~1400+) before showing the board — not strictly per-folder
2. ViewTree rebuild on every repo update cascading from parse worker events
3. Skeleton cards rendering tied to parse-worker progress events that fire too frequently

Investigation: run with DEBUG=km:storage:parse-worker DEBUG_LOG=/tmp/slow.log and measure from 'Applying changes' to first real card render.

