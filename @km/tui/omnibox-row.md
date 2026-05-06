---
mentions:
  - km
id: "@km/tui/omnibox-row"
aliases:
  - km-tui.omnibox-row
  - km-tui-omnibox-row
created_by: Bjørn Stabell
created_at: 2026-04-14T23:24:05Z
closed_at: 2026-04-17T15:19:10Z
close_reason: "Verified shipped 2026-04-17: OmniboxRow.tsx (107 lines) renders
  unified row from OmniboxRowData descriptor; omnibox-row-adapters.ts provides 3
  adapters (commandToRow, nodeToRow, favoriteToRow). All 3 consumers migrated:
  ItemPicker (line 117), FavoritesDialog (lines 67-70, 99), UnifiedOmnibox
  (lines 161-207). Tests: apps/km-tui/tests/omnibox-row-adapters.test.ts + 2259
  passing in apps/km-tui/ (0 failed, 37 skipped). Zero tsc errors in Phase 1
  files (65 pre-existing baseline errors elsewhere are unrelated). No behavior
  change — adapter pattern keeps row component type-agnostic."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-row
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T16:24:05Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui.omnibox-unified
---

# [x] Shared OmniboxRow component (Phase 1) @km/tui #task #P1

blocks:: [[@km/tui/omnibox-unified]]

Create OmniboxRow component that renders a KNode as a one-liner row. Migrates ItemPicker, Omnibox, FavoritesDialog to use it via adapter layer. No behavior change. Catches divergence bugs. Sigil color, primary label, secondary metadata derived from node.type.

