/**
 * Smoke test — verifies renderScenario wires the real <App/> correctly
 * and parseFrame detects the expected regions. If these fail, the whole
 * visual-test layer is broken, not just one scenario.
 *
 * DON'T delete — this is the harness's self-test.
 */
import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { parseFrame, summarize } from "../../src/test/parse-frame.ts"
import { welcome } from "../../src/test/scripts/welcome.ts"
import { helloWorld } from "../../src/test/scripts/helloWorld.ts"
import { createStreamJsonParser, type AgentEvent } from "@km/agent-harness"

function parseLines(lines: readonly string[]): AgentEvent[] {
  const events: AgentEvent[] = []
  const parser = createStreamJsonParser((event) => events.push(event))
  for (const line of lines) parser.push(line)
  return events
}

describe("visual harness smoke test", () => {
  test("welcome scenario renders and parses", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
    const p = parseFrame(s)
    expect(p.welcome.visible, `Welcome not visible.\n${summarize(p)}`).toBe(true)
    expect(p.sidePanel, `Side panel absent.\n${summarize(p)}`).not.toBeNull()
    expect(p.sidePanel!.hasSilverCodeRow).toBe(true)
    expect(p.sidePanel!.hasClaudeCodeRow).toBe(true)
    expect(p.inputBox.present).toBe(true)
  })

  test("helloWorld scenario renders assistant block with ● glyph", async () => {
    const s = await renderScenario({ script: helloWorld, cols: 120, rows: 30 })
    const p = parseFrame(s)
    const assistants = p.blockStream.filter((b) => b.glyph === "•")
    expect(assistants.length, `No • found.\n${summarize(p)}`).toBeGreaterThan(0)
    expect(assistants[0]!.firstLineText).toContain("Hi")
  })

  test("assistant aggregate end_turn clears the activity tail", async () => {
    const prompt = "What are the top beads in terms of number of lines?"
    const script = parseLines([
      JSON.stringify({
        type: "user",
        sessionId: "smoke-aggregate",
        uuid: "user-1",
        message: { role: "user", content: prompt },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "smoke-aggregate",
        message: {
          id: "msg-final",
          role: "assistant",
          content: [{ type: "text", text: "Top beads by line count:\n\n1. `@km/beads.md` — 1,734 lines" }],
          stop_reason: "end_turn",
        },
      }),
    ])

    const s = await renderScenario({ script, cols: 120, rows: 30 })
    expect(s.text).toContain("Top beads by line count")
    expect(s.text).not.toContain("Chasing")
    expect(s.text).not.toContain("Thinking")
    expect(s.text.split(prompt).length - 1).toBe(1)
  })
})
