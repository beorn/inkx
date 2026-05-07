import type { AgentSession } from "@km/agent-harness"
import { createTermless } from "@silvery/test"
import { afterEach, describe, expect, test } from "vitest"
import React from "react"
import { run } from "silvery/runtime"
import { App } from "../src/App.tsx"
import { installFakes, type InstalledFakes } from "../src/test/fake-boundaries.ts"

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function readScreenText(term: ReturnType<typeof createTermless>): string {
  const screen = term.screen as unknown as { text?: string; getText?: () => string }
  return typeof screen.getText === "function" ? screen.getText() : (screen.text ?? "")
}

describe("welcome pre-spawn logo", () => {
  let fakes: InstalledFakes | null = null

  afterEach(() => {
    fakes?.dispose()
    fakes = null
  })

  test("first content-bearing pre-session frame includes the logo while spawn is pending", async () => {
    fakes = installFakes({})
    using term = createTermless({ cols: 120, rows: 40 })
    const frames: string[] = []
    const poller = setInterval(() => frames.push(readScreenText(term)), 5)
    const pendingSession = new Promise<AgentSession>(() => undefined)

    const handle = await run(
      <App
        cwd="/tmp/silvercode-test"
        bare
        layout="single"
        agent="claude-code"
        model="claude-opus-4-7"
        spawnFactory={() => pendingSession}
      />,
      term,
    )

    try {
      await settle(120)
      const firstContent = frames.find((frame) => frame.replace(/\s+/gu, "").length > 0)
      expect(firstContent, frames.join("\n--- frame ---\n")).toBeDefined()
      expect(firstContent).toMatch(/[░▒▓█]/u)
      expect(firstContent).toContain("Claude Code")
    } finally {
      clearInterval(poller)
      handle.unmount()
    }
  })

  test("resumed pre-session loading frame includes the logo while replay/spawn is pending", async () => {
    fakes = installFakes({})
    using term = createTermless({ cols: 120, rows: 40 })
    const frames: string[] = []
    const poller = setInterval(() => frames.push(readScreenText(term)), 5)
    const pendingSession = new Promise<AgentSession>(() => undefined)

    const handle = await run(
      <App
        cwd="/tmp/silvercode-test"
        bare
        layout="single"
        agent="claude-code"
        model="claude-opus-4-7"
        resume="0e9413ff-5f95-43ad-a0fa-27bbfaa44dec"
        spawnFactory={() => pendingSession}
      />,
      term,
    )

    try {
      await settle(120)
      const firstContent = frames.find((frame) => frame.replace(/\s+/gu, "").length > 0)
      expect(firstContent, frames.join("\n--- frame ---\n")).toBeDefined()
      expect(firstContent).toMatch(/[░▒▓█]/u)
      expect(firstContent).toContain("Loading session")
    } finally {
      clearInterval(poller)
      handle.unmount()
    }
  })
})
