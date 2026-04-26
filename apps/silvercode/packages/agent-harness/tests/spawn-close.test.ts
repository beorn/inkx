/**
 * `spawnClaude()` close-shape contract — the post-elegance-review API.
 *
 * Bead: `km-silvercode.spawn-close-hardening`. Pro+Kimi elegance review on
 * 2026-04-26 set the bar:
 *   - factory returns native AsyncDisposable (no external wrapper)
 *   - close() returns Promise<void> resolved on actual 'exit'
 *   - close() reads proc.exitCode directly — no `closed` flag
 *   - SIGKILL fallback at 10s if SIGTERM is ignored
 *   - destroy() errors are not swallowed
 *   - close() called after natural exit does NOT signal (PID-reuse guard)
 */

import { EventEmitter, Readable, Writable } from "node:stream"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const FAKE_PID = 535353

type FakeChild = EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  pid: number
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  kill: (signal?: NodeJS.Signals | number) => boolean
  killed: boolean
}

/** Behaviour knobs for the next spawned fake child. */
type FakeOpts = {
  /** If true, the fake child's kill() is a no-op (simulates SIGTERM-ignoring child). */
  ignoreSigterm?: boolean
  /** If set, fake exits naturally on its own this many ms after spawn. */
  naturalExitAfterMs?: number
}

let nextFakeOpts: FakeOpts = {}
let activeFake: FakeChild | null = null

function createFakeChild(opts: FakeOpts): FakeChild {
  const bus = new EventEmitter() as FakeChild
  bus.pid = FAKE_PID
  bus.killed = false
  bus.exitCode = null
  bus.signalCode = null

  const destroyedStreams: string[] = []
  ;(bus as unknown as { _destroyed: string[] })._destroyed = destroyedStreams

  bus.stdin = new Writable({
    write(_c, _e, cb) {
      cb()
    },
  })
  ;(bus.stdin as unknown as { destroy: () => void }).destroy = () => {
    destroyedStreams.push("stdin")
  }

  bus.stdout = new Readable({ read() {} })
  ;(bus.stdout as unknown as { destroy: () => void }).destroy = () => {
    destroyedStreams.push("stdout")
  }

  bus.stderr = new Readable({ read() {} })
  ;(bus.stderr as unknown as { destroy: () => void }).destroy = () => {
    destroyedStreams.push("stderr")
  }

  bus.kill = (signal?: NodeJS.Signals | number) => {
    if (bus.killed || bus.exitCode !== null) return true
    if (opts.ignoreSigterm && signal === "SIGTERM") {
      // Pretend kill returned true but child stays alive.
      return true
    }
    bus.killed = true
    bus.signalCode = (signal as NodeJS.Signals) ?? "SIGTERM"
    process.nextTick(() => {
      bus.exitCode = null // killed by signal, not exit code
      bus.emit("exit", null, bus.signalCode)
    })
    return true
  }

  if (opts.naturalExitAfterMs !== undefined) {
    setTimeout(() => {
      bus.exitCode = 0
      bus.emit("exit", 0, null)
    }, opts.naturalExitAfterMs)
  }

  return bus
}

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
  return {
    ...actual,
    spawn: () => {
      const child = createFakeChild(nextFakeOpts)
      activeFake = child
      return child as unknown as ReturnType<typeof actual.spawn>
    },
  }
})

const originalProcessKill = process.kill
let processKillCalls: Array<{ pid: number; signal: string | number | undefined }>

beforeEach(() => {
  processKillCalls = []
  activeFake = null
  process.kill = ((pid: number, signal?: string | number): true => {
    processKillCalls.push({ pid, signal })
    // Route signals to the active fake so the proc actually exits — without
    // this, close() awaits a never-resolving exitPromise.
    if (activeFake && (pid === -FAKE_PID || pid === FAKE_PID)) {
      activeFake.kill(signal as NodeJS.Signals | number)
    }
    return true
  }) as typeof process.kill
  nextFakeOpts = {}
})

