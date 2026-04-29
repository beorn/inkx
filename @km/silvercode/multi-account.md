---
id: "@km/silvercode/multi-account"
aliases:
  - km-silvercode.multi-account
  - km-silvercode-multi-account
created_by: claude:0940ca20
created_at: 2026-04-24T15:33:39Z
closed_at: 2026-04-24T15:49:48Z
close_reason: "Foundation shipped in b011bf65c + 3c941fd9e: --account CLI flag,
  ~/.silvercode/accounts/<name> resolution, per-session configDir passthrough,
  StatusLine @account label, intro message. OAuth onboarding, account roster
  modal, quota display, auto-routing deferred to follow-up beads."
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.multi-account
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T08:33:39Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] v1.1: multi-account spawning via per-session CLAUDE_CONFIG_DIR @km/silvercode #feature #P2 @claude:0940ca20

blocks:: [[@km/silvercode]]

v1.1 differentiator. Each session card declares an account; spawn sets CLAUDE_CONFIG_DIR=<per-account-config> before launching claude. Account roster UI, add-account OAuth flow, quota display, switcher on each card. Stretch: auto-routing heuristics, exhaustion failover, shared-pool view. See hub/silvery/future/ai-terminal/00-agent-workspace.md § Multi-account.