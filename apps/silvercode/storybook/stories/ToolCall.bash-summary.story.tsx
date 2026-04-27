/**
 * <ToolCall> — bash/execute kind with long stdout (summary-by-default).
 *
 * Demonstrates the summarization behaviour: a 28-line `ls` result is shown
 * with only the first 3 lines visible inline and the remaining 25 lines
 * collapsed behind a "25 more lines" Accordion. This matches the terse
 * rendering native Claude Code uses ("Listed 1 directory") while keeping the
 * full output accessible on demand.
 *
 * Bead: km-silvercode.thinking-loop-after-bash (Part B — verbose render).
 */
import React from "react"
import type { ToolCallId } from "@km/agent-harness"
import { ToolCall } from "../../src/components/ToolCall.tsx"
import type { Story } from "../types.ts"

const id = (s: string) => s as ToolCallId

/** Simulate a 28-entry `ls` of the km repo root — the exact scenario from the bug report. */
const LS_OUTPUT = [
  "AGENTS.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "README.md",
  "RESOLVER.md",
  "__fuzz_cases__",
  "apps",
  "benchmarks",
  "bun.lock",
  "docs",
  "flake.lock",
  "flake.nix",
  "hub",
  "node_modules",
  "oxlint.json",
  "package.json",
  "packages",
  "scripts",
  "tests",
  "tsconfig.json",
  "tsconfig.base.json",
  "vendor",
  "vitest.config.ts",
  "vitest.config.fast.ts",
  "vitest.config.slow.ts",
  "vitest.config.vendor.ts",
  "vitest.workspace.ts",
  ".gitmodules",
].join("\n")

export const toolCallBashSummary: Story = {
  id: "ToolCall/bash-summary",
  component: "ToolCall",
  variant: "bash-summary",
  description:
    "Execute-kind call with 28-line ls output. First 3 lines shown inline; remaining 25 behind a collapsed Accordion. Matches native Claude Code's terse style.",
  render() {
    return (
      <ToolCall
        toolCall={{
          toolCallId: id("story-bash-summary-1"),
          title: "ls",
          kind: "execute",
          status: "completed",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: LS_OUTPUT,
              },
            },
          ],
        }}
        defaultExpanded
      />
    )
  },
}
