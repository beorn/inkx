# silvercode test process-harness

Spawns silvercode in a real PTY-backed subprocess so tests can drive it
through alt-screen ANSI exactly as a user would. Sibling to `createTermless`
(in-process emulator harness) — use the right one for the job.

## When to reach for which harness

| Situation                                                    | Use                       |
| ------------------------------------------------------------ | ------------------------- |
| Component-level visual contract, mid-turn UI state           | `createTermless` (faster) |
| Cursor position / hardware-cursor visibility                 | **process-harness**       |
| Alt-screen / DECRPM / Kitty keyboard probe sequences         | **process-harness**       |
| Anything that depends on `process.stdout.isTTY === true`     | **process-harness**       |
| Running the actual `bun silvercode` binary                   | **process-harness**       |
| Driving fake AgentSession through `<App />` with React state | `createTermless`          |

`createTermless` is ~50ms/op; the process harness is ~1-2s/op (bun startup +
first frame). Prefer in-process unless you need a real PTY.

## Quickstart

```ts
import { spawnSilvercode } from "../process-harness/index.ts"

test("welcome screen mounts", async () => {
  await using harness = await spawnSilvercode({ cols: 120, rows: 40 })
  await harness.waitFor("Silver Code for Claude Code")
  expect(harness.screen).toContainText("Silver Code")
})
```

Use `await using` so the child + temp dirs are cleaned up even when assertions
throw. The handle implements `Symbol.asyncDispose`.

## What's actually spawned

By default, `spawnSilvercode()` spawns:

```
bun apps/silvercode/tests/process-harness/test-entry.tsx
```

`test-entry.tsx` imports the real `<App />` and runs it through real `silvery
.run()`, but injects a `spawnFactory` that returns a `ScriptedFakeSession`
instead of spawning real `claude --bare -p`. This means:

- The child sees a real TTY (PTY slave fd) → `nonTTYMode` resolves correctly
- silvery's alt-screen / cursor / Kitty probes run for real
- No claude binary, no API key, no network — fully offline
- `installFakes()` runs inside the subprocess so account / version / branch
  boundaries return deterministic values

To spawn the _production_ CLI (`bun silvercode`), pass `entryPath`:

```ts
const harness = await spawnSilvercode({
  entryPath: "/abs/path/to/apps/silvercode/src/bootstrap.ts",
  argv: ["--bare"],
})
```

Be aware: production bootstrap will try to spawn `claude` and needs a real
account. Almost no test wants this — pick `test-entry.tsx`.

## stdout vs stderr

PTYs unify stdout + stderr into a single byte stream — that's how PTYs work,
not a harness limitation. The real silvercode CLI sidesteps this with the
`DEBUG_LOG` env var: `debug-log.ts` redirects `loggily` and `debug()` writes
to a file instead of console, so the alt screen UI never gets polluted.

The harness reuses that mechanism: `DEBUG_LOG` is auto-pointed at a temp
file, exposed as `harness.stderr`:

```ts
await using harness = await spawnSilvercode()
// ... drive UI ...
harness.stderr.toContain("controller: spawn session")
expect(harness.stderr.lines().some((l) => l.includes("ERROR"))).toBe(false)
```

`harness.stderr.text()` reads on demand (re-reads the file each call), so
late-arriving log writes are visible. Disable with `captureStderr: false` for
negative tests that need to see stderr land in the PTY stream.

## Environment requirements

- **Bun** is the runtime. The harness shells out to `bun` via PTY; it does
  not work under pure Node.
- Bun ships native PTY support — no `node-pty` install required.
- Tests must be in the default vitest project (not `.slow.`) — but expect
  ~1.5-3s per test due to subprocess boot.

## Debug knobs

| Env var                                  | Effect                                       |
| ---------------------------------------- | -------------------------------------------- |
| `DEBUG_LOG=/tmp/sc.log`                  | (set automatically) — the child's debug sink |
| `DEBUG=km:*,silvery:*` (forward via env) | Activate debug namespaces in the child       |
| `SILVERY_STRICT=1` (forward via env)     | Strict-mode invariants in the child          |

Forward env vars via the `env` option:

```ts
await spawnSilvercode({ env: { DEBUG: "silvery:*" } })
```

The child's DEBUG_LOG will then accumulate every silvery debug line, readable
through `harness.stderr.text()`.

## Tracking bead

`km-silvercode.test-process-harness` (P2). Sibling: `km-silvercode.cursor
-startup-position` (P1) — that bug is the original motivator and the
canonical regression test under `tests/process/`.
