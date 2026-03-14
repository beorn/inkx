/**
 * Pure model tests — no React, no rendering, no framework.
 *
 * `useChat.create()` gives isolated instances for each test.
 * No singletons, no cleanup, no UI infrastructure.
 * Sub-millisecond execution.
 *
 * Tests use instant scopes — all sleeps resolve immediately.
 * Scope is passed via ModelContext — no ambient lookup needed.
 */

import { describe, it, expect } from "vitest"
import { useChat } from "./model.js"
import { invoke } from "./app.js"
import { createInstantScope } from "./scope.js"
import { SCRIPT } from "../../../silvery/examples/interactive/aichat/script.js"

/** Create a chat model with an instant scope — timing trickery for tests. */
function createChat(script = SCRIPT) {
  return useChat.create({ scope: createInstantScope() }, script)
}

describe("createChat", () => {
  it("creates model with initial system message", () => {
    const chat = createChat()
    expect(chat.messages.value).toHaveLength(1)
    expect(chat.messages.value[0]!.role).toBe("system")
    expect(chat.messages.value[0]!.content).toContain("AI Chat v2")
  })

  it("submit via invoke adds user message", () => {
    const chat = createChat()
    invoke({ command: chat.commands.submit, args: { text: "hello" } })
    expect(chat.messages.value).toHaveLength(2)
    expect(chat.messages.value[1]!.role).toBe("user")
    expect(chat.messages.value[1]!.content).toBe("hello")
  })

  it("submit ignores empty text", () => {
    const chat = createChat()
    chat.commands.submit.fn({ text: "   " })
    expect(chat.messages.value).toHaveLength(1)
  })

  it("submit ignores when done", () => {
    const chat = createChat()
    chat.done.value = true
    chat.commands.submit.fn({ text: "hello" })
    expect(chat.messages.value).toHaveLength(1)
  })

  it("respond streams agent content via async generator", async () => {
    const chat = createChat([])
    const entry = { role: "agent" as const, content: "Hello world", tokens: { input: 100, output: 50 } }

    for await (const _ of chat.respond(entry)) {
      /* drain */
    }

    const last = chat.messages.value.at(-1)!
    expect(last.role).toBe("agent")
    expect(last.content).toBe("Hello world")
    expect(chat.phase.value).toBe("idle")
  })

  it("respond handles thinking phase", async () => {
    const chat = createChat([])
    const entry = {
      role: "agent" as const,
      content: "Fixed the bug.",
      thinking: "Let me analyze the code...",
      tokens: { input: 200, output: 80 },
    }

    for await (const _ of chat.respond(entry)) {
      /* drain */
    }

    const last = chat.messages.value.at(-1)!
    expect(last.thinking).toBe("Let me analyze the code...")
    expect(last.content).toBe("Fixed the bug.")
  })

  it("respond handles tool calls", async () => {
    const chat = createChat([])
    const entry = {
      role: "agent" as const,
      content: "Looking at the file.",
      toolCalls: [{ tool: "Read", args: "src/auth.ts", output: ["export function login() {}"] }],
      tokens: { input: 300, output: 120 },
    }

    for await (const _ of chat.respond(entry)) {
      /* drain */
    }

    const last = chat.messages.value.at(-1)!
    expect(last.toolCalls).toHaveLength(1)
    expect(last.toolCalls![0]!.tool).toBe("Read")
  })

  it("compact sets contextBaseline and resets", async () => {
    const chat = createChat()
    chat.commands.submit.fn({ text: "hello" })
    expect(chat.compacting.value).toBe(false)

    await chat.commands.compact.fn()

    expect(chat.compacting.value).toBe(false)
    expect(chat.contextBaseline.value).toBeGreaterThanOrEqual(0)
  })

  it("compact is no-op when already compacting", async () => {
    const chat = createChat()
    chat.compacting.value = true
    const baseline = chat.contextBaseline.value
    await chat.commands.compact.fn()
    expect(chat.contextBaseline.value).toBe(baseline)
  })

  it("advance progresses through script", () => {
    const chat = createChat()
    const initialLen = chat.messages.value.length
    chat.advance()
    expect(chat.messages.value.length).toBeGreaterThan(initialLen)
  })

  it("getNextHint returns next scripted user message", () => {
    const chat = createChat()
    expect(chat.getNextHint()).toBe(SCRIPT[0]!.content)
  })

  it("getNextHint returns empty when done", () => {
    const chat = createChat()
    chat.done.value = true
    expect(chat.getNextHint()).toBe("")
  })

  it("signals notify subscribers on change", () => {
    const chat = createChat()
    let notified = false
    const unsubscribe = chat.messages.subscribe(() => {
      notified = true
    })
    chat.commands.submit.fn({ text: "trigger" })
    expect(notified).toBe(true)
    unsubscribe()
  })
})
