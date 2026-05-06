import { describe, expect, test } from "vitest"
import {
  type AgentColorizer,
  formatAgentBrief,
  formatAgentStatus,
  plainColorizer,
} from "../src/format.ts"
import type { Agent } from "../src/types.ts"

const tagColorizer: AgentColorizer = {
  cyan: (s) => `<cy>${s}</cy>`,
  dim: (s) => `<d>${s}</d>`,
  green: (s) => `<g>${s}</g>`,
  yellow: (s) => `<y>${s}</y>`,
  gray: (s) => `<gr>${s}</gr>`,
  red: (s) => `<r>${s}</r>`,
}

const baseAgent: Agent = {
  id: "01J0000000000000000000AGNT",
  shortId: "agent-abcd",
  name: "Reviewer",
  model: "claude-sonnet-4",
  harness: "general",
  status: "idle",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

describe("formatAgentStatus", () => {
  test("returns one glyph per status (plain)", () => {
    expect(formatAgentStatus("idle")).toBe("○")
    expect(formatAgentStatus("running")).toBe("●")
    expect(formatAgentStatus("paused")).toBe("◐")
    expect(formatAgentStatus("stopped")).toBe("○")
    expect(formatAgentStatus("error")).toBe("✗")
  })

  test("applies the colorizer for each status", () => {
    expect(formatAgentStatus("idle", tagColorizer)).toBe("<d>○</d>")
    expect(formatAgentStatus("running", tagColorizer)).toBe("<g>●</g>")
    expect(formatAgentStatus("paused", tagColorizer)).toBe("<y>◐</y>")
    expect(formatAgentStatus("stopped", tagColorizer)).toBe("<gr>○</gr>")
    expect(formatAgentStatus("error", tagColorizer)).toBe("<r>✗</r>")
  })

  test("plainColorizer is identity", () => {
    expect(plainColorizer.cyan("x")).toBe("x")
    expect(plainColorizer.dim("x")).toBe("x")
  })
})

describe("formatAgentBrief", () => {
  test("default: one line, no model/harness (bd agent ls shape)", () => {
    const lines = formatAgentBrief(baseAgent)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe("○ agent-abcd Reviewer")
  })

  test("withModelHarness: two lines (km agent ls shape)", () => {
    const lines = formatAgentBrief(baseAgent, plainColorizer, { withModelHarness: true })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe("○ agent-abcd Reviewer")
    expect(lines[1]).toBe("   claude-sonnet-4 / general")
  })

  test("appends current task when present", () => {
    const lines = formatAgentBrief({ ...baseAgent, currentTaskId: "km-q5h3" })
    expect(lines[0]).toBe("○ agent-abcd Reviewer → km-q5h3")
  })

  test("colorizer wraps shortId, status glyph, task suffix, model line", () => {
    const lines = formatAgentBrief(
      { ...baseAgent, status: "running", currentTaskId: "km-q5h3" },
      tagColorizer,
      { withModelHarness: true },
    )
    expect(lines[0]).toBe("<g>●</g> <cy>agent-abcd</cy> Reviewer<d> → km-q5h3</d>")
    expect(lines[1]).toBe("<d>   claude-sonnet-4 / general</d>")
  })
})
