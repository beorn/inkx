---
mentions:
  - km
  - bjrn-stabell
id: "@km/silvercode/agent-backend-provider-specs"
aliases:
  - km-silvercode.agent-backend-provider-specs
  - km-silvercode-agent-backend-provider-specs
created_by: codex:019df67d-5bb9-7491-8a62-3f38f42ad710
created_at: 2026-05-06T06:17:16.150Z
started_at: 2026-05-06T06:17:16.150Z
closed_at: 2026-05-06T17:14:18Z
close_reason: "Implemented provider-injected AgentBackends/chat session stores,
  comprehensive fake ACP backend streams, fake/live backend spec runner, docs,
  and screenshot disclosure regressions. Tests: chat-message-summary,
  agent-harness tests, backend contracts, typecheck, targeted oxlint, and git
  diff --check."
owner: bjorn@stabell.org
assignee: "@bjrn-stabell"
dependencies:
  - issue_id: km-silvercode.agent-backend-provider-specs
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-05-06T06:17:16.150Z
    created_by: codex:019df67d-5bb9-7491-8a62-3f38f42ad710
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] Implement provider-injected agent backend fakes and specs @km/silvercode #task #P2 @bjrn-stabell

blocks:: [[@km/silvercode]]

Implement provider-injected `AgentBackends`, reactive chat/session `.conn` store, and fake/live backend spec runner.

Acceptance:

- Fakes are `AgentBackend` providers injected through `withAgentBackends()` / `withChat({ backends })`.
- Prompt spec covers every fake ACP backend.
- Config spec runs against the fake/live target shape.
- Sessions can be created without backends.
- Comprehensive fake ACP stream covers representative local Claude Code, Codex, and opencode transcript event families without storing raw private transcript content.

Implemented provider-injected fake ACP backends, reactive chat/session store, fake/live backend spec runner, comprehensive fake ACP prompt stream from local transcript shape survey, and backend contract specs for prompt/config/comprehensive session updates.

