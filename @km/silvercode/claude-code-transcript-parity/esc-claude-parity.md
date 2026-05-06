---
mentions:
  - km
  - claude
id: "@km/silvercode/claude-code-transcript-parity/esc-claude-parity"
aliases:
  - "@km/silvercode/esc-claude-parity"
  - km-silvercode.esc-claude-parity
  - km-silvercode-esc-claude-parity
created_by: claude:2405c72e
created_at: 2026-04-26T05:55:40Z
closed_at: 2026-04-26T06:38:49Z
close_reason: "Shipped: a7e86361d (controller helpers) + 0cd94792b (Esc parity).
  interruptActiveTurn, popQueueHead, double-Esc opens history. Per-turn abort
  uses synthetic turn-end fallback (km-agent-harness.per-turn-abort tracks the
  upstream gap). Session: km-session.0425-evening"
started_at: 2026-04-26T05:55:43Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.esc-claude-parity
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T22:55:42Z
    created_by: claude:2405c72e
    metadata: "{}"
props: {}
propsRaw: {}
---

# [x] Esc behavior mirroring Claude Code: interrupt + restore queue + double-esc history @km/silvercode #feature #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

Today silvercode's Esc clears the queue when command input is empty (apps/silvercode/src/App.tsx:371). Claude Code instead: (1) interrupts the in-flight turn, (2) restores queued message to input box (not discarded), (3) double-Esc opens edit/rewind history. Implement parity. Phase 1 here: Esc with queue → restore (newest entry) to input box; Esc with in-flight turn → cancel via existing controller path or SIGINT; double-Esc → open HistoryDialog. Phase 2 (deferred): per-turn abort once @km/agent-harness/per-turn-abort lands. Files: apps/silvercode/src/App.tsx (useInput Esc branch), controller.ts (interruptActiveTurn helper if not present).

