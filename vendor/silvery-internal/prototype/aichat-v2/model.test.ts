/**
 * Pure model tests — no React, no rendering, no framework.
 *
 * This is the testing story: createModel wraps the factory, and
 * `useChat.create()` gives isolated instances for each test.
 * No singletons, no cleanup between tests, no UI infrastructure.
 *
 * Compare with the current example where testing requires
 * createRenderer() or termless setup.
 *
 * These tests run in sub-millisecond time.
 */

import { describe, it, expect, afterEach } from "vitest"
import { useChat } from "./model.js"
import type { ChatModel } from "./model.js"
import { SCRIPT } from "../../../silvery/examples/interactive/aichat/script.js"

describe("createChat (via useChat.create)", () => {
  let chat: ChatModel

  afterEach(() => chat?.dispose())

  it("creates model with initial system exchange", () => {
    chat = useChat.create(SCRIPT, { fast: true })
    expect(chat.exchanges.value).toHaveLength(1)
    expect(chat.exchanges.value[0]!.role).toBe("system")
    expect(chat.exchanges.value[0]!.content).toContain("AI Chat v2")
  })

  it("submit adds user exchange", () => {
    chat = useChat.create(SCRIPT, { fast: true })
    chat.submit({ text: "hello" })
    expect(chat.exchanges.value).toHaveLength(2)
    expect(chat.exchanges.value[1]!.role).toBe("user")
    expect(chat.exchanges.value[1]!.content).toBe("hello")
  })

  it("submit ignores empty text", () => {
    chat = useChat.create(SCRIPT, { fast: true })
    chat.submit({ text: "   " })
    expect(chat.exchanges.value).toHaveLength(1) // only system
  })

  it("submit ignores when done", () => {
    chat = useChat.create(SCRIPT, { fast: true })
    chat.done.value = true
    chat.submit({ text: "hello" })
    expect(chat.exchanges.value).toHaveLength(1) // only system
  })

  it("respond streams agent content via async generator", async () => {
    chat = useChat.create([], { fast: true })
    const entry = { role: "agent" as const, content: "Hello world", tokens: { input: 100, output: 50 } }

    // Consume the generator — in fast mode, completes instantly
    for await (const _ of chat.respond(entry)) {
    }

    const last = chat.exchanges.value[chat.exchanges.value.length - 1]!
    expect(last.role).toBe("agent")
    expect(last.content).toBe("Hello world")
    expect(chat.phase.value).toBe("idle")
  })

  it("respond handles thinking phase", async () => {
    chat = useChat.create([], { fast: true })
    const entry = {
      role: "agent" as const,
      content: "Fixed the bug.",
      thinking: "Let me analyze the code...",
      tokens: { input: 200, output: 80 },
    }

    for await (const _ of chat.respond(entry)) {
    }

    const last = chat.exchanges.value[chat.exchanges.value.length - 1]!
    expect(last.thinking).toBe("Let me analyze the code...")
    expect(last.content).toBe("Fixed the bug.")
  })

  it("respond handles tool calls", async () => {
    chat = useChat.create([], { fast: true })
    const entry = {
      role: "agent" as const,
      content: "Looking at the file.",
      toolCalls: [{ tool: "Read", args: "src/auth.ts", output: ["export function login() {}"] }],
      tokens: { input: 300, output: 120 },
    }

    for await (const _ of chat.respond(entry)) {
    }

    const last = chat.exchanges.value[chat.exchanges.value.length - 1]!
    expect(last.toolCalls).toHaveLength(1)
    expect(last.toolCalls![0]!.tool).toBe("Read")
  })

  it("compact sets contextBaseline and resets", async () => {
    chat = useChat.create(SCRIPT, { fast: true })
    chat.submit({ text: "hello" })
    expect(chat.compacting.value).toBe(false)

    await chat.compact()

    expect(chat.compacting.value).toBe(false)
    expect(chat.contextBaseline.value).toBeGreaterThanOrEqual(0)
  })

  it("compact is no-op when already compacting", async () => {
    chat = useChat.create(SCRIPT, { fast: true })
    chat.compacting.value = true
    const baseline = chat.contextBaseline.value
    await chat.compact()
    expect(chat.contextBaseline.value).toBe(baseline) // unchanged
  })

  it("advance progresses through script", () => {
    chat = useChat.create(SCRIPT, { fast: true })
    const initialLen = chat.exchanges.value.length
    chat.advance()
    // Should have added at least the first user + agent exchange
    expect(chat.exchanges.value.length).toBeGreaterThan(initialLen)
  })

  it("getNextHint returns next scripted user message", () => {
    chat = useChat.create(SCRIPT, { fast: true })
    const hint = chat.getNextHint()
    // First script entry is a user message
    expect(hint).toBe(SCRIPT[0]!.content)
  })

  it("getNextHint returns empty when done", () => {
    chat = useChat.create(SCRIPT, { fast: true })
    chat.done.value = true
    expect(chat.getNextHint()).toBe("")
  })

  it("signals notify subscribers on change", () => {
    chat = useChat.create(SCRIPT, { fast: true })
    let notified = false
    const unsubscribe = chat.exchanges.subscribe(() => {
      notified = true
    })
    chat.submit({ text: "trigger" })
    expect(notified).toBe(true)
    unsubscribe()
  })
})
