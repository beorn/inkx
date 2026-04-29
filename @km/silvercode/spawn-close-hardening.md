---
id: "@km/silvercode/spawn-close-hardening"
aliases:
  - km-silvercode.spawn-close-hardening
  - km-silvercode-spawn-close-hardening
created_by: claude:2405c72e
created_at: 2026-04-26T21:08:34Z
closed_at: 2026-04-26T21:55:13Z
close_reason: "Shipped: AsyncDisposable + sentTerm + exitPromise + 10s SIGKILL
  fallback. 6 new tests in spawn-close.test.ts. 155/155 agent-harness suite
  passing."
started_at: 2026-04-26T21:34:55Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.spawn-close-hardening
    depends_on_id: km-silvercode.process-mgmt
    type: parent-child
    created_at: 2026-04-26T14:08:34Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] spawn factories return native AsyncDisposable; gracefulKillTree() helper @km/silvercode #bug #P1 @claude:2405c72e

blocks:: [[@km/silvercode/process-mgmt]]

## What

Make agent-harness spawn factories (spawnClaude, spawnCodex, spawnSdk) return plain objects that implement [Symbol.asyncDispose] natively. Process group teardown moves to one helper. close() becomes a thin pass-through.

## Why

Reshaped from the original spawn.ts close() patch after /pro elegance review (2026-04-26):

- Original plan had a 'closed' flag (parallel derivation against proc.exitCode).
- Original plan swallowed errors on stdin/stdout/stderr destroy() (Fail Loud violation).
- Original plan used external asyncDisposable() wrapper at every call site (Quarantine-and-Delete violation: shim hides factory shape).

## New shape

```ts
// One helper — encapsulates the SIGTERM → SIGKILL → exit-await dance
function gracefulKillTree(pid: number, opts: { fallbackAfterMs: number }): Promise<void> {
  // SIGTERM the pgroup, schedule SIGKILL after fallbackAfterMs, resolve when proc exits
}

// Factory returns a plain object that IS async-disposable — no wrapper
export function spawnClaude(opts: SpawnClaudeOptions = {}): AgentSession & AsyncDisposable {
  const proc = spawn(binary, args, { detached: true, ... })
  let sentTerm = false
  // ... event wiring ...
  const exitPromise = new Promise<void>(r => proc.on('exit', () => r()))
  return {
    // ... session API ...
    async close(): Promise<void> {
      if (sentTerm) return exitPromise
      sentTerm = true
      proc.stdin?.destroy()  // let it throw if it's truly broken
      proc.stdout?.destroy()
      proc.stderr?.destroy()
      const pid = proc.pid
      if (pid !== undefined && proc.exitCode === null) {
        await gracefulKillTree(pid, { fallbackAfterMs: 10_000 })
      }
      cleanupMcpConfig?.()
      return exitPromise
    },
    [Symbol.asyncDispose]() { return this.close() },
  }
}
```

Use site shrinks to:

```ts
scope.use(spawnClaude(opts))   // session is async-disposable; no external wrapper
```

## Key shape decisions

- **'sentTerm' is NOT parallel derivation against proc.exitCode.** It's a different fact ('did we initiate teardown') vs the canonical liveness fact (proc.exitCode). Without it, two close() calls reset the SIGKILL fallback timer.
- **proc.exitCode is the liveness truth.** Used directly in the 'should we signal' check, not duplicated into a 'closed' flag.
- **Don't swallow stdio destroy() errors.** If destroy() throws, something is racy — let it surface, harden the factory.
- **gracefulKillTree() is reusable.** Same helper for spawnClaude, spawnCodex, spawnSdk, future agents.

## Tests

- Round-trip: scope.use(spawnClaude(opts)) → scope[Symbol.asyncDispose]() awaits real exit.
- Idempotent: two close() calls don't double-kill or reset the SIGKILL timer.
- SIGKILL fallback: faked child ignoring SIGTERM gets SIGKILLed at 10s.
- PID guard: close() called after natural exit doesn't signal anything.
- Stdio drain: stdout/stderr backpressure doesn't block the SIGTERM-to-exit path.

## Backwards compat

close() now returns Promise<void>. Callers in apps/silvercode/src/controller.ts (closeAll) need to await. Inspect agent-harness peer modules (acp-adapter-claude, acp-session) for the same shape.

## References

- /tmp/llm-2405c72e-elegance-review-of-the-wrw1.txt (Pro+Kimi elegance review, 2026-04-26)
- principles.md sections cited: Quarantine and Delete, Fail Loud Fail Now, No Parallel Derivation, Inverted Pyramid
- Predecessor (closed): @km/silvery/async-disposable — wrapper helper rejected in favor of factory-native dispose