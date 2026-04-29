---
id: "@km/silvercode/mcp-as-tribe-plugin"
aliases:
  - km-silvercode.mcp-as-tribe-plugin
  - km-silvercode-mcp-as-tribe-plugin
created_by: claude:2405c72e
created_at: 2026-04-26T21:09:30Z
closed_at: 2026-04-28T05:01:57Z
close_reason: >-
  Landed via:

  - vendor/bearly: feat/mcp-as-tribe-plugin SHA
  74494d87489a14ec4ea5c5aa6c92d494def1e672

  - km: feat/mcp-as-tribe-plugin SHA 2da227d32faa1704065b368cb38817a64f9fe110


  createMcpPlugin now matches the /pro round-2 elegance review settled spec:

  - Two numbers: idleTimeoutMs (default 30m) + maxLifetimeMs (default 24h)

  - Two event-driven setTimeout calls (no slow-tick poll, no setInterval)

  - One onShutdown(reason) callback (no EventEmitter)

  - Stable Unix socket, mode 0600, bind-before-publish (chmod before rename)

  - No pidfile, no handshake, no HTTP fallback, no DSL/predicate registry


  Test coverage (all green): plugins/shared-mcp/tests/mcp-plugin.test.ts

  - (a) idleTimeoutMs fires after no activity (connection-as-lease)

  - (b) maxLifetimeMs fires regardless of activity

  - (c) socket mode 0600 + no .tmp.sock leftovers + bound before published

  - (d) factory returns clean disposable (TribePluginApi shape, idempotent stop)

  - wire conformance: SDK Client → tools/list → []


  LOC: -616/+283 — net -333 LOC removed (DSL + EventEmitter + slow-tick +
  predicates).

  No external consumers depended on the removed APIs (verified via grep

  across both km and vendor/bearly).


  References: /tmp/llm-2405c72e-elegance-review-of-the-wrw1.txt
---

# [x] createMcpPlugin — MCP as a tribe plugin (idle + max-lifetime as two timers) @km/silvercode #feature #P2 @claude:cc081a9a

blocks:: [[@km/silvercode/process-mgmt]]

## What

Implement MCP-over-Unix-socket as a @bearly/tribe plugin. Single factory:

```ts
export function createMcpPlugin(opts?: {
  idleTimeoutMs?: number     // default: 5 * MIN
  maxLifetimeMs?: number     // default: 24 * HOUR
}): TribePlugin
```

That's the public API. Two numbers. No DSL.

## Internal shape

```ts
let connectionCount = 0
let idleTimer: NodeJS.Timeout | null = null

const lifetimeTimer = setTimeout(shutdown, maxLifetimeMs)

function onSseConnect() {
  connectionCount++
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
}

function onSseDisconnect() {
  connectionCount--
  if (connectionCount === 0) {
    idleTimer = setTimeout(shutdown, idleTimeoutMs)
  }
}
```

Event-driven. No setInterval. No heartbeat tick. No rule evaluator.

## Transport

- Stable Unix socket path: ~/.local/share/silvercode/mcp.sock.
- 0600 perms.
- Bind-before-publish: daemon binds socket FIRST, then writes any registry/discovery state. Second spawn gets EADDRINUSE.

## Lease semantics

Connection-as-lease. Claude holds an HTTP+SSE connection per session. SSE drop = session end = decrement count = idle timer arms when count hits zero.

## What this DOES NOT do (deliberately)

- **No pidfile.** Socket bind is exclusivity. We just deleted a pidfile edifice; not bringing one back.
- **No version handshake.** Single-monorepo client; deploy-time concern, not wire-protocol.
- **No HTTP fallback.** If Claude needs HTTP, HTTP IS the transport (one obvious way). Otherwise Unix socket.
- **No noRequests / request-idle counter.** Conflicts with connection-as-lease. Two liveness models = bug.
- **No IdleRule / IdleCtx / pauseSignal.** Two numbers in the factory; no algebra.

## Migration

Move (or absorb) @km/_orphan/mcp-server / tribe-mcp tools into this plugin's handler dispatch. Existing per-session stdio MCP grandchild paths remain until this lands; phase them out after.

## Tests

- SSE connect → idle timer cleared.
- Last SSE disconnect → idle timer armed.
- Re-connect during idle window → idle timer cleared, daemon stays alive.
- Idle timeout fires → daemon stops accepting new connections, drains in-flight, exits.
- Max lifetime fires → same drain path, regardless of connection count.
- Concurrent silvercode launches → only one daemon binds the socket; others connect.

## References

- /tmp/llm-2405c72e-elegance-review-of-the-wrw1.txt (Pro+Kimi elegance review, 2026-04-26)
- principles.md sections cited: Defaults Over Configuration, Build for one consumer, No Parallel Derivation, MECE
- Predecessor (closed): @km/bearly/daemon-idle-rules — rule DSL rejected in favor of two factory args
- Predecessor: @km/silvercode/mcp-daemon — standalone-binary direction superseded by plugin-on-tribe