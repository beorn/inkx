---
mentions:
  - km
  - claude
id: "@km/silvercode/ambient-phase-2-adapter-wire"
aliases:
  - km-silvercode.ambient-phase-2-adapter-wire
  - km-silvercode-ambient-phase-2-adapter-wire
created_by: claude:4de4a3ab
created_at: 2026-04-27T20:22:50Z
closed_at: 2026-04-27T20:27:48Z
close_reason: >-
  Phase 2 complete. Test file:
  apps/silvercode/packages/agent-harness/tests/ambient-wire-bytes.test.ts (7
  tests, all green; tsc 0 errors).


  SCOPE REFRAME (key finding): silvercode does NOT speak HTTP to provider APIs.
  The architecture is: silvercode -> ACP JSON-RPC over stdio -> spawned ACP
  server subprocess (@zed-industries/codex-acp / @google/gemini-cli --acp /
  pi-acp / copilot / @km/claude-acp wrapper) -> upstream HTTP body to
  Anthropic/OpenAI/Gemini. The provider HTTP body (Anthropic system / OpenAI
  developer / Gemini systemInstruction) is constructed INSIDE the spawned
  subprocess and is OUT OF silvercode's control. Routing inside those upstreams
  is each vendor's responsibility (e.g. Codex's job, not silvercode's).


  What silvercode owns end-to-end is the boundary between user UI text and the
  ACP "prompt" content array. Phase 2's test verifies that boundary across all 5
  registry-resolved backends (codex, gemini, pi-acp, github-copilot-cli,
  claude-code).


  PER-BACKEND FINDINGS:

  - codex (bun x @zed-industries/codex-acp):  passed unchanged. Wire field: ACP
  type:'resource' EmbeddedResource ContentBlock distinct from type:'text'
  UserBlock.

  - gemini (bun x @google/gemini-cli --acp):  passed unchanged. Same.

  - pi-acp (bun x pi-acp):                    passed unchanged. Same.

  - github-copilot-cli (copilot):             passed unchanged. Same.

  - claude-code (silvercode @km/claude-acp):  passed unchanged. Same.


  NO ADAPTER NEEDED FIXING. The harness (acp-client.ts AcpAgentSession.prompt)
  passes the typed ContentBlock[] straight through to agent.prompt({ sessionId,
  prompt }) without flattening. This test is the regression guard.


  Test design: in-memory ACP server (acp.AgentSideConnection on the other side
  of node-stream pipes) captures the literal prompt content array each backend
  receives. Asserts (1) ambient lands as type:'resource' with ambient:// URI,
  (2) user text lands as type:'text' byte-for-byte, (3) ambient body never
  appears in any text block on the wire, (4) all 5 backends route identically.


  Sample payloads contain zero role-prefix trigger tokens ("peer alice opened PR
  #42", "CI passed", "continue") per content-quarantine discipline (design doc
  §9).


  EVIDENCE:

  $ bun vitest run
  apps/silvercode/packages/agent-harness/tests/ambient-wire-bytes.test.ts
   Test Files  1 passed (1)
        Tests  7 passed (7)

  $ npx tsc --noEmit | grep 'error TS' | grep -v vendor/ | wc -l

  0


  COMMIT: e7cdd7647 (file got included in the concurrent Phase 3 commit due to a
  session race; functional content is correct and pushed to origin/main).


  NOTE FOR FOLLOW-ON: this test only verifies silvercode's outbound ACP wire.
  The provider HTTP body inside each spawned subprocess (Anthropic system block
  vs OpenAI developer message vs Gemini systemInstruction) is the upstream's
  responsibility. If silvercode ever adds a direct-HTTP code path (e.g. spawnSdk
  via @anthropic-ai/claude-agent-sdk, sdk-adapter.ts), Phase 2 will need
  extending to capture and verify that wire too. Currently sdk-adapter.ts is the
  only such path; it's not on the ambient/channel-queue route, so it's out of
  scope today.
started_at: 2026-04-27T20:22:56Z
owner: bjorn@stabell.org
assignee: claude:4de4a3ab
dependencies:
  - issue_id: km-silvercode.ambient-phase-2-adapter-wire
    depends_on_id: km-silvercode.ambient-context-excellence
    type: parent-child
    created_at: 2026-04-27T13:22:55Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/silvercode/agent-host-l5/05-context-mentions-and-prompt-compositio\
      n/ambient-context-excellence"
---

# [x] Phase 2: per-backend adapter wire-byte verification @km/silvercode #task #P0 @claude:4de4a3ab

blocks:: [[@km/silvercode/agent-host-l5/05-context-mentions-and-prompt-composition/ambient-context-excellence]]

See hub/silvercode/design/ambient-context-safety.md §4 Phase 2. Verify silvercode's outbound ACP wire carries ambient EmbeddedResource blocks distinguishably from user-input text. Note: silvercode does NOT speak HTTP to providers — it spawns ACP subprocesses (claude binary or @zed-industries/codex-acp / @google/gemini-cli / pi-acp / copilot-cli). The provider HTTP body is constructed inside the spawned subprocess (out of silvercode's control). The wire silvercode owns is the ACP JSON-RPC prompt content array over stdio. This bead verifies that boundary.

blocks:: [[@km/silvercode/ambient-context-excellence]]

