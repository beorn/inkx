---
id: "@km/session/0422-explore"
aliases:
  - km-session.0422-explore
  - km-session-0422-explore
created_by: claude:019d032d
created_at: 2026-04-22T18:47:04Z
closed_at: 2026-04-26T06:25:12Z
close_reason: Session complete — issues identified and tracked, blocked items
  have follow-up beads
---

# [x] Session 2026-04-22: explore km view broken after storage/fs-mount refactor @km/session #task #P1 @claude:019d032d

blocks:: [[@km/all/signal-handler-registry]], [[@km/cli/init-prompt-corrupts-tui]], [[@km/silvery/input-owner]], [[@km/silvery/stdout-dims-snapshot-race]], [[@km/silvery/term-sub-owners]], [[@km/silvery/terminal-protocol-owner]], [[@km/storage/parse-worker-stdout-leak]], [[@km/tui/cursor-stuck-col-0-h-scrolls]], [[@km/tui/evaluate-probe-autoprobing]], [[@km/tui/single-col-missing-top-borders]]

User reports km view basically broken after large changes. Recent commits touched storage identity schema (block_id→name fold, schema v6), fs-mount extraction, safe-write/echo-guard, reconcile-origin ops. Session goal: reproduce with TTY MCP, find breakages, create beads, fix.