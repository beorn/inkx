---
mentions:
  - km
aliases:
  - km-silvercode.turn-activity-summary
  - km-silvercode-turn-activity-summary
  - km-silvercode.chat-message-summary
  - km-silvercode-chat-message-summary
created_by: Codex
created_at: 2026-04-30T06:29:00Z
---

# [x] Add ChatMessageSummary for grouped ongoing work @km/silvercode #feature #P0

Support Claude-Code-like smart display of ongoing work by deriving a per-assistant-message `ChatMessageSummary` from normalized session entries.

Design direction:

- Aggregate edited/read file counts, shell command counts, todo changes, and active tool status.
- Render one compact active-message row by default.
- Reveal grouped raw commands, diffs, reads, and outputs via click/hover popover or explicit expansion.

Acceptance:

- [x] Low-content events inline as sentence summaries.
- [x] High-content events grouped under a message summary.
- [x] Clickable area spans the full row.
- [x] No raw backend-specific labels leak into primary display.
- [x] Raw details remain recoverable.
- [x] Storybook includes rich examples: active turn with reads/writes/commands, long bash output, failed command, file edits with diff summary, todo changes, permission prompt adjacency, notification rows, and collapsed vs expanded/popover states using real silvercode components.
