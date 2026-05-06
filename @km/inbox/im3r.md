---
mentions:
  - km
id: "@km/inbox/im3r"
aliases:
  - km-im3r
  - "@km/_orphan/im3r"
created_at: 2026-01-21T22:46:45Z
closed_at: 2026-01-22T00:13:20Z
---

# [x] Undocumented commands: zoom_inwards, zoom_out, select_all_progressive @km/_orphan #task #P3

docs/09-commands.md is missing these commands from the command tables:

Navigation section (lines 133-155):

- zoom_inwards - "Zoom in one level closer to selected node"
- zoom_out - "Return to previous zoom level (from zoom stack)"

Selection section (lines 157-172):

- select_all_progressive - "Progressive select all"

These commands exist in @km/_orphan/commands/src/commands/navigation.ts and are bound to keys.

