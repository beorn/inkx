---
mentions:
  - km
id: "@km/tui/outline-migration"
aliases:
  - km-tui.outline-migration
  - km-tui-outline-migration
created_by: claude:28b14b32
created_at: 2026-02-23T15:12:16Z
closed_at: 2026-02-23T15:46:18Z
owner: bjorn@stabell.org
---

# [x] Migrate cards from border to outline @km/tui #task #P2

Migrate @km/tui cards from borderStyle to outlineStyle. Phase 0: harden inkx outline tests + add partial outline props (outlineTop/Bottom/Left/Right) + fix bg inheritance. Phases 1-4: migrate CardColumn.tsx, Board.tsx, shared-components.tsx from border to outline+padding. Remove manual innerWidth calculations.

