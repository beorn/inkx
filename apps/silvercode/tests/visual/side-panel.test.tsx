/**
 * Side panel region tests — mode row, version rows, cwd row.
 *
 * Catches: mode glyph typos, missing mode labels, Silver/Claude row
 * deletions, version block mispositioning. Uses `parseFrame` semantic
 * extraction so assertions survive layout shifts.
 */
import { describe, expect, test } from "vitest"
import type { AgentEvent, SessionId } from "@km/agent-harness"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { welcome } from "../../src/test/scripts/welcome.ts"
import { parseFrame, summarize } from "../../src/test/parse-frame.ts"
import { MODE_ICONS_EXPECTED, MODE_LABELS_EXPECTED } from "./_invariants.ts"

describe("side panel", () => {
  test("welcome scenario: side panel shows all expected rows", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
    const p = parseFrame(s)
    expect(p.sidePanel, `Side panel missing.\n${summarize(p)}`).not.toBeNull()
    expect(p.sidePanel!.sessionsHeadingRow, `Sessions heading missing`).toBeGreaterThanOrEqual(0)
    expect(p.sidePanel!.hasSilverCodeRow, `Silver Code brand row missing`).toBe(true)
    expect(p.sidePanel!.hasClaudeCodeRow, `Claude Code brand row missing`).toBe(true)
  })

  test("default mode is 'auto' with correct glyph and label", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
    const p = parseFrame(s)
    const row = p.sidePanel!.modeRow
    expect(row, `mode row not found in default scenario.\n${summarize(p)}`).not.toBeNull()
    expect(row!.label).toBe(MODE_LABELS_EXPECTED.auto)
    expect(row!.icon).toBe(MODE_ICONS_EXPECTED.auto)
  })

  test("side panel contains the cwd/branch row", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30, cwd: "/tmp/silvercode-test" })
    // The cwd row renders as the path. Check the side-panel text contains
    // our test cwd (short form; may be "~/..." if inside home). We passed
    // /tmp/... so no home substitution.
    const p = parseFrame(s)
    const panelText = (parsed: typeof p) => parsed.sidePanel!.lines.join("\n")
    expect(panelText(p)).toContain("/tmp/silvercode-test")
  })

  test("notification mute row labels debug like the other channel names", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
    const p = parseFrame(s)
    const panelText = p.sidePanel!.lines.join("\n")

    expect(panelText).toMatch(/\bdebug\b/)
    expect(panelText).not.toContain("Debug channel")
  })

  test("wrapped model label sits directly below the agent version row", async () => {
    const sessionId = "side-panel-model-wrap" as SessionId
    const script: AgentEvent[] = [
      {
        kind: "session-init",
        sessionId,
        cwd: "/tmp/fake",
        model: "claude-opus-4-7",
        mode: "auto",
        tools: ["Bash", "Read"],
        mcp_servers: [],
        slashCommands: [],
        skills: [],
        plugins: [],
        claudeCodeVersion: "2.1.132",
        apiKeySource: "OAuth",
        ts: 1000,
      },
    ]
    const s = await renderScenario({
      script,
      cols: 120,
      rows: 30,
      version: "2.1.132",
    })
    const p = parseFrame(s)
    const lines = p.sidePanel!.lines.map((line) => line.trimEnd())
    const agentRow = lines.findIndex((line) => line.includes("Claude Code v2.1.132"))
    const modelRow = lines.findIndex((line, i) => i > agentRow && line.includes("Opus 4.7"))

    expect(agentRow, `Claude Code row missing.\n${summarize(p)}`).toBeGreaterThanOrEqual(0)
    expect(modelRow, `Opus model row missing.\n${summarize(p)}`).toBeGreaterThanOrEqual(0)
    expect(modelRow).toBe(agentRow + 1)
  })
})
