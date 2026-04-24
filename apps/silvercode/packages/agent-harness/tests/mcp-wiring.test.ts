import { existsSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { materializeMcpConfig } from "../src/spawn.ts"

/**
 * White-box tests for the --mcp-config materializer. The JSON shape is what
 * `claude --mcp-config <file> --strict-mcp-config` consumes — if it drifts,
 * spawned sessions won't mount our MCP servers.
 */
describe("materializeMcpConfig", () => {
  const cleanupQueue: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanupQueue.splice(0)) c()
  })

  test("writes mcp-config.json with the mcpServers block", () => {
    const { path, cleanup } = materializeMcpConfig([
      { name: "km", command: "bun", args: ["run", "/path/to/km-bin.ts"] },
      {
        name: "tribe",
        command: "bun",
        args: ["run", "/path/to/tribe-bin.ts"],
        env: { TRIBE_SESSION_NAME: "alice" },
      },
    ])
    cleanupQueue.push(cleanup)

    expect(existsSync(path)).toBe(true)
    expect(path.endsWith("mcp-config.json")).toBe(true)

    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>
    }
    expect(Object.keys(parsed.mcpServers).sort()).toEqual(["km", "tribe"])
    expect(parsed.mcpServers.km).toMatchObject({
      command: "bun",
      args: ["run", "/path/to/km-bin.ts"],
    })
    expect(parsed.mcpServers.tribe).toMatchObject({
      command: "bun",
      args: ["run", "/path/to/tribe-bin.ts"],
      env: { TRIBE_SESSION_NAME: "alice" },
    })
  })

  test("cleanup removes the parent temp dir", () => {
    const { path, cleanup } = materializeMcpConfig([
      { name: "x", command: "true" },
    ])
    const dir = dirname(path)
    expect(existsSync(dir)).toBe(true)
    cleanup()
    expect(existsSync(dir)).toBe(false)
  })

  test("double cleanup is safe", () => {
    const { path, cleanup } = materializeMcpConfig([{ name: "x", command: "true" }])
    cleanup()
    cleanup() // must not throw
    expect(existsSync(path)).toBe(false)
  })

  test("empty env is omitted from the serialized entry", () => {
    const { path, cleanup } = materializeMcpConfig([{ name: "x", command: "bun" }])
    cleanupQueue.push(cleanup)
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      mcpServers: Record<string, { env?: unknown }>
    }
    expect(parsed.mcpServers.x?.env).toBeUndefined()
  })
})
