---
id: "@km/tui/enter-creates-node-id"
aliases:
  - km-tui.enter-creates-node-id
  - km-tui-enter-creates-node-id
created_by: Bjørn Stabell
created_at: 2026-03-31T21:12:43Z
closed_at: 2026-03-31T22:12:23Z
close_reason: "Fixed: two root causes — (1) linebreak handlers missing
  requestRenderFlush(), (2) useColumns setTimeout(0) debounce made columns one
  frame behind. Both fixed. 4953 tests pass."
owner: bjorn@stabell.org
---

# [x] Enter in edit mode creates items with node IDs instead of content @km/tui #bug #P2

When editing a card title in INSERT mode:

1. Type text at end of title then press Enter: the typed text disappears and the new child item shows a raw node ID like '(RP5E1V88)' instead of the text content
2. Press Enter at end of title without typing: creates a child item, then pressing Enter again on the empty child creates another item with a node ID like '(RFV8NQ97)'

Expected: Enter should split the line or create a new sibling with the text after the cursor position. If no text after cursor, should create an empty sibling ready for input.

Actual: New items contain raw node IDs in parentheses instead of the expected content.

Repro: km view -> navigate to any heading card -> Enter (edit mode) -> End (go to end of title) -> Enter

Screenshots: /tmp/@km/edit-explore-05-typed-test123/png through /tmp/@km/edit-explore-08-double-enter/png