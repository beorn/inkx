---
mentions:
  - km
  - claude
id: "@km/session/0422-explore"
aliases:
  - km-session.0422-explore
  - km-session-0422-explore
created_by: claude:019d032d
created_at: 2026-04-22T18:47:04Z
closed_at: 2026-04-26T06:25:12Z
close_reason: Session complete — issues identified and tracked, blocked items
  have follow-up beads
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-session.0422-explore
    depends_on_id: km-all.signal-handler-registry
    type: blocks
    created_at: 2026-04-22T13:41:53Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-cli.init-prompt-corrupts-tui
    type: blocks
    created_at: 2026-04-22T11:59:31Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-silvery.input-owner
    type: blocks
    created_at: 2026-04-22T13:34:30Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-silvery.stdout-dims-snapshot-race
    type: blocks
    created_at: 2026-04-22T13:41:53Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-silvery.term-sub-owners
    type: blocks
    created_at: 2026-04-22T13:47:52Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-silvery.terminal-protocol-owner
    type: blocks
    created_at: 2026-04-22T13:41:53Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-storage.parse-worker-stdout-leak
    type: blocks
    created_at: 2026-04-22T11:59:31Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-tui.cursor-stuck-col-0-h-scrolls
    type: blocks
    created_at: 2026-04-22T13:24:30Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-tui.evaluate-probe-autoprobing
    type: blocks
    created_at: 2026-04-22T13:09:00Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-session.0422-explore
    depends_on_id: km-tui.single-col-missing-top-borders
    type: blocks
    created_at: 2026-04-22T12:09:48Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: "@km/infra/signal-handler-registry"
      - type: link
        target: km-cli.init-prompt-corrupts-tui
      - type: link
        target: km-silvery.input-owner
      - type: link
        target: km-silvery.stdout-dims-snapshot-race
      - type: link
        target: km-silvery.term-sub-owners
      - type: link
        target: km-silvery.terminal-protocol-owner
      - type: link
        target: km-storage.parse-worker-stdout-leak
      - type: link
        target: km-tui.cursor-stuck-col-0-h-scrolls
      - type: link
        target: km-tui.evaluate-probe-autoprobing
      - type: link
        target: km-tui.single-col-missing-top-borders
---

# [x] Session 2026-04-22: explore km view broken after storage/fs-mount refactor @km/session #task #P1 @claude:019d032d

blocks:: [[@km/infra/signal-handler-registry]], [[@km/cli/init-prompt-corrupts-tui]], [[@km/silvery/input-owner]], [[@km/silvery/stdout-dims-snapshot-race]], [[@km/silvery/term-sub-owners]], [[@km/silvery/terminal-protocol-owner]], [[@km/storage/parse-worker-stdout-leak]], [[@km/tui/cursor-stuck-col-0-h-scrolls]], [[@km/tui/evaluate-probe-autoprobing]], [[@km/tui/single-col-missing-top-borders]]

User reports km view basically broken after large changes. Recent commits touched storage identity schema (block_id→name fold, schema v6), fs-mount extraction, safe-write/echo-guard, reconcile-origin ops. Session goal: reproduce with TTY MCP, find breakages, create beads, fix.

