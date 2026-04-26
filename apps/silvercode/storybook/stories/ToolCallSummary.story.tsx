/**
 * <ToolCallSummary> — aggregate "Read 12 files" with rolling count.
 *
 * Showcases the rolling AnimatedNumber count + breakdown popover. Click
 * the row to toggle the breakdown.
 */
import React, { useState } from "react"
import { ToolCallSummary } from "../../src/components/ToolCallSummary.tsx"
import type { Story } from "../types.ts"

function Demo({ count }: { count: number }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const breakdown = Array.from({ length: count }, (_, i) => ({
    id: `tc-${i}`,
    label: `src/file-${String(i + 1).padStart(2, "0")}.ts`,
  }))
  return (
    <ToolCallSummary
      kind="read"
      count={count}
      breakdown={breakdown}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    />
  )
}

export const toolCallSummary: Story = {
  id: "ToolCallSummary/read-files",
  component: "ToolCallSummary",
  variant: "read-files",
  description: "Aggregate read-tool calls — 'Read N files' with animated count + breakdown.",
  knobs: [
    {
      kind: "select",
      id: "size",
      label: "Count",
      options: ["1", "3", "12", "47"],
      default: "12",
    },
  ],
  render(knobs) {
    const count = Number.parseInt(String(knobs.size), 10)
    return <Demo count={count} />
  },
}
