# Silvery + km Shared-Global I/O Race Audit
**Date**: 2026-04-22
**Context**: Post-discovery of stdin `wasRaw` race condition (silvery commits 2d9ab59f + cea0460b)
**Scope**: Audit for analogous META-pattern of uncoordinated concurrent mutation of shared Node.js globals

---

## Executive Summary

**Total suspects audited**: 15 surface areas  
**CONFIRMED races**: 1 (stdin raw mode — REMEDIATED with guards)  
**SUSPECT patterns**: 4 (stdout.columns/rows, multiple signal handlers, cursor-query/probe races, bracketed paste race)  
**SAFE**: 10 (process.argv, process.cwd, process.env writes, Worker postMessage, Disposable lifecycle)

**Top-3 priority findings** (see § Priority List):
1. **stdout.columns/rows read races** — stale dimension snapshot during terminal resize
2. **Multiple SIGINT handlers with wrong cleanup order** — last handler wins; others' resources leak
3. **Bracketed paste + mouse mode concurrent enable/disable** — protocol collisions under stress

---

## Detailed Audit by Surface

### 1. process.argv
**Status**: SAFE  
**Evidence**: 
- 20 grep hits across km, all reading-only: `process.argv[2]`, `process.argv.slice(2)`, `.some((a) => a.startsWith(...))`
- Zero mutations found
- All reads happen at module init time (CLI tools, tools/) before async code paths start
- No snapshot-restore pattern

**Verdict**: SAFE. Arguments are static per process invocation. No async-mutation race possible.

---

### 2. process.cwd() / process.chdir()
**Status**: SAFE (with caveat)  
**Evidence**: 
- 77 uses of `process.cwd()` found; all are READ-ONLY reference points
- Zero instances of `process.chdir()` anywhere in the codebase
- Used safely in path resolution, `findUp` searches, test setup

**Verdict**: SAFE. No code mutates cwd. If anyone adds `chdir()` mid-async in the future, it WILL race.

---

### 3. process.env writes
**Status**: SAFE (for reads; test-only writes)  
**Evidence**:
- 17 grep hits for `process.env[key] =` pattern
- All 17 occur in **test files only** (`*.test.ts`): loggily, help-overlay parity tests
- Pattern: save/modify/restore in test beforeEach/afterEach — assumes single test runs sequentially per file
- No mid-session writes in app code

**Verdict**: SAFE for production. Test files have isolated lifecycle. Production code only reads env vars (safe, immutable reference).

---

### 4. Signal Handlers (process.on('SIGINT'|'SIGTERM'|'SIGTSTP'|'SIGWINCH'))
**Status**: SUSPECT — uncoordinated cleanup order  
**Evidence**:
- **Count**: 78 signal handler registrations across km + vendor
- **Multiple handlers on same signal**: 
  - `SIGINT`: 10+ handler registrations (km-tui, km-cli daemon, km-web, silvery examples, bearly tools, tribe-daemon)
  - `SIGTERM`: 7+ handler registrations
  - `exit`: 6+ handler registrations (file writers, processes, cleanup handlers)
  
**Example call sites** (cleanup order NOT documented):
```
/Users/beorn/Code/pim/km/apps/km-web/server.ts:50           process.on("SIGINT", () => void shutdown())
/Users/beorn/Code/pim/km/apps/km-cli/src/debug-log.ts:251  process.on("exit", () => stream?.end())
/Users/beorn/Code/pim/km/apps/km-cli/src/debug-log.ts:252  process.on("SIGINT", () => stream?.end())
/Users/beorn/Code/pim/km/apps/km-cli/src/debug-log.ts:253  process.on("SIGTERM", () => stream?.end())
/Users/beorn/Code/pim/km/apps/km-cli/src/commands/daemon.ts:571   process.on("SIGINT", () => void this.stop())
/Users/beorn/Code/pim/km/apps/km-tui/src/tui.tsx:262       process.on("uncaughtException", handleError)
```

**Repro hypothesis**: Multiple components register SIGINT handlers. When user presses Ctrl+C:
1. First handler runs → closes database connection
2. Second handler runs → tries to flush logs (DB already dead)
3. Third handler runs → tries to restore terminal (log flush crashed)
Result: Cascading failures, incomplete cleanup.

**Verdict**: **SUSPECT — uncoordinated cleanup order**. Handlers stack in registration order, fire in that order. Last handler that sets `process.exitCode = 1` or calls `process.exit()` wins. Earlier handlers' resources may leak if later handlers crash. No documented cleanup dependency graph.

---

