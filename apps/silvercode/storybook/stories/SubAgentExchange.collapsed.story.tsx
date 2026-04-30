/**
 * <SubAgentExchange> — collapsed and expanded variants.
 *
 * A Task tool invocation renders as a collapsible block in the parent
 * conversation. The knob switches between collapsed (default), expanded
 * (shows nested stream), running (spinner), and failed (error accent).
 *
 * The nested stream is simulated with a few static Text rows — in a real
 * session it would be a live <SessionUpdateList>.
 */
import React from "react"
import { Box, Muted, Screen, Text } from "silvery"
import { SubAgentExchange } from "../../src/components/SubAgentExchange.tsx"
import type { Story } from "../types.ts"

export const subAgentExchangeCollapsed: Story = {
  id: "SubAgentExchange/collapsed",
  component: "SubAgentExchange",
  variant: "collapsed",
  description: "Task sub-agent block — collapsed / expanded / running / failed variants.",
  knobs: [
    {
      kind: "select",
      id: "state",
      label: "State",
      options: ["collapsed", "expanded", "running", "failed"],
      default: "collapsed",
    },
  ],
  render(knobs) {
    const state = knobs.state as string
    const running = state === "running"
    const failed = state === "failed"

    // Wrap the component in a stateful shell so "expanded" knob pre-opens it.
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" gap={1}>
          <Text bold color="$primary">
            You
          </Text>
          <Text>Run the full test suite and fix any failures you find.</Text>

          <SubAgentExchangeWrapper
            description="Run bun run test:fast and fix all failing tests in apps/silvercode/"
            running={running}
            failed={failed}
            defaultExpanded={state === "expanded"}
          />

          {!running && !failed && <Muted>Sub-agent completed in 47s · 3 files edited · 0 tests failing</Muted>}
        </Box>
      </Screen>
    )
  },
}

/**
 * Wrapper that forces the `expanded` state on mount so the knob can control
 * the initial render deterministically. SubAgentExchange manages its own
 * toggle state; we pass `defaultExpanded` via a key-based remount trick.
 */
function SubAgentExchangeWrapper({
  description,
  running,
  failed,
  defaultExpanded,
}: {
  description: string
  running: boolean
  failed: boolean
  defaultExpanded: boolean
}): React.ReactElement {
  return (
    <SubAgentExchange key={String(defaultExpanded)} description={description} running={running} failed={failed}>
      {/* Nested stream — static simulation */}
      <Box flexDirection="column" gap={0}>
        <Text color="$muted">Running bun run test:fast…</Text>
        <Text color="$muted"> ✓ storybook/registry.test.ts (12 tests)</Text>
        <Text color="$muted"> ✗ storybook/render.test.ts (2 failing)</Text>
        <Text color="$muted">Editing apps/silvercode/storybook/stories/ToolCall.read.story.tsx…</Text>
        <Text color="$success">All tests pass after fix.</Text>
      </Box>
    </SubAgentExchange>
  )
}
