import React from "react"
import { Box } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { AgentsPanel } from "./AgentsPanel.tsx"
import { TodoPanel } from "./TodoPanel.tsx"

/**
 * Combined right-side panel: Todos + Agents. Toggled by Cmd+I (or /panel,
 * /aside, /todos — all aliases for the same surface since the two groups
 * naturally share a narrow-width sidebar). Fixed flexBasis so the main
 * cards area keeps most of the width.
 */
export function SidePanel({ handle }: { handle: SessionHandle }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <TodoPanel handle={handle} />
      <AgentsPanel handle={handle} />
    </Box>
  )
}
