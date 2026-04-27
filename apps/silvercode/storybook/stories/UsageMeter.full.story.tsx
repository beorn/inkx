/**
 * UsageMeter family — all five sub-components in one story file.
 *
 * Components exercised:
 *   <UsageMeter>          — slim context-window progress bar
 *   <UsageBreakdown>      — collapsible accordion with per-category rows
 *   <UsageMetrics>        — compact cost + latency chip
 *   <StructuredQuestion>  — mid-turn question card (free-text + multi-choice variants)
 *   <StructuredAnswer>    — confirmed answer card
 *
 * All five read from the same `UsageUpdate` fixture. The knob controls which
 * fill level (low / medium / high) is shown so colour transitions are visible.
 *
 * Bead: km-silvercode.acp-comp-stories.
 */
import React from "react"
import { Box, Screen } from "silvery"
import type { UsageUpdate } from "@km/agent-harness"
import {
  UsageMeter,
  UsageBreakdown,
  UsageMetrics,
  StructuredQuestion,
  StructuredAnswer,
} from "../../src/components/UsageMeter.tsx"
import type { Story } from "../types.ts"

function makeUsage(pct: number): UsageUpdate {
  const size = 200_000
  return {
    size,
    used: Math.round(size * pct),
    cost: { amount: 0.0124 * pct, currency: "USD" },
  }
}

const BREAKDOWN_ROWS = [
  { label: "System prompt", tokens: 18_432 },
  { label: "Tool schemas", tokens: 6_400 },
  { label: "Conversation", tokens: 0 /* filled per variant */ },
  { label: "Pending output", tokens: 1_024 },
]

export const usageMeterFull: Story = {
  id: "UsageMeter/full",
  component: "UsageMeter",
  variant: "full",
  description: "All five UsageMeter-family components across low/medium/high fill levels.",
  knobs: [
    {
      kind: "select",
      id: "fill",
      label: "Fill level",
      options: ["low (42%)", "medium (72%)", "high (91%)"],
      default: "medium (72%)",
    },
    {
      kind: "toggle",
      id: "breakdownExpanded",
      label: "Breakdown expanded",
      default: true,
    },
    {
      kind: "select",
      id: "questionVariant",
      label: "StructuredQuestion variant",
      options: ["free-text", "multi-choice"],
      default: "multi-choice",
    },
  ],
  render(knobs) {
    const fillLabel = knobs.fill as string
    const pct = fillLabel.startsWith("low") ? 0.42 : fillLabel.startsWith("medium") ? 0.72 : 0.91
    const breakdownExpanded = knobs.breakdownExpanded as boolean
    const questionVariant = knobs.questionVariant as string

    const usage = makeUsage(pct)
    const rows = BREAKDOWN_ROWS.map((r, i) =>
      i === 2
        ? {
            ...r,
            tokens:
              usage.used -
              BREAKDOWN_ROWS.slice(0, 2).reduce((acc, r2) => acc + r2.tokens, 0) -
              (BREAKDOWN_ROWS[3]?.tokens ?? 0),
          }
        : r,
    )

    const options =
      questionVariant === "multi-choice"
        ? [
            { id: "approve", label: "Approve once", description: "Allow this single invocation" },
            { id: "approve-all", label: "Approve for session", description: "Skip future prompts this session" },
            { id: "deny", label: "Deny", description: "Block the tool call" },
          ]
        : undefined

    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" gap={2} padding={2}>
          {/* UsageMeter — slim bar */}
          <Box flexDirection="column" gap={0}>
            <Box>
              <UsageMeter usage={usage} width={24} />
            </Box>
          </Box>

          {/* UsageBreakdown — collapsible accordion */}
          <UsageBreakdown usage={usage} rows={rows} defaultExpanded={breakdownExpanded} />

          {/* UsageMetrics — cost + latency chip */}
          <UsageMetrics usage={usage} latencyMs={1_420} />

          {/* StructuredQuestion */}
          <StructuredQuestion
            question="The test file uses a deprecated API. How should I proceed?"
            options={options}
            highlightedIndex={0}
          />

          {/* StructuredAnswer */}
          <StructuredAnswer
            question="The test file uses a deprecated API. How should I proceed?"
            answer={
              questionVariant === "multi-choice" ? "Approve once" : "Update the test to use the new createRenderer API."
            }
          />
        </Box>
      </Screen>
    )
  },
}
