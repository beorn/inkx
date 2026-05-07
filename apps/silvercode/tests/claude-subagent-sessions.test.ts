import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { readClaudeSubagentSessionsFromDir } from "../src/claude-subagent-sessions.ts"

function jsonlLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

describe("Claude subagent sidechain discovery", () => {
  test("summarizes sidechain meta files without loading them as parent transcript events", () => {
    const root = mkdtempSync(join(tmpdir(), "silvercode-subagents-"))
    try {
      const subagentsDir = join(root, "subagents")
      mkdirSync(subagentsDir, { recursive: true })
      for (const i of [1, 2, 3, 4]) {
        const id = `agent-a${i}`
        writeFileSync(
          join(subagentsDir, `${id}.meta.json`),
          JSON.stringify({ agentType: "general-purpose", description: `Sleep 20s #${i}` }),
        )
        writeFileSync(
          join(subagentsDir, `${id}.jsonl`),
          [
            jsonlLine({
              isSidechain: true,
              agentId: `a${i}`,
              type: "user",
              message: { role: "user", content: "sleep" },
              timestamp: `2026-05-07T06:43:0${i}.000Z`,
            }),
            jsonlLine({
              isSidechain: true,
              agentId: `a${i}`,
              type: "assistant",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "done" }],
                stop_reason: "end_turn",
              },
              timestamp: `2026-05-07T06:43:3${i}.000Z`,
            }),
          ].join(""),
        )
      }

      const summaries = readClaudeSubagentSessionsFromDir(subagentsDir)

      expect(summaries.map((summary) => `${summary.id}:${summary.description}:${summary.status}`)).toEqual([
        "a1:Sleep 20s #1:done",
        "a2:Sleep 20s #2:done",
        "a3:Sleep 20s #3:done",
        "a4:Sleep 20s #4:done",
      ])
      expect(summaries.every((summary) => summary.transcriptPath.endsWith(".jsonl"))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
