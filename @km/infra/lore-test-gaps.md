---
id: "@km/infra/lore-test-gaps"
aliases:
  - km-infra.lore-test-gaps
  - km-infra-lore-test-gaps
created_by: Bjørn Stabell
created_at: 2026-04-17T20:34:56Z
closed_at: 2026-04-17T21:17:52Z
close_reason: "All 3 items addressed: (1) TTL turn-counter test added at daemon
  level, (2) MCP plugin handler tests for
  inject_delta/workspace_state/session_state library-fallback behavior added,
  (3) daemon-down fallback is now covered by the library-fallback tests (no
  daemon spawn-and-kill needed). 415/415 vendor tests pass."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.lore-test-gaps
    depends_on_id: km-infra.tribe-rebrand
    type: parent-child
    created_at: 2026-04-17T13:35:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Lore test coverage gaps — MCP plugin handlers, fallback path, TTL expiry @km/infra #task #P3

blocks:: [[@km/infra/tribe-rebrand]]

Three test gaps found during audit:

1. MCP plugin handler tests missing for Phase 3-5 tools
   - plugins/lore/tests/server.test.ts only covers ask / current_brief / plan_only
   - Missing: handleInjectDelta, handleWorkspaceState, handleSessionState
   - Same style as existing handleAsk tests (mock daemon via vi.mock)

2. Daemon-down → library fallback not tested
   - Kill daemon mid-test and verify hookRecall takes over cleanly
   - Verify response.mode === 'library' on the way back

3. Dedup TTL expiry not tested (Phase 5)
   - Current test only covers per-session ISOLATION
   - Missing: fire >ttlTurns prompts, verify an earlier seen key becomes eligible again
   - Use small ttlTurns param to keep test fast

None are blockers. 30/30 current tests pass; these fill happy-path gaps.