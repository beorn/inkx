---
mentions:
  - km
  - claude
id: "@km/silvercode/claude-acp-wire-bugs"
aliases:
  - km-silvercode.claude-acp-wire-bugs
  - km-silvercode-claude-acp-wire-bugs
created_by: claude:cc081a9a
created_at: 2026-04-27T22:37:09Z
closed_at: 2026-04-28T04:59:58Z
close_reason: "Three symptoms (status stuck, ambient batching, duplicate error)
  all verified fixed via prior commits 9116d026e + 849b4358d + 5fb135588. New
  regression test apps/silvercode/packages/claude-acp/tests/wire-bugs.test.ts (7
  tests) locks in: (a) turn-end propagation through wire awaitTurn, (b)
  channelQueue and ambientStream subscribers fan out incrementally per event,
  (c) failed tool_call_update is single SessionUpdate (legacy error AgentEvents
  are dropped by wire). Tests: 209 passed in agent-harness + claude-acp suites.
  bun fix clean. tsc errors introduced: 0."
started_at: 2026-04-28T04:47:24Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvercode.claude-acp-wire-bugs
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T15:37:21Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] claude-acp session: stuck status + ambient batching + duplicate errors @km/silvercode #bug #P1 @claude:cc081a9a

blocks:: [[@km/silvercode]]

User report (2026-04-27, session claude-acp-1777328860343-1):

Three symptoms observed when running silvercode against claude via the
@km/claude-acp wire (NOT the legacy claude-code-spawn path):

1. **Ambient events batch until next prompt.** Filewatch / tribe / ci
   events accumulate silently while the agent is working, then ALL flush
   at once when the user sends the next prompt. The screenshot showed
   ~10 ambient rows stamped 15:27-15:31 appearing simultaneously after
   the user typed.
2. **Tool error rendered twice as distinct boxes.** Bash run of
   `tribe status` (daemon down) shows up as both:
  - a "Run failed" ToolCall box with the stderr inside
  - a separate "Error" row right below with the same stderr text
   Suspected source: stderr listener in `acp-client.ts:497-502` emits
   `kind: "error"` for any non-empty child stderr. Claude's hook scripts
   fire on tool-call lifecycle and may write to stderr, which becomes a
   second visible error event on top of the legitimate tool-result.
3. **Session stuck in "doing" status.** SidePanel/composer shows
   "Refining… (3s)" indefinitely after the assistant has clearly
   finished the response. Suggests the turn-end legacy event isn't
   being emitted from the ACP boundary, so session-store status never
   transitions back to idle.

Possibly related:

4. **Single assistant message renders as 3 separate AssistantRows.**
   "No / tribe daemon is running — I'm solo. No active sessions to /
   coordinate with." — split across 3 rows. May be legitimate (text →
   tool → text → tool → text interleaving), but the user perceives it
   as a regression of the prior single-AssistantRow-per-turn fix
   (commit c89570e0d). Worth verifying which path emitted the splits.

## Suspected root cause: ACP boundary doesn't emit turn-end

`mapSessionUpdateToLegacyEvents` in `acp-client.ts:839-1020` translates
each ACP `sessionUpdate` to legacy AgentEvents but ACP's wire model has
no explicit turn-end notification — the prompt() RPC just resolves with
a `stopReason`. The wrapper at lines 683-710 / 772-778 sets/clears
`currentTurnId` around the prompt, but if no synthetic `turn-end`
AgentEvent is emitted on resolution, session-store's status stays in
the in-progress state forever.

## Files to investigate

- apps/silvercode/packages/agent-harness/src/acp-client.ts (boundary)
- apps/silvercode/packages/agent-harness/src/session-store.ts (status FSM)
- apps/silvercode/packages/claude-acp/src/server.ts (wire emitter)
- apps/silvercode/src/components/SessionUpdateList.tsx (interleave render)

## Repro

`silvercode --account d@delei.org` (or any claude account), prompt with
something that uses Bash. Status sticks in "Refining…". Trigger a
filewatch by touching a source file — UI shows nothing until you send a
new prompt.

## Acceptance

- Sending a prompt that completes returns the composer to idle state
  (`status === "idle"`) within 1s of the assistant's final chunk.
- Ambient events render incrementally as they arrive, not batched.
- A tool failure with stderr produces ONE rendered failure indicator
  per failed tool call, not two.
- `bun vitest run apps/silvercode/packages/agent-harness/tests/` passes
  with new tests covering the turn-end synthesis on prompt resolve.

