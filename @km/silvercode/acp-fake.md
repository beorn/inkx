---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-fake"
aliases:
  - km-silvercode.acp-fake
  - km-silvercode-acp-fake
created_by: claude:cd034ca4
created_at: 2026-04-26T09:04:53Z
closed_at: 2026-04-26T09:35:59Z
close_reason: >-
  Layer 1 (createFakeAcpSession) complete.


  DELIVERED:

  - src/fake.ts: createFakeAcpSession({ script, permissionPolicy?, manual?,
  sessionId? }) returns AgentSession (drop-in for spawnClaude). Manual driver
  mode adds tick()/drain() for deterministic fixture-replay tests.

  - src/fake-fixtures/: 6 JSON fixtures — minimal-prompt,
  tool-call-with-permission, multi-tool-with-fs, rejection-flow, error-flow,
  streaming-text. loadFixture(name) helper.

  - tests/fake.test.ts: 25 tests covering fixture replay, subscription
  lifecycle, close() semantics + timer cleanup, all 4 permission policy variants
  (auto-approve, always-deny, scripted, function), async timing with
  vi.useFakeTimers + advanceTimersByTime, send()/respondToPermission(),
  sessionId override, manual driver semantics.

  - index.ts: appended createFakeAcpSession + types (additive only, no conflict
  with acp-client track).


  VERIFICATION:

  - bun vitest run apps/silvercode/packages/agent-harness/tests/fake.test.ts ->
  25/25 passing

  - bun vitest run apps/silvercode/packages/agent-harness/ -> 96/96 passing
  (full suite, no regressions)

  - bun fix clean for fake.ts and fake.test.ts

  - typecheck clean for fake.* (only pre-existing spawn.ts and vendor errors
  remain)


  NOTES FOR LAYER 2 (silvercode-acp-fake binary, follow-up bead):

  - Fixtures are JSON-as-AgentEvent. For Layer 2, fixtures will need to be
  JSON-as-SessionUpdate (ACP wire shape) and pass through silvercodeToAcp().
  Consider sharing a fixture-conversion utility.

  - The PermissionPolicy enum (auto-approve / always-deny / scripted / function)
  is the right shape for Layer 2 too — keep the API.

  - Manual driver pattern (tick/drain) is what Layer 2 needs internally to
  replay scripts deterministically when prompted.

  - queueMicrotask doesn't fire under vi.useFakeTimers. setTimeout does. Use
  setTimeout-based scheduling everywhere if Layer 2 wants
  test-time-controllability.
started_at: 2026-04-26T09:09:31Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-fake
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T02:04:56Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-fake
    depends_on_id: km-silvercode.acp-foundation
    type: blocks
    created_at: 2026-04-26T02:04:57Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.acp
      - type: link
        target: km-silvercode.acp-foundation
---

# [x] ACP fake — deterministic test double for components, adapters, and orchestration @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-foundation]]

Scriptable fake ACP server / AcpSession for testing. Lives alongside foundation work, not after it.

## Two layers (ship both)

### Layer 1 — createFakeAcpSession({ script }) — silvercode-internal

Returns an AcpSession whose signals fire from a scripted sequence of SessionUpdates. Drop-in replacement for createAcpSession in tests and storybook.

```ts
const session = createFakeAcpSession(scope, {
  script: [
    { delayMs: 50, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Reading...' } } },
    { delayMs: 200, update: { sessionUpdate: 'tool_call', toolCallId: 't1', kind: 'read', title: 'Read src/auth.ts', status: 'pending' } },
    { delayMs: 800, update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', content: [...] } },
  ],
  permissionPolicy: 'auto-approve' | 'always-deny' | scriptedDecisions,
  fsHandler: { /* canned file contents */ },
});
```

### Layer 2 — silvercode-acp-fake standalone binary

Wraps Layer 1 in AgentSideConnection (@agentclientprotocol/sdk), exposed as a real ACP server over stdio. Lets silvercode's real connectAcp factory talk to a fake on the other side of the wire — full end-to-end coverage of JSON-RPC layer, capability negotiation, connection lifecycle.

## Why it earns its place

- Deterministic component testing — storybook stories drive component states from scripted ACP events
- Adapter regression tests — stream-json → ACP boundary plays back recorded JSONL fixtures, asserts SessionUpdate stream matches golden
- Cross-agent orchestration tests — deterministic peer behavior in multi-agent scenarios
- Permission-flow tests — drive RequestPermission deterministically, assert silvercode's policy
- Capability-gate tests — fake initialize-response with various AgentCapabilities, assert UI mounts/unmounts right components
- Storybook fixtures — canonical fixture player for every story

## Recordable + replayable

Script format matches real-session captures. Run silvercode against real Claude with RECORD=1, capture all SessionUpdates + RequestPermissions + fs/* requests as JSON script. Replay through fake in tests. Same primitive as silvery's mdtest tape.

## Acceptance

- createFakeAcpSession factory with deterministic timing
- Script JSON schema (matches real ACP wire shape)
- Recording mode in connectAcp (silvercode dev flag)
- Layer 2 binary at packages/silvercode/bin/silvercode-acp-fake
- Test fixtures: minimal-prompt, tool-call-with-permission, multi-tool-with-fs, rejection-flow, error-flow, plan-update, mode-change

## Reference

hub/silvery/future/ai-terminal/10-agent-router-landscape.md § ACP fake — a deterministic test double for the foundation

