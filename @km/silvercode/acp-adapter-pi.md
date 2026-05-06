---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-adapter-pi"
aliases:
  - km-silvercode.acp-adapter-pi
  - km-silvercode-acp-adapter-pi
created_by: claude:cd034ca4
created_at: 2026-04-26T08:11:38Z
closed_at: 2026-04-26T10:05:19Z
close_reason: "Resolved: silvercode consumes pi via the community pi-acp package
  (registry id pi-acp → npx -y pi-acp). No silvercode-side adapter code needed —
  connectAcpRegistry(scope, 'pi-acp', opts) is the entire integration surface.
  Documentation: apps/silvercode/packages/agent-harness/docs/adapter-pi.md
  (auth, capabilities, caveats, alternative @victor-software-house/pi-acp fork).
  Registry spawn correctness asserted in tests/registry-adapters.test.ts.
  Stream-json adapter for pi --mode rpc deferred indefinitely (Registry path
  covers all current cases)."
started_at: 2026-04-26T09:58:32Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-adapter-pi
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:11:38Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-adapter-pi
    depends_on_id: km-silvercode.acp-adapter-claude
    type: blocks
    created_at: 2026-04-26T01:11:38Z
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

# [x] ACP adapter — pi (badlogic) via pi-acp bridge or pi --mode rpc @km/silvercode #feature #P3 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-adapter-claude]]

Two paths:

1. Consume community pi-acp adapter (npm: pi-acp by svkozak — spawns pi --mode rpc and bridges to ACP). Lowest-effort path; matches badlogic's explicit recommendation that ACP support be 'built externally on top of pi's rpc mode' (PR #836 close comment).
2. Alternative: consume @victor-software-house/pi-acp which embeds pi via SDK (in-process, richer feature mapping including agent_thought_chunk, structured diffs, multi-session, configOptions for model/thinking-level).
Note: pi-mono itself has no in-tree ACP support and badlogic explicitly declined to add it ('Zed don't support their own protocol in full months after release'). Auth: pi handles its own provider/API-key configuration.

