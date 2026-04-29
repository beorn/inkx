---
id: "@km/silvery/async-disposable"
aliases:
  - km-silvery.async-disposable
  - km-silvery-async-disposable
created_by: claude:2405c72e
created_at: 2026-04-26T21:08:49Z
closed_at: 2026-04-26T21:24:31Z
close_reason: "Superseded by elegance review (2026-04-26 /pro):
  asyncDisposable() is a Quarantine-and-Delete violation — it exists because
  spawnClaude() returns the wrong shape. Fix the factory to return plain object
  with [Symbol.asyncDispose] natively. No external wrapper. See
  km-silvercode.spawn-close-hardening for the consolidated work. Full review:
  /tmp/llm-2405c72e-elegance-review-of-the-wrw1.txt."
---

# [x] @silvery/scope: add asyncDisposable() helper @km/silvery #feature #P2

blocks:: [[@km/silvery/lifecycle-scope]]

Add async sibling to disposable() in @silvery/scope.

## Why

Current disposable() helper:

```ts
export function disposable<T extends object>(
  value: T,
  dispose: (v: T) => void | Promise<void>,
): T & Disposable
```

Returns sync Disposable. Subprocess teardown is inherently async (SIGTERM → wait → maybe SIGKILL → wait for 'exit'). Without an async-shaped helper, every call site falls back to:

```ts
scope.defer(async () => { await proc.close() })   // verbose; loses value-attachment
```

## Add

```ts
export function asyncDisposable<T extends object>(
  value: T,
  dispose: (v: T) => Promise<void>,
): T & AsyncDisposable

// Implementation
export function asyncDisposable(value: object, dispose: (v: object) => Promise<void>): object {
  return Object.assign(value, {
    [Symbol.asyncDispose]() { return dispose(value) },
  })
}
```

## Use site

```ts
import { asyncDisposable } from '@silvery/scope'

scope.use(asyncDisposable(
  spawnClaude(opts),
  async (session) => { await session.close() },  // async close() returns Promise<void> after exit
))
```

## Test

- Round-trip: scope.use(asyncDisposable(...)) → scope[Symbol.asyncDispose]() awaits the disposer.
- Multi-throw: errors collected into SuppressedError per AsyncDisposableStack contract.

## Reference

- hub/silvery/design/lifecycle-scope.md (canonical design; canonical form section)
- /tmp/llm-2405c72e-review-this-entire-process-management-k1md.txt (Kimi K2.6 flagged this gap)
- Sibling bead: @km/silvercode/spawn-close-hardening (close() becomes Promise<void>; this enables clean adoption)