---
mentions:
  - km
id: "@km/silvercode/signal-hang-reproducer"
aliases:
  - km-silvercode.signal-hang-reproducer
  - km-silvercode-signal-hang-reproducer
created_by: claude:cc081a9a
created_at: 2026-04-28T04:58:53Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.signal-hang-reproducer
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T21:58:57Z
    created_by: claude:cc081a9a
    metadata: "{}"
  - issue_id: km-silvercode.signal-hang-reproducer
    depends_on_id: km-silvercode.signal-hang-investigate
    type: discovered-from
    created_at: 2026-04-27T21:58:53Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode
      - type: link
        target: km-silvercode.signal-hang-investigate
---

# [ ] [bug] silvercode wedge needs reliable reproducer + root cause @km/silvercode #bug #P2

blocks:: [[@km/silvercode]], [[@km/silvercode/signal-hang-investigate]]

## Status

Discovered while investigating `km-silvercode.signal-hang-investigate`. The
mitigations in commit `fa256ff5c` (SIGTERM fast-exit in bootstrap.ts +
killSignal:SIGKILL in cli-smoke.test.ts) successfully reap silvercode
processes within budget, but the **wedge cause itself is still unknown**.

## What was investigated and ruled out

Worktree: `bug/signal-hang-root-cause` (this session, 2026-04-27).

- Probe recipe (`bun bootstrap.ts --account d@delei.org` + sleep 5 + `sample`)
  did NOT reproduce the wedge. Process sat at 0% CPU, blocked in `kevent64`
  (the Bun event loop is correctly idle). Sample at
  `/tmp/silvercode-wedge.sample.txt` (during investigation; cleaned up).
- 5x stress-test SIGTERM at random delays (0.1s..0.9s post-launch) — all 5
  exited cleanly within budget. The mitigation works.
- Ran the `timeout 6/12/18` pattern from the original incident — no orphans
  survived.
- Code search for retry loops / setInterval / while(!done) in:
  - `apps/silvercode/src/controller.ts` — single-shot eager `void
    spawnSession()` (line 1262), no retry on failure. Spawn cap at 8.
  - `apps/silvercode/packages/agent-harness/src/{spawn,acp-client,acp-session,parse}.ts`
    — only bounded loops (regex iteration, fixed-point tag stripper that
    monotonically shrinks, watchdog one-shots).
  - `vendor/silvery/packages/ag-term/src/renderer.ts:983` —
    `while ((chunk = stdinStream.read?.()) !== null && chunk !== undefined)`.
    THEORETICAL spin if `read()` returns "" repeatedly during a 'readable'
    burst. Not reproduced; left as a candidate.

The original sample-output mentioned in the parent bead pointed at JIT'd
JSC frames `0x12c0f00a0` / `0x12c0f0070` — without symbols, those are bun's
internal V8/JSC code stubs, so the call site is not directly recoverable
from the parent bead's evidence either.

## Reproducer requirements (what the next investigator needs)

To root-cause the wedge, we need EITHER:

1. **A live wedge in-the-act.** When the next 100% CPU silvercode appears,
   BEFORE killing it run:
  ```
  PID=<pid>
  sample $PID 10 -file /tmp/silv-wedge.txt
  sudo dtrace -n 'profile-997 /pid == '$PID'/ { @[ustack(20)] = count(); } tick-10s { exit(0); }' \
    > /tmp/silv-wedge.dtrace.txt
  lldb -p $PID -b -o "thread list" -o "thread backtrace all" > /tmp/silv-wedge.lldb.txt
  ```

  The dtrace + lldb data give us symbolic frames the bare sample lacks.
2. **A deterministic reproducer.** Whatever the user did the day of the
   incident — agent change, network blip, MCP startup ordering, focus-loss
   during alt-screen entry — needs to be replayed in a script. The original
   was `timeout 6/12/18 bun bootstrap.ts --account d@delei.org` with NO
   surrounding context recorded.

## Acceptance criteria

- A failing test case (vitest, fuzz, or shell smoke) that reliably wedges
  silvercode at 100% CPU pre-mitigation. Pre-mitigation = either (a) revert
  fa256ff5c temporarily or (b) override `installFastExit` in the test
  fixture.
- Root cause identified (specific function / loop / native call).
- Fix shipped that prevents the wedge (proper backoff, await async
  correctly, debounce, etc.).
- This bead and `km-silvercode.signal-hang-investigate` closed citing the
  cause + fix.

## What is already shipped (do NOT re-do)

- `apps/silvercode/src/bootstrap.ts` `installFastExit("SIGTERM", 143)` +
  `installFastExit("SIGINT", 130)` (commit fa256ff5c).
- `apps/silvercode/tests/cli-smoke.test.ts` `killSignal: "SIGKILL"` (commit
  fa256ff5c).
- `apps/silvercode/tests/cli-smoke.test.ts` SIGTERM-mitigation regression
  test in the post-mount path (this branch, `bug/signal-hang-root-cause`).

