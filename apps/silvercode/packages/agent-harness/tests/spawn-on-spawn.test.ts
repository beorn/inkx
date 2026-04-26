/**
 * `spawnClaude({ onSpawn, onExit })` — supervisor wiring.
 *
 * Tests the new `onSpawn` / `onExit` callback hooks added so silvercode's
 * process supervisor can record children in a per-vault registry. We mock
 * `node:child_process` so we can observe the callback fires without
 * actually invoking `claude` (which isn't on PATH in CI).
 */

import { EventEmitter, Readable, Writable } from "node:stream"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const FAKE_PID = 424242

function createFakeChild(): EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  pid: number
  kill: () => boolean
  killed: boolean
} {
  const bus = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: Readable
    stderr: Readable
    pid: number
    kill: () => boolean
    killed: boolean
  }
  bus.pid = FAKE_PID
  bus.stdin = new Writable({
    write(_c, _e, cb) {
      cb()
    },
  })
  bus.stdout = new Readable({
    read() {
      this.push(null)
    },
  })
  bus.stderr = new Readable({
    read() {
      this.push(null)
    },
  })
  bus.killed = false
  bus.kill = () => {
    bus.killed = true
    process.nextTick(() => bus.emit("exit", null, "SIGTERM"))
    return true
  }
  // Emit exit asynchronously so spawnClaude's listeners attach first.
  process.nextTick(() => bus.emit("exit", 0, null))
  return bus
}

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
  return {
    ...actual,
    spawn: () => createFakeChild() as unknown as ReturnType<typeof actual.spawn>,
  }
})

describe("spawnClaude — onSpawn / onExit callbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("onSpawn fires synchronously after spawn with pid + pgid", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const calls: Array<{ pid: number; pgid: number }> = []
    const session = spawnClaude({
      silentStderr: true,
      onSpawn: (info) => calls.push(info),
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.pid).toBe(FAKE_PID)
    // `detached: true` makes pid === pgid — that's a hard contract: silvercode
    // relies on it to call `process.kill(-pgid, ...)`.
    expect(calls[0]?.pgid).toBe(FAKE_PID)
    session.close()
  })

  test("onExit fires when the child exits", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const exits: Array<{ pid: number; code: number | null; signal: NodeJS.Signals | null }> = []
    const session = spawnClaude({
      silentStderr: true,
      onExit: (info) => exits.push(info),
    })
    // Wait a tick for the synthetic exit emit.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(exits.length).toBeGreaterThan(0)
    expect(exits[0]?.pid).toBe(FAKE_PID)
    session.close()
  })

  test("onSpawn throw is swallowed — spawn still returns a session", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    // Supervisor bookkeeping must NEVER block spawn. If onSpawn throws,
    // we log it (debug) and continue — the user's session works regardless.
    const session = spawnClaude({
      silentStderr: true,
      onSpawn: () => {
        throw new Error("supervisor blew up")
      },
    })
    expect(session).toBeDefined()
    expect(typeof session.send).toBe("function")
    session.close()
  })

  test("no onSpawn/onExit → spawn behaves identically (no callbacks invoked)", async () => {
    // Just ensure the absence of callbacks doesn't break the path.
    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({ silentStderr: true })
    expect(session).toBeDefined()
    session.close()
  })
})
