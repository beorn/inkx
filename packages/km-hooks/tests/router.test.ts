import { describe, expect, it } from "vitest"
import { defineListener, runIngest, runNotify } from "../src/index.ts"

describe("hook router", () => {
  it("dispatches to matching listener by event", async () => {
    let fired = false
    const listener = defineListener({
      name: "test",
      events: ["session_start"],
      handle: () => {
        fired = true
      },
    })
    const result = await runIngest([listener], "session_start", "claude")
    expect(fired).toBe(true)
    expect(result.listeners).toHaveLength(1)
    expect(result.listeners[0]?.status).toBe("ok")
  })

  it("skips listener when event does not match", async () => {
    let fired = false
    const listener = defineListener({
      name: "test",
      events: ["session_start"],
      handle: () => {
        fired = true
      },
    })
    const result = await runIngest([listener], "stop", "claude")
    expect(fired).toBe(false)
    expect(result.listeners).toHaveLength(0)
  })

  it("matches all events when listener has no event filter", async () => {
    let count = 0
    const listener = defineListener({
      name: "universal",
      handle: () => {
        count++
      },
    })
    await runIngest([listener], "session_start", "claude")
    await runIngest([listener], "stop", "claude")
    expect(count).toBe(2)
  })

  it("filters by source", async () => {
    let fired = false
    const listener = defineListener({
      name: "claude-only",
      sources: ["claude"],
      handle: () => {
        fired = true
      },
    })
    const wrongSource = await runIngest([listener], "session_start", "codex")
    expect(fired).toBe(false)
    expect(wrongSource.listeners).toHaveLength(0)

    const rightSource = await runIngest([listener], "session_start", "claude")
    expect(fired).toBe(true)
    expect(rightSource.listeners).toHaveLength(1)
  })

  it("isolates errors — one broken listener does not kill siblings", async () => {
    let goodFired = false
    const broken = defineListener({
      name: "broken",
      handle: () => {
        throw new Error("boom")
      },
    })
    const good = defineListener({
      name: "good",
      handle: () => {
        goodFired = true
      },
    })
    const result = await runIngest([broken, good], "session_start", "claude")
    expect(goodFired).toBe(true)
    expect(result.listeners.find((r) => r.name === "broken")?.status).toBe("error")
    expect(result.listeners.find((r) => r.name === "good")?.status).toBe("ok")
  })

  it("times out slow listeners without blocking siblings", async () => {
    const slow = defineListener({
      name: "slow",
      timeoutMs: 50,
      handle: () => new Promise((resolve) => setTimeout(resolve, 500)),
    })
    const fast = defineListener({
      name: "fast",
      handle: () => {
        // no-op
      },
    })
    const result = await runIngest([slow, fast], "session_start", "claude")
    expect(result.listeners.find((r) => r.name === "slow")?.status).toBe("timeout")
    expect(result.listeners.find((r) => r.name === "fast")?.status).toBe("ok")
    expect(result.totalMs).toBeLessThan(300)
  })

  it("notify never throws even if handler does", async () => {
    const broken = defineListener({
      name: "broken",
      handle: () => {
        throw new Error("boom")
      },
    })
    const result = await runNotify([broken], "pre_tool_use", "claude")
    expect(result.listeners[0]?.status).toBe("error")
  })

  it("notify uses a short default timeout", async () => {
    const slow = defineListener({
      name: "slow",
      handle: () => new Promise((resolve) => setTimeout(resolve, 500)),
    })
    const started = Date.now()
    const result = await runNotify([slow], "pre_tool_use", "claude")
    const elapsed = Date.now() - started
    expect(result.listeners[0]?.status).toBe("timeout")
    expect(elapsed).toBeLessThan(250)
  })

  it("passes enrichment fields to handler context", async () => {
    let received: { activityText?: string; toolName?: string; metadata?: unknown } = {}
    const listener = defineListener({
      name: "inspect",
      handle: (ctx) => {
        received = { activityText: ctx.activityText, toolName: ctx.toolName, metadata: ctx.metadata }
      },
    })
    await runIngest([listener], "pre_tool_use", "claude", {
      activityText: "editing foo.ts",
      toolName: "Edit",
      metadata: { extra: true },
    })
    expect(received.activityText).toBe("editing foo.ts")
    expect(received.toolName).toBe("Edit")
    expect(received.metadata).toEqual({ extra: true })
  })

  it("passes session and project context", async () => {
    let ctxSeen: { sessionId?: string; projectPath?: string } = {}
    const listener = defineListener({
      name: "ctx",
      handle: (ctx) => {
        ctxSeen = { sessionId: ctx.sessionId, projectPath: ctx.projectPath }
      },
    })
    await runIngest([listener], "session_start", "claude", {}, { sessionId: "abc123", projectPath: "/tmp/p" })
    expect(ctxSeen.sessionId).toBe("abc123")
    expect(ctxSeen.projectPath).toBe("/tmp/p")
  })
})
