---
id: "@km/silvercode/test-system"
aliases:
  - km-silvercode.test-system
  - km-silvercode-test-system
created_by: claude:0940ca20
created_at: 2026-04-24T20:15:39Z
started_at: 2026-04-24T21:23:24Z
owner: bjorn@stabell.org
assignee: claude:0940ca20
---

# [/] Multi-layer silvercode test system with Anthropic/OpenAI fakes @km/silvercode #epic #P1 @claude:0940ca20

## Goal

Build the best-in-class test system for silvercode — tests that exercise the real UI + controller + agent-harness stack without hitting the live Anthropic / OpenAI APIs, and with enough layering that each feature has a test at the right level of abstraction.

## Why

Silvercode has ~15 weeks of rapid iteration ahead: permission inbox, history view, handoff, fork, multi-session grid, markdown rendering, syntax highlighting, OAuth account onboarding. Without a good test system, regressions are inevitable. We already hit one critical runtime bug (useDispose re-cleanup killing the subprocess 117ms after spawn) that a proper integration test would have caught instantly.

Current state: 6 test files / 33 tests. Mostly unit-level. No end-to-end, no fake LLM, no screenshot regression, no queue/batching assertions.

## Layered test plan

### Layer 1 — Pure unit (ms)

Target: individual functions. Already has some coverage.
- `markdown.ts` parsers
- `context-windows.ts` modelLabel / contextWindowFor
- `claude-account.ts` planLabel / windowShortLabel / filters
- `git-branch.ts` walk-up resolver
- QueueEditor text-to-entries split

### Layer 2 — Component unit (5-50ms)

Target: React components with fake stores. Use `@silvery/test` createRenderer.
- SidePanel rendering for various state snapshots (idle / thinking / awaiting-permission / overage quota / multi-session)
- UserMessageBlock / AssistantBlock / ToolCallBlock / ToolResultBlock / DiffRenderer
- QueueEditor focus / blur / release behavior
- Welcome empty state

### Layer 3 — Controller + harness unit, with faked LLM (50-500ms)

Target: controller.ts + agent-harness with a fake `AgentSession` that simulates Anthropic's stream-json protocol.

Build an `ScriptedFakeSession` helper:
- `session.script(events: AgentEvent[])` — the harness emits these events on subscribe, simulating real Claude behavior (session-init, turn-start, text-delta, tool-use, tool-result, result).
- `session.send(text)` — record the input; consumer can assert what was sent.
- `session.injectError(msg)` / `session.injectSessionEnd()` — simulate failure paths.

Test coverage targets:
- Queue batching — sending N messages while status is thinking, then turning idle, should call session.send once with "msg1\n\nmsg2\n\nmsg3".
- HoldQueue gating — while holdQueue(true), no flush even on idle; holdQueue(false) triggers flush.
- Clear queue — clearQueue drops buffered text without sending.
- useDispose — spawning + unmounting does NOT SIGTERM the subprocess (the 117ms bug); only actual teardown (Ctrl+C / React unmount of final app) does.
- Session-init backfill — Claude Code v2.1.119 + model + plan arrive in state after first user message.

### Layer 4 — End-to-end ANSI snapshot (1-5s)

