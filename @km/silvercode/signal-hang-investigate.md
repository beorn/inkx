---
id: "@km/silvercode/signal-hang-investigate"
aliases:
  - km-silvercode.signal-hang-investigate
  - km-silvercode-signal-hang-investigate
created_by: claude:cc081a9a
created_at: 2026-04-28T04:37:18Z
started_at: 2026-04-28T04:47:41Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
---

# [/] [bug] silvercode bootstrap can wedge at 100% CPU and ignores SIGTERM (only SIGKILL reaps it) @km/silvercode #bug #P1 @claude:cc081a9a

## Symptom
Six `bun apps/silvercode/src/bootstrap.ts --account d@delei.org` processes
were observed pinned at 99.7% CPU for 1.5+ hours each. All were wrapped
in coreutils `timeout 6` / `timeout 12` / `timeout 18`. The `timeout`
parent had long since exited; the bun child was orphaned and unreapable
without `kill -9`.

## Root chain (5 Whys, partial)
1. **Why pegged?** bun's main thread is in a tight JS loop — sample
   on PID 508 showed 100% CPU stuck deep in V8/JSC frames at the same
   addresses (`0x12c0f00a0`, `0x12c0f0070`), classic JIT'd hot loop.
2. **Why didn't `timeout` kill it?** `timeout` defaults to SIGTERM.
   bun has SIGTERM listeners (silvery's `term.signals.on('SIGTERM',
   onSignal)` at create-app.tsx:860, plus App.tsx:1053 prints resume
   hints), but JS-level signal handlers can't dispatch while the JS
   thread is in a wedged tight loop. SIGTERM is queued forever.
3. **Why is the loop wedged?** Unknown. Likely candidates:
   - An unhandled promise rejection retry loop in the controller's
     eager `spawnSession()` chain
   - A native-binding spin (accountly probe? alien-signals
     subscriber?)
   - A `setInterval` with sync work that re-fires before the previous
     run finishes
   The 100% CPU + JIT'd-loop signature points away from a simple
   I/O wait.
4. **Why does the bootstrap allow this?** bootstrap.ts only handled
   SIGINT (`process.on('SIGINT')`) prior to this bead's first patch.
   SIGTERM had no fast-exit fallback. Even with the patch, a `while(true)`
   loop blocks setTimeout callbacks too — the only true escape is
   external SIGKILL.
5. **Why never caught?** No probe / smoke test runs silvercode under
   conditions that trigger the wedge AND verifies the process exits
   cleanly within a budget. The cli-smoke test exits at the pre-flight
   gate before the wedge path can fire.

## Mitigations landed in <commit>
- `bootstrap.ts` now installs a SIGTERM fast-exit handler matching the
  existing SIGINT one (helpful for "soft hang during cleanup" only —
  does NOT save you from a wedged JS loop).
- `tests/cli-smoke.test.ts` passes `killSignal: 'SIGKILL'` to
  spawnSync so test timeouts reap the child instead of leaving it
  spinning.

## What still needs to be fixed
- Identify what's actually looping. Suggested probe:
  ```
  bun apps/silvercode/src/bootstrap.ts --account d@delei.org &
  PID=$!
  sleep 5
  sample $PID 5 -file /tmp/silvercode-wedge.sample.txt
  kill -9 $PID
  ```
- Add a smoke test that launches `silvercode` with a credentialled
  account, asserts it reaches a known render frame within a budget,
  and reaps with SIGKILL on timeout.
- Consider adding a watchdog inside bootstrap: if the React tree
  hasn't mounted within N seconds, log diag + force-exit.

## Probe-safety contract for callers
External callers spawning silvercode for testing MUST use one of:
- `timeout --kill-after=2 8 bun apps/silvercode/src/bootstrap.ts ...`
- Node's `spawnSync(..., { killSignal: 'SIGKILL' })`
- Manual `kill -9 $!` after `timeout` exits
Plain `timeout 8 ...` will leak a 100% CPU process on the wedge path.

## Severity
P1 — leaves zombie processes consuming a CPU core indefinitely. The
6-process snapshot was using ~6 cores worth of compute that survives
shell sessions and must be hand-reaped.