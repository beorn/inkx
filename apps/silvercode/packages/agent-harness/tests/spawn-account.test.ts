import { EventEmitter, Readable, Writable } from "node:stream"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Multi-account wiring — `spawnClaude({ configDir })` must land on the
 * subprocess as `env.CLAUDE_CONFIG_DIR` so claude reads creds from the
 * per-account dir instead of `~/.claude/`.
 *
 * We intercept `node:child_process.spawn` so we can inspect the env passed
 * to the subprocess without actually executing `claude` (which isn't on PATH
 * in CI). The fake ChildProcess exits cleanly on close() so the session
 * lifecycle still terminates deterministically.
 */

type CapturedCall = {
  command: string
  args: readonly string[]
  options: { env?: Record<string, string | undefined>; cwd?: string }
}

const captured: CapturedCall[] = []

function createFakeChild(): EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  kill: () => boolean
  killed: boolean
} {
  const bus = new EventEmitter() as EventEmitter & {
    stdin: Writable
    stdout: Readable
    stderr: Readable
    kill: () => boolean
    killed: boolean
  }
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
  // Emit exit asynchronously so spawnClaude's listeners are attached first.
  process.nextTick(() => bus.emit("exit", 0, null))
  return bus
}

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
  return {
    ...actual,
    spawn: (command: string, args: readonly string[], options: CapturedCall["options"]) => {
      captured.push({ command, args, options })
      return createFakeChild() as unknown as ReturnType<typeof actual.spawn>
    },
  }
})

describe("spawnClaude — multi-account (configDir)", () => {
  beforeEach(() => {
    captured.length = 0
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("configDir propagates to env.CLAUDE_CONFIG_DIR", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({ configDir: "/fake/silvercode/accounts/work", silentStderr: true })

    expect(captured).toHaveLength(1)
    const call = captured[0]!
    expect(call.options.env?.CLAUDE_CONFIG_DIR).toBe("/fake/silvercode/accounts/work")
    // Session lifecycle must still terminate cleanly — the fake child exits
    // immediately, which maps to a session-end event.
    await session.close()
  })

  test("no configDir → CLAUDE_CONFIG_DIR is whatever was already in the parent env", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const before = process.env.CLAUDE_CONFIG_DIR
    // Clear so we can assert the spawner didn't synthesize a value.
    delete process.env.CLAUDE_CONFIG_DIR
    try {
      const session = spawnClaude({ silentStderr: true })
      expect(captured).toHaveLength(1)
      const call = captured[0]!
      expect(call.options.env?.CLAUDE_CONFIG_DIR).toBeUndefined()
      await session.close()
    } finally {
      if (before !== undefined) process.env.CLAUDE_CONFIG_DIR = before
    }
  })

  test("configDir + mcpServers both wire through (independent concerns)", async () => {
    const { spawnClaude } = await import("../src/spawn.ts")
    const session = spawnClaude({
      configDir: "/fake/accounts/work",
      mcpServers: [{ name: "km", command: "bun", args: ["run", "/fake/km-bin.ts"] }],
      silentStderr: true,
    })

    expect(captured).toHaveLength(1)
    const call = captured[0]!
    // CLAUDE_CONFIG_DIR still reaches the subprocess.
    expect(call.options.env?.CLAUDE_CONFIG_DIR).toBe("/fake/accounts/work")
    // And --mcp-config / --strict-mcp-config were appended — the MCP config
    // file path goes through the CLI flag, not CLAUDE_CONFIG_DIR, so they
    // don't collide.
    expect(call.args).toContain("--mcp-config")
    expect(call.args).toContain("--strict-mcp-config")
    await session.close()
  })
})
