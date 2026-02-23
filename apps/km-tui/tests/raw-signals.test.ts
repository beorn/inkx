/**
 * Raw signal handler tests
 *
 * Verifies that Ctrl+C (\x03) and Ctrl+Z (\x1a) are handled correctly
 * when stdin is in raw mode. These bypass the command system intentionally —
 * they must work even before the TUI renders.
 */

import { describe, it, expect, vi } from "vitest"
import { createRawSignalHandler, type SignalHandlerDeps } from "../src/raw-signals.ts"

/** Create mock deps for testing without touching the real process */
function createMockDeps(): SignalHandlerDeps & {
  exitCode: number | null
  killSignal: string | null
  sigcontHandler: (() => void) | null
  rawMode: boolean
  writtenData: string[]
  emittedEvents: string[]
} {
  const mock = {
    exitCode: null as number | null,
    killSignal: null as string | null,
    sigcontHandler: null as (() => void) | null,
    rawMode: false,
    writtenData: [] as string[],
    emittedEvents: [] as string[],
    exit: vi.fn((code: number) => {
      mock.exitCode = code
    }),
    kill: vi.fn((_pid: number, signal: string) => {
      mock.killSignal = signal
    }),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === "SIGCONT") {
        mock.sigcontHandler = handler
      }
    }),
    stdin: {
      isTTY: true,
      isRaw: true,
      setRawMode: vi.fn((mode: boolean) => {
        mock.rawMode = mode
      }),
    },
    stdout: {
      write: vi.fn((data: string) => {
        mock.writtenData.push(data)
      }),
      emit: vi.fn((event: string) => {
        mock.emittedEvents.push(event)
      }),
    },
  }
  return mock
}

describe("createRawSignalHandler", () => {
  describe("Ctrl+C (\\x03)", () => {
    it("calls exit with code 130", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x03]))

      expect(deps.exit).toHaveBeenCalledWith(130)
      expect(deps.exitCode).toBe(130)
    })

    it("does not send SIGTSTP", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x03]))

      expect(deps.kill).not.toHaveBeenCalled()
    })
  })

  describe("Ctrl+Z (\\x1a)", () => {
    it("sends SIGTSTP to self", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x1a]))

      expect(deps.kill).toHaveBeenCalledWith(process.pid, "SIGTSTP")
      expect(deps.killSignal).toBe("SIGTSTP")
    })

    it("does not call exit", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x1a]))

      expect(deps.exit).not.toHaveBeenCalled()
    })

    it("registers a one-time SIGCONT handler", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x1a]))

      expect(deps.once).toHaveBeenCalledWith("SIGCONT", expect.any(Function))
      expect(deps.sigcontHandler).not.toBeNull()
    })

    it("SIGCONT handler re-enters raw mode when TTY", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x1a]))
      // Simulate resume
      deps.sigcontHandler!()

      expect(deps.stdin.setRawMode).toHaveBeenCalledWith(true)
      expect(deps.rawMode).toBe(true)
    })

    it("SIGCONT handler restores alternate screen", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x1a]))
      deps.sigcontHandler!()

      // Should write alternate screen + clear + home + hide cursor
      expect(deps.stdout.write).toHaveBeenCalled()
      const written = deps.writtenData.join("")
      expect(written).toContain("\x1b[?1049h") // Enter alternate screen
      expect(written).toContain("\x1b[2J") // Clear screen
      expect(written).toContain("\x1b[?25l") // Hide cursor
    })

    it("SIGCONT handler emits resize event", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x1a]))
      deps.sigcontHandler!()

      expect(deps.stdout.emit).toHaveBeenCalledWith("resize")
    })

    it("SIGCONT handler skips setRawMode when not TTY", () => {
      const deps = createMockDeps()
      deps.stdin.isTTY = false
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x1a]))
      deps.sigcontHandler!()

      // setRawMode should NOT be called (not a TTY)
      expect(deps.stdin.setRawMode).not.toHaveBeenCalled()
      // But alternate screen should still be restored
      expect(deps.stdout.write).toHaveBeenCalled()
    })
  })

  describe("other bytes", () => {
    it("ignores regular characters", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([0x61])) // 'a'

      expect(deps.exit).not.toHaveBeenCalled()
      expect(deps.kill).not.toHaveBeenCalled()
    })

    it("ignores empty buffer", () => {
      const deps = createMockDeps()
      const handler = createRawSignalHandler(deps)

      handler(Buffer.from([]))

      expect(deps.exit).not.toHaveBeenCalled()
      expect(deps.kill).not.toHaveBeenCalled()
    })
  })
})
