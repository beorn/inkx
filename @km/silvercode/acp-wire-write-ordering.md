---
id: "@km/silvercode/acp-wire-write-ordering"
aliases:
  - km-silvercode.acp-wire-write-ordering
  - km-silvercode-acp-wire-write-ordering
created_by: claude:cc081a9a
created_at: 2026-04-28T00:22:52Z
closed_at: 2026-04-28T00:51:13Z
close_reason: "Fixed in 849b4358d. Wire tracks pendingWrites set; settleNext
  drains via Promise.allSettled before resolving awaitTurn waiters. Tests in
  wire-write-ordering.test.ts (3 cases: drain ordering, multi-write drain,
  cross-turn no-deadlock). All 11 claude-acp tests pass."
started_at: 2026-04-28T00:26:14Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvercode.acp-wire-write-ordering
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T17:23:08Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] ACP wire: await pending sessionUpdate writes before settling awaitTurn @km/silvercode #task #P2 @claude:cc081a9a

blocks:: [[@km/silvercode]]

Why 2 fix in /why analysis 2026-04-27 (parent symptom: stuck thinking status — already patched at Why 1 level in session-store.ts).

**Problem**: apps/silvercode/packages/claude-acp/src/wire.ts:95 emits sessionUpdate notifications fire-and-forget (`void conn.sessionUpdate(...)`). When Claude --bare emits multiple events synchronously in one subscribe callback (final text-delta + tool-result + turn-end), the wire fires off all sessionUpdate Promises then settles awaitTurn on turn-end. Server's prompt() handler returns the response, which is serialized by the JSON-RPC SDK. Depending on the SDK's write-queue semantics, the response may end up on the wire BEFORE one of the prior fire-and-forget notifications. Consumer sees: synthetic turn-end → status=idle, then late tool_call_update → tool-result event.

**Fix**: track in-flight sessionUpdate promises in the wire; before settling awaitTurn on turn-end / session-end, await all of them. Alternatively, serialize emit() through a write queue.

**Why this is GUARD-level (Why 2)**: prevents the same race from hitting any other consumer state that's sensitive to ordering — not just status. Acceptance: a unit test that interleaves emit() + settleNext() and asserts notifications complete first.

Effort: ~30 min. Acceptance test goes in apps/silvercode/packages/claude-acp/tests/wire.test.ts.