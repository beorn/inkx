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
    const assistants = p.cardStream.filter((b) => b.glyph === "●")
    expect(assistants.length, `No ● found.\n${summarize(p)}`).toBeGreaterThan(0)
    expect(assistants[0]!.firstLineText).toContain("Hi")
  })
})