### 5. process.stdout.columns / process.stdout.rows
**Status**: SUSPECT — stale snapshot reads under concurrent resize  
**Evidence**:
- **Readers**: 44 grep hits (km-tui, silvery examples, bearly test reporters, terminfo.dev)
- **Key instances**:
```
apps/km-tui/src/tui.tsx:292-293  const cols = term.cols ?? process.stdout.columns ?? 80
apps/km-tui/src/views/TreeNode.tsx:1391  const maxVisible = process.stdout.rows ?? 50
vendor/silvery/packages/ag-term/src/ansi/term.ts:462-463  stdout.columns = c; stdout.rows = r
```

**Race scenario**:
1. React component calls `useBoxRect()` during render → reads `process.stdout.columns` → gets 120
2. Terminal is resized mid-render (SIGWINCH arrives)
3. Term-provider updates `process.stdout.columns = 80`
4. Component uses cached dimension 120 for layout
5. Next frame renders to 80-column terminal, grid corruption

**Mitigation in place**: `term-provider.ts` line 323 comment: "let the flush read the latest stdout.columns/rows — they don't cache". Resize coalescing exists per-component via `useBoxRect()` but:
- Readers not using `useBoxRect()` get stale snapshots
- `process.stdout.rows ?? 50` in `TreeNode.tsx` NEVER updates on resize

**Verdict**: **SUSPECT — stale dimension reads**. Worse case: static fallbacks (50, 80, 40) hide the race — silent layout corruption.

---

### 6. Bracketed Paste & Terminal Mode Protocols (CSI ?2004)
**Status**: SUSPECT — concurrent enable/disable without serialization  
**Evidence**:
```
apps/km-tui/src/state/raw-signals.ts:21            "\x1b[?2004l"  // Disable bracketed paste
apps/km-tui/src/handlers/paste-handler.ts:151      // Enable bracketed paste (no code shown, pattern inferred)
```

**Multiple sites register the same protocol**:
- silvery ag-term raw mode: enables bracketed paste
- km-tui paste-handler: independently enables/disables
- silvery lifecycle: cleanup disables it

**Race scenario**:
1. silvery enables bracketed paste → `\x1b[?2004h`
2. km-tui paste-handler enables it again → `\x1b[?2004h`
3. User resizes → SIGWINCH fires during ANSI processing
4. cleanup handler fires → disables `\x1b[?2004l`
5. silvery's `events()` loop still expecting bracketed paste → malformed input

**Verdict**: **SUSPECT — protocol collision**. Same pattern as raw mode: multiple sites mutating the same terminal mode without a single owner.

---

### 7. Cursor Position Query (CPR, CSI 6n)
**Status**: SUSPECT — already patched, but verify  
**Evidence**:
```
vendor/silvery/packages/ag-term/src/cursor-query.ts:59-67
  const wasRaw = stdin.isRaw
  if (!wasRaw && !otherListeners) {
    stdin.setRawMode(true)
    didSetRaw = true
  }
  try { ... await queryCursorPosition(...) }
  finally { if (didSetRaw) stdin.setRawMode(false) }
```

**Already patched with guards**: 
- Line 61: `const otherListeners = stdin.listenerCount("data") > 0` — don't set raw if others listening
- Line 64-67: only restore what we set (`if (didSetRaw)`)
- Same pattern in: `kitty-detect.ts`, `device-attrs.ts`

