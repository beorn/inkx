---
mentions:
  - km
id: "@km/silvery/input-owner"
aliases:
  - km-silvery.input-owner
  - km-silvery-input-owner
created_by: claude:019d032d
created_at: 2026-04-22T20:34:27Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.input-owner
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-22T13:34:29Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-silvery.input-owner
    depends_on_id: km-silvery.term-sub-owners
    type: blocks
    created_at: 2026-04-22T13:47:53Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery
      - type: link
        target: km-silvery.term-sub-owners
---

# [ ] Centralize stdin ownership (InputOwner) — eliminate the wasRaw race class @km/silvery #task #P1

blocks:: [[@km/silvery]], [[@km/silvery/term-sub-owners]]

silvery already has OutputGuard (stdout single-owner) and forwardConsole (worker → main). The third leg is missing: stdin. Today every probe (probeColors, queryCursorFromStdio, detectKittyFromStdio, queryDeviceAttributes, text-sizing probe, width-detection probe — all in vendor/silvery/packages/ansi/src/theme/detect.ts and vendor/silvery/packages/ag-term/src/{cursor-query,kitty-detect,device-attrs,runtime/create-app}.ts) reaches into process.stdin directly and uses a 'snapshot wasRaw at entry, restore in finally' protocol that's not async-safe. Concurrent probes (or a probe overlapping with term-provider startup) silently disable each other.

Today's session shipped four race-safety patches (silvery 2d9ab59f + cea0460b) and the team is now in 'didSetRaw + listenerCount' tenant-side mode. Works, but there are 19 wasRaw sites and 57 direct stdin/stdout call sites; the next race is just one new probe away.

Reframe: extend the OutputGuard pattern to stdin.

DESIGN

- InputOwner.ts (mirrors output-guard.ts): single owner of process.stdin for the silvery session lifetime.
- Owns: raw mode (set once at start, restored once at end), stdin.on('data', …) (one listener, fans out), bracketed paste enable/disable, kitty keyboard enable/disable, focus reporting.
- Public API: probe(query: string, parse: (chunk: string) => T | null, timeoutMs: number): Promise<T | null>. Sends query to stdout (via OutputGuard), accumulates incoming bytes, calls parse on each chunk, resolves on first non-null parse or timeout.
- Probes lose all stdin handling; they become: { send: '\x1b]11;?\x07', parse: matchOSC11 } and call session.input.probe(query, parse).
- Term-provider becomes the InputOwner — its existing role (own stdin, route key events) absorbs probe routing too.

ROLLOUT

- Phase 1: ship InputOwner alongside existing probes. probeColors migrates to it as the canonical example. Verify zero behaviour change.
- Phase 2: migrate the 4 other probes. Each loses ~10 LOC.
- Phase 3: lint rule banning process.stdin.setRawMode and process.stdin.on('data', …) outside vendor/silvery/packages/ag-term/src/runtime/.
- Phase 4: same treatment for OSC color response leak on TUI exit (InputOwner.dispose drains).

RELATED

- Same META-pattern as forwardConsole (workers don't write stdout, post to owner) and OutputGuard (one writer for stdout, suppress others). All three are 'single owner of shared global I/O'. Filing this bead documents that pattern as silvery's standard.
- Closes the race class. Doesn't help the layout-churn bug (@km/silvery/layout-churn-leaks-pixels) — that's a different mechanism (incremental render pixel leak on layout reflow, not async I/O race).

