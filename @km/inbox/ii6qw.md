---
id: "@km/inbox/ii6qw"
aliases:
  - km-ii6qw
  - "@km/_orphan/ii6qw"
created_by: claude:e4d16fec
created_at: 2026-03-17T22:45:32Z
closed_at: 2026-03-18T20:59:27Z
close_reason: "Fixed: added deleteSubtreeChildren() in 3 code paths
  (parseStubFile, parseOneFile, insertFileNodes) to delete existing children
  before re-inserting parsed ones. Root cause: double-parse creates duplicate
  children with fresh ULIDs. Verified in real TUI with Asana vault — no
  duplicates. Regression test in repo.test.ts."
owner: bjorn@stabell.org
assignee: claude:d29abbfa
---

# [x] P0: Detail pane fold/unfold broken — no fold indicators, can't unfold, duplicate items @km/_orphan #bug #P0 @claude:d29abbfa

Three issues in detail pane after remainingDepth=0 change:

1. **No fold indicators**: In nerdfont mode, computeBulletIcon gives type-specific bullets (§, □, ✓) priority over fold markers. getFoldMarker is never called because getTypeBullet returns first. Users can't see which items have hidden children.

2. **Can't unfold**: Shift+L (unfold_node) doesn't work in the detail pane. Pressing Shift+L either does nothing or moves the board cursor instead. The UNFOLD_NODE action may not be reaching the handler, or the key is being intercepted.

3. **Duplicate items**: Each child appears twice in the detail view (two INBOXes, two PROJECTS & PHASES, two Phase 2s, etc.). Likely a rendering bug in DetailView.tsx or deriveDetailColumns.

Screenshot: ~/Desktop/Screenshot 2026-03-17 at 15.44.36.png
Repro: km view --repo imports/asana, navigate to early-orbit card, Shift+D to open detail, n to focus detail pane.