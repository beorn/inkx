---
id: "@km/silvercode/process-mgmt"
aliases:
  - km-silvercode.process-mgmt
  - km-silvercode-process-mgmt
created_by: claude:2405c72e
created_at: 2026-04-26T21:07:48Z
closed_at: 2026-04-28T05:02:30Z
close_reason: >-
  All children landed. Settled plan executed:


  - km-silvercode.spawn-close-hardening — closed (factory-native AsyncDisposable
  + gracefulKillTree)

  - km-silvercode.mcp-as-tribe-plugin — closed (createMcpPlugin with two timers)

  - km-bearly.daemon-idle-rules — closed (DSL rejected; absorbed into
  mcp-as-tribe-plugin's two-args shape)


  Net outcome: 898-LOC supervisor deletion (commit 4f9e9ebb5) followed by

  333-LOC simplification of the shared-mcp prototype. Process management

  now matches the /pro round-2 elegance plateau:


  - one daemon (tribe), MCP as a plugin

  - one transport (Unix socket, 0600, bind-before-publish)

  - one liveness model (connection-as-lease)

  - one cleanup shape (factory-native AsyncDisposable + gracefulKillTree)


  References:

  - /tmp/llm-2405c72e-review-this-entire-process-management-k1md.txt (round 1)

  - /tmp/llm-2405c72e-elegance-review-of-the-wrw1.txt (round 2)
---

# [x] [epic] Process management — daemon strategy, close hardening, MCP-as-tribe-plugin @km/silvercode #epic #P1

blocks:: [[@km/silvercode]]

Tracking epic for silvercode's process-management plateau, post-supervisor-deletion (commit 4f9e9ebb5).

## Background

- 898-LOC custom supervisor was deleted; replaced with detached:true + pgid SIGTERM + 1-line spawn cap.
- /pro reviews: correctness (2026-04-26 round 1, $3.53), elegance (round 2, $3.49). Both at /tmp/llm-2405c72e-*.txt.
- Round 2 (elegance) collapsed the plan from 4 beads to 2 — Pro and Kimi independently demanded deletion of the IdleRule DSL and asyncDisposable wrapper as YAGNI / Quarantine-and-Delete violations.

## Final plan (2 beads)

### @km/silvercode/spawn-close-hardening (P1)

spawn factories return plain objects with [Symbol.asyncDispose] natively. Extract gracefulKillTree(pid, {fallbackAfterMs: 10_000}) helper. Read proc.exitCode directly (no 'closed' flag). Don't swallow stdio destroy errors. Returns Promise<void>.

### @km/silvercode/mcp-as-tribe-plugin (P2)

createMcpPlugin({idleTimeoutMs?, maxLifetimeMs?}). Two numbers, two event-driven setTimeout calls. Stable Unix socket, 0600, bind-before-publish. No pidfile, no handshake, no HTTP fallback, no DSL.

## What got deleted, not deferred

- @km/silvery/async-disposable (closed) — wrapper rejected in favor of factory-native dispose.
- @km/bearly/daemon-idle-rules (closed) — rule engine rejected; two args replace it.
- IdleRule, IdleCtx, evaluate, noConnections/maxLifetime/noRequests factories, 5s heartbeat, version handshake, pidfile reintroduction, HTTP fallback, pauseSignal-as-API, the 'closed' flag, swallowed stdio errors.

## What's deferred (still YAGNI but on the list)

- @bearly/daemon extraction (use 'dutiful' name, already reserved on npm) — only if a third standalone consumer materializes outside tribe.
- Browser/SharedWorker daemon analogue.
- VS Code-style 'when' expression DSL.
- AND-composition primitive.
- Windows support — declare Unix-only for v1.
- Memory-pressure / pause / custom rules — extract pattern only when a real consumer needs it.

## References

- /tmp/llm-2405c72e-review-this-entire-process-management-k1md.txt (round 1: correctness, $3.53)
- /tmp/llm-2405c72e-elegance-review-of-the-wrw1.txt (round 2: elegance + principles, $3.49)
- hub/silvery/design/lifecycle-scope.md (Scope discipline; god-object anti-pattern)
- docs/principles.md (the rules round 2 measured against)
- apps/silvercode/packages/agent-harness/src/spawn.ts (current close() implementation)