Target: the running silvercode app with fake LLM, asserting real ANSI output via termless.
- Fresh session shows Welcome card + side panel with identity + ctx=0% bar + version lines.
- User types "hello", Enter — user-message card appears, activity indicator shows, fake LLM streams "Hi!" — assistant block renders.
- Long tool-result (1KB no-whitespace blob) keeps side panel visible (the overflow bug we keep fighting — see bead `km-silvercode.overflow-at-root`).
- Mode cycling via Shift+Tab (once handleTabCycling=false wires up through the user's real terminal).
- Queue editor flow: type + Enter while busy, cursor-up to edit, Ctrl+Enter to submit batched message.
- Quota panel: Xtra hidden when 5h/7d are green; yellow label when shown.

Use `termless` + `@silvery/test`'s tape executor. Assert text via `expectSnapshot()` (drift detection) and `app.locator()` (stable selectors).

### Layer 5 — Live smoke (manual, 30s)

Target: hand-run silvercode against real Claude every morning. Not automated. Separate checklist in the bead.

## Infrastructure

### `ScriptedFakeSession` helper

Location: `apps/silvercode/src/test/fake-session.ts` (new).

```ts
export function createFakeSession(): ScriptedFakeSession {
  const handlers = new Set<(e: AgentEvent) => void>()
  const sent: Array<{ type: "user" | "permission-response"; payload: unknown; ts: number }> = []
  let sessionId: SessionId = "pending" as SessionId
  return {
    // Same shape as AgentSession
    get sessionId() { return sessionId },
    get closed() { return false },
    send(text) {
      sent.push({ type: "user", payload: text, ts: Date.now() })
    },
    respondToPermission(id, approved) {
      sent.push({ type: "permission-response", payload: { id, approved }, ts: Date.now() })
    },
    subscribe(h) {
      handlers.add(h)
      return () => handlers.delete(h)
    },
    close() {/* no-op */},
    // Test helpers
    emit(event: AgentEvent) {
      if (event.kind === "session-init") sessionId = event.sessionId
      for (const h of handlers) h(event)
    },
    script(events: AgentEvent[], intervalMs = 10) {
      for (let i = 0; i < events.length; i++) {
        setTimeout(() => this.emit(events[i]!), i * intervalMs)
      }
    },
    get sent() { return sent },
  }
}
```

Wire via `Controller.opts.spawnFactory` which already exists for this purpose.

### Session scripts

Location: `apps/silvercode/src/test/scripts/` — prebuilt event sequences for common scenarios:
- `helloWorld.ts` — init → user "hi" → turn-start → text-delta "Hi!" → result
- `bashTool.ts` — init → user → tool_use(Bash, git status) → tool_result(output) → assistant text → result
- `longToolResult.ts` — 1KB unwrappable blob for overflow testing
- `multiTurn.ts` — 3 back-and-forth turns
- `permissionRequest.ts` — init → permission-required → response
- `sessionEnd.ts` — graceful + error-exit variants

### OpenAI / Codex fakes

Agent-harness has `spawnCodex` + `spawnSdk` wrappers. Add parallel fakes:
- `apps/silvercode/src/test/fake-codex-session.ts`
- `apps/silvercode/src/test/fake-sdk-session.ts`

Same interface, different underlying event-stream shapes.

### Snapshot infrastructure

Use termless tape executor. Store expected snapshots in `apps/silvercode/tests/snapshots/`. Reference: `apps/km-tui/tests/` uses similar patterns.

## Acceptance

- [ ] `ScriptedFakeSession` helper + 6 pre-scripted scenarios.
- [ ] Layer 3: 10+ new tests covering queue, useDispose, hold-gate, session-init, error paths.
- [ ] Layer 4: 5+ end-to-end snapshot tests (Welcome, user-message flow, long-tool-result, queue batching, quota panel visibility).
- [ ] `bun vitest run apps/silvercode/tests/` jumps from 33 to 80+ tests.
- [ ] Test docs at `apps/silvercode/tests/CLAUDE.md` explaining the layers + how to pick which one when adding a test.
- [ ] A checklist `apps/silvercode/tests/smoke-checklist.md` for the Layer 5 manual smoke.

## Non-goals

- Live-API tests against Anthropic (cost, flakiness; covered by Layer 5 manual).
- Load / stress testing (premature for this stage).
- Visual regression beyond ANSI snapshots (termless is enough).

## Related

- Use `@silvery/test` createRenderer for component snapshots.
- Use `termless` for Layer 4.
- Controller already has `spawnFactory` hook — reuse.
- Agent harness tests at `apps/silvercode/packages/agent-harness/tests/` — good reference for fake patterns.