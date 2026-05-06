---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-adapter-codex"
aliases:
  - km-silvercode.acp-adapter-codex
  - km-silvercode-acp-adapter-codex
created_by: claude:cd034ca4
created_at: 2026-04-26T08:11:36Z
closed_at: 2026-04-26T10:05:32Z
close_reason: "Resolved: silvercode consumes Codex via @zed-industries/codex-acp
  (registry id codex → npx -y @zed-industries/codex-acp). The wrapper supports
  ChatGPT subscription (paid Plus/Pro), CODEX_API_KEY, and OPENAI_API_KEY
  natively per upstream README. No silvercode-side stream-json adapter needed —
  connectAcpRegistry(scope, 'codex', opts) is the entire integration surface.
  Documentation: apps/silvercode/packages/agent-harness/docs/adapter-codex.md
  (auth path matrix, remote-project caveat for OAuth). Registry spawn
  correctness asserted in tests/registry-adapters.test.ts. Stream-json adapter
  deferred to P4 — only relevant if a future user has API-key access AND refuses
  to install codex-acp."
started_at: 2026-04-26T09:58:41Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-adapter-codex
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:11:36Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-adapter-codex
    depends_on_id: km-silvercode.acp-adapter-claude
    type: blocks
    created_at: 2026-04-26T01:11:36Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.acp
      - type: link
        target: km-silvercode.acp-adapter-claude
---

# [x] ACP adapter — OpenAI Codex CLI stream-json → SessionUpdate @km/silvercode #feature #P4 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-adapter-claude]]

Stateless mapper for codex-cli's JSONL output → ACP SessionUpdate. Codex schema variant differs from Claude's; refer to vibe-kanban's codex.rs and OpenClaw's extensions/openai/cli-backend.ts for the field mapping. Subscription-plan auth: rides ChatGPT Plus/Pro account login. Alternative path: consume @zed-industries/codex-acp (already-published ACP server) directly — adapter becomes pass-through. Decide which path is shorter once acp-adapter-claude lands.

