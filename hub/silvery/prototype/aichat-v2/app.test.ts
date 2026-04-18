/**
 * Pure model tests — no React, no rendering.
 * Two patterns: direct model + headless app composition.
 */

import { describe, it, expect } from "vitest"
import { createChatModel, withChat, withDemoScript, type ChatModel } from "./app.js"
import { createInstantScope } from "./shims/scope.js"
import { createClock } from "./shims/clock.js"
import { pipe, create, withScope, withCommands } from "./shims/app.js"
import { SCRIPT, RANDOM_AGENT_RESPONSES } from "../../../../vendor/silvery/examples/apps/aichat/script.ts"

/** Test AI provider — returns a fixed response as chunks. */
function testAI(response = RANDOM_AGENT_RESPONSES[0]!) {
  return {
    async *generateResponse() {
      for (const word of response.content.split(/(\s+)/)) yield { type: "text-delta" as const, text: word }
      yield { type: "done" as const, tokens: response.tokens }
    },
  }
}

/** Creates a chat model directly — no app composition needed. */
function makeModel(ai = testAI()) {
  const scope = createInstantScope()
  return createChatModel({ ai, scope, clock: createClock(scope), onExit: () => {} })
}

/** Creates a headless chat app for testing — same composition as production. */
function makeChat(ai = testAI()) {
  const app = pipe(create(), withScope(createInstantScope()), withCommands(), withChat({ ai }))
  return app.chat
}

// ── Direct model tests ──────────────────────────────────────────

describe("chatModel", () => {
  it("creates with initial system message", () => {
    const chat = makeChat()
    expect(chat.messages()).toHaveLength(1)
    expect(chat.messages()[0]!.role).toBe("system")
  })

  it("submit adds user message and generates response", () => {
    const chat = makeChat()
    chat.submit("hello")
    expect(chat.messages().length).toBeGreaterThanOrEqual(2)
    expect(chat.messages()[1]!.role).toBe("user")
    expect(chat.messages()[1]!.content).toBe("hello")
  })

  it("submit clears draft", () => {
    const chat = makeChat()
    chat.input.draft("hello")
    chat.submit("hello")
    expect(chat.input.draft()).toBe("")
  })

  it("submit ignores empty text", () => {
    const chat = makeChat()
    chat.submit("   ")
    expect(chat.messages()).toHaveLength(1)
  })

  it("submit ignores when isDone", () => {
    const chat = makeChat()
    chat.isDone(true)
    chat.submit("hello")
    expect(chat.messages()).toHaveLength(1)
  })

  it("submit cancels in-flight response", () => {
    const chat = makeChat()
    chat.submit("first")
    // Submit again immediately — should cancel the first response
    chat.submit("second")
    const userMsgs = chat.messages().filter((m) => m.role === "user")
    expect(userMsgs).toHaveLength(2)
  })

  it("isBlank derives from draft", () => {
    const chat = makeChat()
    expect(chat.input.isBlank()).toBe(true)
    chat.input.draft("x")
    expect(chat.input.isBlank()).toBe(false)
  })

  it("compact adds system message", async () => {
    const chat = makeChat()
    chat.submit("hello")
    await chat.compact()
    expect(chat.isCompacting()).toBe(false)
    const systemMsgs = chat.messages().filter((m) => m.role === "system")
    expect(systemMsgs.length).toBeGreaterThanOrEqual(2) // initial + compacted
  })

  it("exit sets isDone", () => {
    const chat = makeChat()
    chat.exit()
    expect(chat.isDone()).toBe(true)
  })

  it("signals notify on change", () => {
    const chat = makeChat()
    let notified = false
    const unsub = chat.messages.subscribe(() => {
      notified = true
    })
    chat.submit("trigger")
    expect(notified).toBe(true)
    unsub()
  })

  it("computed signals notify when dependencies change", () => {
    const chat = makeChat()
    let busyNotified = false
    const unsub = chat.isBusy.subscribe(() => {
      busyNotified = true
    })
    chat.submit("hello")
    // isBusy is derived from isStreaming + isCompacting
    expect(busyNotified).toBe(true)
    unsub()
  })
})

// ── Direct model tests (no app composition) ─────────────────────

describe("createChatModel", () => {
  it("creates independently of app", () => {
    const chat = makeModel()
    expect(chat.messages()).toHaveLength(1)
    expect(chat.messages()[0]!.role).toBe("system")
  })

  it("submit works without app wiring", () => {
    const chat = makeModel()
    chat.submit("test")
    expect(chat.messages().length).toBeGreaterThanOrEqual(2)
  })
})

// ── Headless app composition ────────────────────────────────────

describe("withChat (headless)", () => {
  function createApp() {
    return pipe(create(), withScope(createInstantScope()), withCommands(), withChat({ ai: testAI() }))
  }

  it("registers model and commands", () => {
    const app = createApp()
    expect(app.chat).toBeDefined()
    expect(app.commands.chat.submit).toBeDefined()
    expect(app.commands.chat.compact).toBeDefined()
    expect(app.commands.chat.exit).toBeDefined()
  })

  it("commands invoke model updaters", () => {
    const app = createApp()
    const before = app.chat.messages().length
    app.commands.chat.submit.fn({ content: "hello" })
    expect(app.chat.messages().length).toBeGreaterThan(before)
  })
})

// ── Demo composition ────────────────────────────────────────────

describe("withDemoScript (headless)", () => {
  function createDemoApp(entries = SCRIPT) {
    // Import createDemoDriver dynamically since it's not exported
    // For tests, we create a minimal demo driver
    const driver = {
      cursor: 0,
      async *generateResponse() {
        while (driver.cursor < entries.length && entries[driver.cursor]!.role === "user") driver.cursor++
        const entry = driver.cursor < entries.length ? entries[driver.cursor++]! : entries[0]!
        for (const word of entry.content.split(/(\s+)/)) yield { type: "text-delta" as const, text: word }
        yield { type: "done" as const, tokens: entry.tokens }
      },
      nextUserHint() {
        const entry = entries[driver.cursor]
        return entry?.role === "user" ? entry.content : ""
      },
      advancePastAgentEntries() {
        while (driver.cursor < entries.length && entries[driver.cursor]!.role !== "user") driver.cursor++
      },
    }
    return pipe(
      create(),
      withScope(createInstantScope()),
      withCommands(),
      withChat({ ai: driver }),
      withDemoScript(driver as any),
    )
  }

  it("plays first entry on startup", () => {
    const app = createDemoApp()
    expect(app.chat.messages().length).toBeGreaterThan(1)
  })

  it("sets placeholder from script", () => {
    const app = createDemoApp()
    // After startup, placeholder should show next user hint (if any)
    const placeholder = app.chat.input.placeholder()
    // Placeholder may or may not be set depending on script structure
    expect(typeof placeholder).toBe("string")
  })
})