**Remaining risk**:
```
vendor/silvery/packages/ag-term/src/runtime/create-app.tsx:2347-2401
```
Two separate probes (probeKitty + probeColors) both doing the same guard pattern.  
If both race:
1. probeColors: `listenerCount = 0`, sets `setRawMode(true)`, starts querying
2. probeKitty: `listenerCount = 1` (probeColors' handler), skips setting raw
3. probeColors finishes, restores to false
4. probeKitty's query never gets raw input

**Verdict**: **SUSPECT — but guards in place**. The META-fix (InputOwner) will eliminate this when it ships.

---

### 8. Console Patches (patchConsole)
**Status**: SAFE (single owner per render)  
**Evidence**:
- `patchConsole()` is called ONCE at app startup: 
```
apps/km-tui/src/tui.tsx:269                options?.patchedConsole ?? patchConsole(console, { capture: true, suppress: true })
apps/km-cli/src/commands/view.ts:128-130  patchConsole(console, { capture: true, suppress: true })
```
- Once set up, console is never re-patched
- Returns immutable PatchedConsole object

**Verdict**: SAFE. Single owner per session. No concurrent patching.

---

### 9. Mouse & Focus Reporting Modes (CSI ?1000, ?1002, ?1003, ?1007, ?1004)
**Status**: SUSPECT — multiple enable/disable sites  
**Evidence**:
```
apps/km-tui/src/state/raw-signals.ts:19  "\x1b[?1007l\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l"
```

Multiple sources enable/disable:
- silvery lifecycle (terminal-lifecycle.ts)
- km-tui cleanup (raw-signals.ts)
- silvery examples (each independently)

**No serialization layer** — each component writes ANSI sequences directly to stdout.

**Race scenario**:
1. silvery enables mouse SGR mode (1006) in term-provider
2. React re-renders a component that reads mouse events
3. km-tui's paste-handler disables mouse (thinking it needs paste-only)
4. Mouse event arrives encoded for mode 1006 but terminal is now in mode 1000
5. Parser gets malformed SGR sequence

**Verdict**: **SUSPECT — protocol collision**. Same structural issue as raw mode: no single owner.

---

### 10. Worker postMessage Ordering
**Status**: SAFE  
**Evidence**:
```
packages/km-fs-mount/src/watch/worker-bridge.ts:12-19  // Uses standard Worker + postMessage
```

- Bun Worker uses message queue (FIFO)
- No concurrent writers — main thread owns the worker
- Events dispatched back to main via EventEmitter (no concurrent mutation)

**Verdict**: SAFE. Message ordering is guaranteed by JS event loop.

---

### 11. Symbol.dispose / using Lifecycle
**Status**: SAFE  
**Evidence**:
- 8 instances of `using` / `await using` found: km-fs-mount tests, async stacks
- All use standard TypeScript 5.2 disposable protocol
- No shared state mutations during dispose

**Verdict**: SAFE. Disposables are per-instance resource owners, not shared globals.

---

### 12. Module-Level Singletons & Registries
**Status**: SAFE (immutable after init)  
**Evidence**:
```
vendor/silvery/packages/ag-term/src/text-sizing.ts:105  const probeCache = new Map<string, TextSizingProbeResult>()
vendor/silvery/packages/ag-term/src/unicode.ts:336       const textPresentationEmojiCache = new Map<number, boolean>()
```

- Both caches are read-heavy, write-light
- Caches are populated once per app startup
- No cache invalidation during async render

**HitRegistry** (DOM event dispatch):
- Per-frame, created fresh each render
- Cleared after each paint
- No cross-frame mutation

**Verdict**: SAFE. Initialization ordering ensures caches are stable by the time async code runs.

---

### 13. SQLite WAL & Concurrent Writers
**Status**: SAFE  
**Evidence**:
```
packages/km-storage/src/db/  // All writes go through Repo class
packages/km-fs-mount/src/watch/bulk-sync.ts:14  // import type { Database }
```

- Single database connection per process (Repo instance)
- No multi-writer scenario (no workers writing to DB directly)
- Watcher uses change-handlers + applier pattern, not direct DB writes

**Verdict**: SAFE. Bun:sqlite WAL is thread-safe for readers; no concurrent writers to worry about.

---

### 14. File Descriptors & Log Streams
**Status**: SAFE (non-overlapping ownership)  
**Evidence**:
```
apps/km-cli/src/debug-log.ts:44-251  // Single log file writer
vendor/loggily/src/file-writer.ts:31  // process.on('exit') flush
```

- `debug-log.ts` creates a single log stream at startup
- All writes go through this stream
- Only cleanup handlers touch it

**Verdict**: SAFE. Single writer per resource (stream ownership is exclusive).

---

### 15. Terminal Title (OSC 2 / OSC 0)
**Status**: SAFE (single owner)  
**Evidence**:
```
apps/km-tui/src/views/useBoardController.ts:543  setWindowTitle(process.stdout, `km — ${breadcrumb}`)
vendor/silvery/packages/ag-react/src/render.tsx  // setWindowTitle function
```

- Called only from one place (useBoardController)
- Title is derived from app state (breadcrumb), not a global
- No race: title updates are serialized within the React render cycle

**Verdict**: SAFE. Single owner per context.

---

## Pattern Analysis: The `wasRaw` Meta-Race

The stdin `wasRaw` vulnerability exhibits a META-pattern:

```ts
// ANTI-PATTERN (races under async)
const wasX = resource.property  // ← snapshot at entry
try {
  resource.property = newValue  // ← mutate global
  await someWork()              // ← OTHER code can run here
} finally {
  if (wasX) resource.property = oldValue  // ← undo based on stale snapshot
}
```

**Why it breaks**: Under async, the finally block runs much later. Multiple "polite" tenants each capture their own snapshot, then their finally blocks execute out-of-order, and the last one to write wins — silently undoing everyone else's state.

**All of the following exhibit this META-PATTERN and should be audited further**:
1. Signal handlers (no cleanup DAG)
2. stdout.columns/rows (stale snapshots during resize)
3. Cursor-query probes (already guarded, but structure is fragile)
4. Terminal mode protocols (bracketed paste, mouse, focus reporting)

---

## Priority List: Top 3 Beads

### BEAD 1: km-silvery.input-owner (EXISTING)
**Already filed and in progress**. Mirrors OutputGuard for stdout, creates single InputOwner per session.

**Summary**: Eliminate `setRawMode` race by routing all stdin consumers through a single owner. Cursor-query, probes, and raw input all call `inputOwner.probe(...)` instead of calling `stdin.setRawMode` directly.

**Status**: Architectural fix shipping soon.

---

### BEAD 2: km-silvery.terminal-protocol-owner (SUGGESTED)
**Title**: "Single owner for terminal mode protocols (bracketed paste, mouse, focus reporting)"

**Scope**: Implement `TerminalProtocolOwner` (parallel to `OutputGuard`) that:
- Owns enable/disable of: bracketed paste (2004), mouse modes (1000-1007), focus reporting (1004)
- Routes all protocol mutations through this owner
- Tracks enabled state per protocol
- Prevents re-enabling already-enabled, prevents disabling already-disabled

**Rationale**: Same META-pattern as `wasRaw` but across 6 different terminal modes. Each can race independently.

**Evidence**: 
- raw-signals.ts cleanup fires after lifecycle cleanup
- paste-handler may enable while silvery is disabling
- multiple examples enable/disable independently

**Test scenario**: Stress test with frequent resize (SIGWINCH) + paste events + focus changes. Verify no protocol collision.

---

### BEAD 3: km-signal-handler-registry (SUGGESTED)
**Title**: "Signal handler cleanup dependency graph with documented order"

**Scope**: 
1. Audit all 78 signal handler registrations
2. Build a dependency graph (e.g., "close database before flushing logs")
3. Create a `SignalRegistry` that:
   - Lets handlers register with dependencies
   - Fires handlers in dependency order on signal
   - Catches errors to prevent one handler's crash from blocking others
4. Migrate all km + silvery signal handlers to use it

**Rationale**: Currently, handlers are uncoordinated. If a late handler crashes, earlier handlers' resources leak. A registry ensures cleanup happens in the right order.

**Evidence**: 
- 10+ SIGINT handlers, no documented order
- file-writer.ts expects `exit` handler to fire, but other handlers might `process.exit()` first
- No mechanism to prevent "reentrant signal during cleanup" crashes

**Test scenario**: 
- Register 3 handlers with dependency graph A → B → C
- Fire signal, inject crash in B
- Verify C still runs, A cleaned up properly

---

## Recommendations

1. **Short term**: Accept SUSPECT findings #5 (stdout.columns/rows) and #6 (bracketed paste) as accepted risks. They're lower-impact than `wasRaw` (no silent input loss, just layout stale/protocol collision under stress).

2. **Medium term**: File beads 2 and 3 (TerminalProtocolOwner, SignalRegistry) for next-cycle. Both are architecturally important but not critical-path.

3. **Audit cadence**: Add "race audit" to pre-release checklist. Use SILVERY_STRICT mode to flush out timing bugs. Fuzz-test SIGINT during resize.

4. **Structural principle**: "No shared mutable global without a single owner per session". Every resource that can be mutated by async code paths needs a coordinator (Guard, Owner, Registry).

---

## Appendix: Grep Command Reference

Run these to validate findings:

```bash
# stdin races
grep -rn "setRawMode\|wasRaw" vendor/silvery/packages/ag-term/src

# signal handlers (all registration sites)
grep -rn "process\.on(" /Users/beorn/Code/pim/km --include="*.ts" | wc -l

# stdout dimensions (all read sites)
grep -rn "stdout\.columns\|stdout\.rows" /Users/beorn/Code/pim/km

# module-level mutable globals
grep -rn "const.*= new Map\|const.*registry" vendor/silvery/packages/ag-term/src

# SQLite usage (single writer pattern)
grep -rn "bun:sqlite\|\.exec\|\.prepare" packages/km-storage/src
```

---

**Audit complete**. Report written: 2026-04-22 @ <time>  
**Next step**: Prioritize beads, assign, and ship.
