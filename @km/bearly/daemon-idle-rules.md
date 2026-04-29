---
id: "@km/bearly/daemon-idle-rules"
aliases:
  - km-bearly.daemon-idle-rules
  - km-bearly-daemon-idle-rules
created_by: claude:2405c72e
created_at: 2026-04-26T21:09:54Z
closed_at: 2026-04-26T21:24:45Z
close_reason: "Superseded by elegance review (2026-04-26 /pro): the IdleRule DSL
  is YAGNI / Defaults-Over-Configuration violation. Two known knobs
  (idleTimeoutMs, maxLifetimeMs) do not justify a composable predicate engine.
  Fold into createMcpPlugin({idleTimeoutMs, maxLifetimeMs}) directly. Two
  event-driven setTimeout calls replace the heartbeat + rule evaluator. Full
  review: /tmp/llm-2405c72e-elegance-review-of-the-wrw1.txt."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.daemon-idle-rules
    depends_on_id: km-silvercode.process-mgmt
    type: parent-child
    created_at: 2026-04-26T14:09:57Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Daemon idle-rule API: composable predicates over IdleCtx (no tagged union) @km/bearly #feature #P2

blocks:: [[@km/silvercode/process-mgmt]]

Unify auto-quit logic for tribe + lore + future MCP plugin (and future 'dutiful' extraction if justified) under a single composable predicate API.

## Design

```ts
type Duration = number   // milliseconds

interface IdleCtx {
  readonly connections: number       // current connection count
  readonly idleMs:      Duration     // ms since last activity event
  readonly uptimeMs:    Duration     // ms since daemon start
  readonly requestsMs:  Duration     // ms since last RPC call
  readonly now:         number
}

type IdleRule = (ctx: IdleCtx) => string | null
// null = stay alive
// string = quit (string is logged as the reason)
```

No tagged union. No 'kind' discriminator. Functions are uniform; signals (alien-signals) are callable, so they plug in for free; pre-canned factories return functions; inline lambdas just work.

## Pre-canned factories

```ts
const noConnections = (after: Duration): IdleRule => {
  const fn: IdleRule = (ctx) =>
    ctx.connections === 0 && ctx.idleMs >= after
      ? `no connections for ${after}ms`
      : null
  Object.defineProperty(fn, 'name', { value: `noConnections(${after})` })
  return fn
}

const maxLifetime = (lifetime: Duration): IdleRule => { /* ... */ }
const noRequests  = (after: Duration):    IdleRule => { /* ... */ }
```

Names attached for log readability.

## List = OR

```ts
function evaluate(rules: IdleRule[], ctx: IdleCtx): string | null {
  for (const r of rules) {
    const reason = r(ctx)
    if (reason) return reason
  }
  return null
}
```

First non-null reason wins. Logged on quit.

## Use site

```ts
serverDaemon({
  // ...
  idle: [
    noConnections('5m'),
    maxLifetime('24h'),
    (ctx) => memMB() > 1500 ? 'memory pressure' : null,
    pauseSignal,
  ],
})
```

## Evaluation cadence

- Re-evaluate on every event that mutates IdleCtx (connect, disconnect, request start/end).
- Plus 5s heartbeat tick for time-based rules.
- Signals fire their own subscribers; daemon picks up reactive changes.

## Graceful exit

When a rule votes quit, the daemon stops accepting new connections, drains in-flight requests, then exits. Strategies don't see drain semantics.

## What's deferred

- when-expression DSL (string-serialized rules like VS Code's 'when'). Defer until a non-code authoring case appears.
- AND-composition primitive. Use one custom predicate `(ctx) => allOf(r1, r2)(ctx)` if needed; ship later if real demand.

## Where this lives

- If MCP becomes a tribe plugin (@km/silvercode/mcp-as-tribe-plugin): this API ships inside @bearly/tribe and tribe + lore migrate to it.
- If 'dutiful' is later extracted: this API moves there; tribe consumes it.

## References

- /tmp/llm-2405c72e-review-this-entire-process-management-k1md.txt
- VS Code 'when' clause pattern (similar predicate-over-context shape)