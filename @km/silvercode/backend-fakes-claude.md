---
id: "@km/silvercode/backend-fakes-claude"
aliases:
  - km-silvercode.backend-fakes-claude
  - km-silvercode-backend-fakes-claude
created_at: 2026-05-06T02:00:00Z
dependencies:
  - issue_id: km-silvercode.backend-fakes-claude
    depends_on_id: km-silvercode.backend-fakes
    type: parent-child
    created_at: 2026-05-06T02:00:00Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.backend-fakes
---

# Claude fake backend profile #task #P1

blocks:: [[@km/silvercode/backend-fakes]]

Add a Claude/Claude Code profile for the shared fake backend and cover both the Silvercode ACP wrapper path and the legacy Claude surfaces that remain in production.

## Scope

- Model `claude` and `claude-code` ACP wrapper behavior.
- Emit Claude-style session init, tool lists, slash commands, skills, plugins, and TodoWrite/plan updates.
- Cover permission modes and tool permission prompts.
- Cover config options if/when the Claude ACP wrapper exposes them.
- Keep current Claude subscription/OAuth vs API-key metadata behavior testable.

## Acceptance

- Fake Claude ACP profile exercises real `connectAcpRegistry(..., "claude")`.
- Tests distinguish Claude ACP wrapper behavior from SDK and legacy spawn behavior.
- Live-mode contract can compare init, prompt, permission, and close behavior against installed Claude backend.

