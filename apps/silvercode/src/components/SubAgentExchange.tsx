/**
 * <SubAgentExchange>
 *
 * Nested `SessionUpdate` stream for a Task tool invocation with sub-stream.
 *
 * When the agent fires a Task tool, the sub-agent produces its own
 * `SessionUpdate` stream that logically lives inside the parent session.
 * `SubAgentExchange` renders that nested stream as a collapsible block so
 * the user can see what the sub-agent did without it dominating the primary
 * conversation flow.
 *
 * The outer card:
 *   - Collapsed (default): shows the task description and final status.
 *   - Expanded: shows the nested stream inline (passed as `children`).
 *
 * Bead: km-silvercode.acp-session-update-list.
 */
import React, { useState } from "react"
import { Box, Muted, Text } from "silvery"
import { BoundedScroll } from "./BoundedScroll.tsx"
import { StatusGlyph } from "./StatusGlyph.tsx"

export interface SubAgentExchangeProps {
  /** Short description of the sub-agent task (from Task tool `description`). */
  description: string
  /** Whether the sub-agent is still running. Drives the spinner. */
  running?: boolean
  /** Whether the sub-agent task failed. */
  failed?: boolean
  /** Nested update stream rendered when expanded. */
  children?: React.ReactNode
}

export function SubAgentExchange({
  description,
  running = false,
  failed = false,
  children,
}: SubAgentExchangeProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = !!children
  const accentColor = failed ? "$error" : running ? "$accent" : "$muted"

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={expanded ? accentColor : "$border"}
        borderTop={false}
        borderBottom={false}
        borderRight={false}
        backgroundColor={expanded ? "$bg-surface-raised" : "$bg-surface-subtle"}
        onClick={hasChildren ? () => setExpanded((v) => !v) : undefined}
      >
        <Box flexDirection="row" gap={1}>
          <StatusGlyph glyph="↳" active={running} color={accentColor} />
          <Text bold color={failed ? "$error" : "$primary"}>
            Task
          </Text>
          <Box flexShrink={1} minWidth={0}>
            <Muted wrap={expanded ? "wrap" : "truncate"}>{description}</Muted>
          </Box>
          <Box flexGrow={1} />
        </Box>
        {expanded && children ? (
          <Box flexDirection="column">
            <BoundedScroll>{children}</BoundedScroll>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
