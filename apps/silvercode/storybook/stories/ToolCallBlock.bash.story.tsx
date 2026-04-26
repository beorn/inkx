/**
 * ToolCallBlock — Bash command (completed).
 *
 * The most common tool call: a Bash invocation rendered with the
 * command summary visible inline. Result handling is owned by
 * MessageList in real usage; this story focuses on the call card alone.
 */
import React from "react"
import { ToolCallBlock } from "../../src/components/ToolCallBlock.tsx"
import type { Story } from "../types.ts"

export const toolCallBlockBash: Story = {
  id: "ToolCallBlock/bash",
  component: "ToolCallBlock",
  variant: "bash",
  description: "Bash invocation with one-line command summary.",
  knobs: [
    {
      kind: "select",
      id: "command",
      label: "Command",
      options: ["short", "long", "pipeline"],
      default: "short",
    },
  ],
  render(knobs) {
    const command =
      knobs.command === "long"
        ? "find . -type f -name '*.ts' | head -20 | xargs wc -l | sort -rn"
        : knobs.command === "pipeline"
          ? "git log --oneline | head -50 | grep -v 'Merge' | awk '{print $1}'"
          : "ls -la"
    return <ToolCallBlock id="story-bash-1" name="Bash" input={{ command, description: "list files" }} />
  },
}
