---
id: "@km/silvercode/backend-fakes-spawn-transports"
aliases:
  - km-silvercode.backend-fakes-spawn-transports
  - km-silvercode-backend-fakes-spawn-transports
created_at: 2026-05-06T02:00:00Z
dependencies:
  - issue_id: km-silvercode.backend-fakes-spawn-transports
    depends_on_id: km-silvercode.backend-fakes
    type: parent-child
    created_at: 2026-05-06T02:00:00Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.backend-fakes
---

# Legacy spawn transport fakes #task #P2

blocks:: [[@km/silvercode/backend-fakes]]

Add complete fake process streams for non-ACP legacy transports so Silvercode can test all shipped backends without relying on real binaries.

## Scope

- Fake `claude-code-spawn` stream-json behavior.
- Fake `codex-spawn` legacy stream behavior.
- Fake `claude-code-sdk` adapter behavior where process-level faking is not applicable, preserving SDK metadata and lifecycle semantics.
- Cover session init, prompt, text deltas, tool calls, permission prompts, end/error events, close, and resume where supported.

## Acceptance

- Controller tests can select each legacy backend through the normal spawn path and receive fake process output.
- Existing Layer 1 `AgentSession` fakes remain available for narrow reducer/UI tests, but integration tests use these lower-boundary transport fakes.
- Contract docs explain which backends are ACP-profile fakes and which remain legacy spawn fakes.