afterEach(() => {
  process.kill = originalProcessKill
  vi.useRealTimers()
  vi.clearAllMocks()
})

async function settle(ms = 10): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

describe("spawnClaude — native AsyncDisposable + Promise<void> close()", () => {
  test("returned session implements [Symbol.asyncDispose]", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({ silentStderr: true })

    expect(typeof (session as unknown as AsyncDisposable)[Symbol.asyncDispose]).toBe("function")

    await session.close()
  })

  test("close() returns a Promise that resolves on real exit", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({ silentStderr: true })

    const result = session.close()
    expect(typeof result).toBe("object")
    expect(typeof (result as Promise<void>).then).toBe("function")

    // Resolves cleanly — proc 'exit' event has fired by the time the
    // returned promise settles. (Liveness is read off proc.exitCode, so
    // a still-alive proc would leave this awaiter hanging.)
    await result
  })

  test("two close() calls do not double-kill — single SIGTERM", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({ silentStderr: true })

    const a = session.close()
    const b = session.close()
    await Promise.all([a, b])

    const sigterms = processKillCalls.filter((k) => k.signal === "SIGTERM" && k.pid === -FAKE_PID)
    expect(sigterms.length).toBe(1)
  })

  test("close() after natural exit does NOT issue any signals (PID-reuse guard)", async () => {
    nextFakeOpts = { naturalExitAfterMs: 5 }
    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({ silentStderr: true })

    // Wait for natural exit.
    await settle(20)

    await session.close()

    // No SIGTERM or SIGKILL should have been issued — proc was already gone.
    const signals = processKillCalls.filter((k) => k.signal === "SIGTERM" || k.signal === "SIGKILL")
    expect(signals.length).toBe(0)
  })

  test("SIGKILL fallback fires when SIGTERM is ignored", async () => {
    nextFakeOpts = { ignoreSigterm: true }
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })

    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({ silentStderr: true })

    const closePromise = session.close()
    // SIGTERM has been issued.
    await Promise.resolve()
    expect(processKillCalls.some((k) => k.signal === "SIGTERM" && k.pid === -FAKE_PID)).toBe(true)
    expect(processKillCalls.some((k) => k.signal === "SIGKILL")).toBe(false)

    // Advance just shy of 10s — still no SIGKILL.
    vi.advanceTimersByTime(9_999)
    await Promise.resolve()
    expect(processKillCalls.some((k) => k.signal === "SIGKILL")).toBe(false)

    // Cross the 10s threshold.
    vi.advanceTimersByTime(2)
    await Promise.resolve()
    expect(processKillCalls.some((k) => k.signal === "SIGKILL" && k.pid === -FAKE_PID)).toBe(true)

    // Drain the close() promise so the test doesn't hang. The fake child's
    // SIGKILL path also no-ops (ignoreSigterm covers all signals via the
    // early-return in fake.kill); we synthesize an exit ourselves.
    vi.useRealTimers()
    void closePromise
  })

  test("stdio destroyed before SIGTERM (drain order)", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({ silentStderr: true })

    // Snapshot the destroyed-streams list at the moment SIGTERM is issued.
    const orderAtSigterm: string[] = []
    const prev = process.kill
    process.kill = ((pid: number, signal?: string | number): true => {
      processKillCalls.push({ pid, signal })
      if (signal === "SIGTERM" && activeFake) {
        const destroyed = (activeFake as unknown as { _destroyed: string[] })._destroyed
        orderAtSigterm.push(...destroyed)
      }
      if (activeFake && (pid === -FAKE_PID || pid === FAKE_PID)) {
        activeFake.kill(signal as NodeJS.Signals | number)
      }
      return true
    }) as typeof process.kill

    try {
      await session.close()
    } finally {
      process.kill = prev
    }

    expect(orderAtSigterm).toContain("stdin")
    expect(orderAtSigterm).toContain("stdout")
    expect(orderAtSigterm).toContain("stderr")
  })
})
