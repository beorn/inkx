---
id: "@km/silvery/console-hygiene-default"
aliases:
  - km-silvery.console-hygiene-default
  - km-silvery-console-hygiene-default
created_by: claude:22c2717d
created_at: 2026-04-26T04:53:47Z
closed_at: 2026-04-26T05:29:46Z
close_reason: Closed
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.console-hygiene-default
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-25T21:54:05Z
    created_by: claude:22c2717d
    metadata: "{}"
---

# [x] Silvery: foolproof console/debug suppression by default in alt-screen @km/silvery #feature #P1

blocks:: [[@km/all]]

Every new silvery alt-screen app keeps re-discovering that console.log / debug() / process.stderr.write leak into the rendered UI. @km/_orphan/cli + silvercode each ship 100-254 LOC of debug-log.ts boilerplate. Silvery's example CLI just had to add the same guard for `bun design` (silvery a03f6911 quick fix). This bead makes the framework do it automatically — using the LEAST intrusive mechanism that solves the leak.

## Root cause

The `debug` npm package writes to `process.stderr.write` directly at log time. silvery has `term.output.capture()` which patches stdout/stderr to suppress writes during alt-screen — but its current behavior is to DROP writes (or redirect to DEBUG_LOG when set), and it's OPT-IN at the call site, not a default of run().

## Approach: extend the existing buffer-and-replay model

silvery already has `term.console.capture()` that buffers `console.*` calls during alt-screen and replays them on exit so the operator sees what was logged. We extend the same pattern to `term.output.capture()` so direct stderr writes (where `debug()` writes) are buffered during alt-screen and replayed to the normal screen on exit.

NO module-load side effects. NO hidden log files. NO new env vars. Same buffer-and-replay model the user already knows from the Console device. When the user exits, they see "STDERR (captured during run):\n...". When DEBUG_LOG is explicitly set, output goes there too — but that stays opt-in.

## Acceptance criteria

### Layer 1 — `run()` auto-enables capture

```ts
export async function run(element, term, opts = {}) {
  const altScreen = opts.altScreen ?? true
  if (altScreen) {
    term.output.capture()           // buffer stdout/stderr writes
    term.console.capture({ tap: true })  // buffer + tap console.*
  }
  ...
}
```

When the alt-screen restores on exit, both buffers replay to the normal streams. Caller can override via `opts.captureConsole = false`.

- [ ] `bun design` (or any silvery alt-screen example with `run()`) shows ZERO leaks during alt-screen, regardless of console.log / console.error / debug() / process.stderr.write
- [ ] On exit, captured output prints to the normal terminal so the operator sees what was logged
- [ ] Env var `SILVERY_NO_CAPTURE=1` opts out for debugging

### Layer 2 — `term.output.capture()` MUST handle direct process.stderr.write

The `debug` package writes to `process.stderr.write` directly. Verify the existing patch catches that — if not, extend `Output.capture()` to wrap `process.stderr.write` (and stdout) in addition to console.*.

- [ ] Test: `process.stderr.write("foo")` during alt-screen → captured, not visible in render
- [ ] Test: `import "debug"; const d = createDebug("test"); d("hello")` during alt-screen → captured + replayed on exit
- [ ] Test: third-party `debug` consumers (node-fetch, anthropic SDK) also captured

### Layer 3 — DEBUG_LOG stays the explicit file-based escape hatch

For long-lived processes / observability, users can still set `DEBUG_LOG=path` to mirror captured output to a file. Default behavior (no env var) is buffer-and-replay-on-exit only. No default file path, no auto-rotation, no new state directories.

### Migration of existing per-app boilerplate

- [ ] @km/_orphan/cli's debug-log.ts (254 LOC): becomes ≤20 LOC override (only the LOG_LEVEL default + any app-specific writer routing)
- [ ] silvercode's debug-log.ts (98 LOC): becomes ≤20 LOC override
- [ ] vendor/silvery/examples/bin/cli.ts: drop the LOG_LEVEL/DEBUG defaults — framework handles it

## Out of scope

- Replacing the `debug` npm package itself
- Lint rules banning console.log
- File-based logging by default (Layer 3 stays explicit)

## Why P1

Every new silvery TUI app re-discovers this. The friction is high enough that storybook (built post-Sterling) shipped with the bug. Buffer-and-replay default eliminates the entire class with the LEAST intrusive mechanism that already exists in silvery.