/**
 * ToolCallBlock — running (no result yet).
 *
 * Demonstrates the in-progress visualization (`running={true}`). The
 * spinner fires from the leading-glyph slot until a tool result arrives.
 */
import React from "react"
import { ToolCallBlock } from "../../src/components/ToolCallBlock.tsx"
import type { Story } from "../types.ts"

export const toolCallBlockRunning: Story = {
  id: "ToolCallBlock/running",
  component: "ToolCallBlock",
  variant: "running",
  description: "In-flight tool call — spinner instead of glyph.",
  knobs: [
    {
      kind: "select",
      id: "tool",
      label: "Tool",
      options: ["Bash", "Grep", "Read", "WebFetch"],
      default: "Bash",
    },
  ],
  render(knobs) {
    const tool = knobs.tool as string
    const input =
      tool === "Bash"
        ? { command: "bun fix && bun run test:fast" }
        : tool === "Grep"
          ? { pattern: "createFakeAcpSession" }
          : tool === "Read"
            ? { file_path: "/Users/test/repo/CLAUDE.md" }
            : { url: "https://example.com/api/users" }
    return <ToolCallBlock id={`story-${tool}-running`} name={tool} input={input} running />
  },
}
